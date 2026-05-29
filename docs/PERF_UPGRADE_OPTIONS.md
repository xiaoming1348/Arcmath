# Perf upgrade options

> Written 2026-05-28 after a day of incremental fixes (DB keep-alive,
> nginx TLS / micro-cache, parallel Prisma queries, loading skeletons).
> Those landed measurable savings (~600ms per page for logged-in users,
> ~300ms for anonymous) but did not change the underlying topology.
>
> This doc compares the next-tier moves so we can pick deliberately.

## Current topology (baseline)

```
Browser (CN, ~30-80ms RTT to HK)  ─┐
Browser (US, ~150-300ms RTT)      ─┤   ┌──── Neon DB (us-east-1)
Browser (EU)                       ├──▶│     RTT HK ↔ us-east-1 ≈ 200ms
                                  ─┤   └──── OpenAI / Resend (US)
                                   ▼
                          HK VPS (47.76.201.152)
                          - nginx + Next.js
                          - 2 PM2 workers
                          - Aliyun ECS, ~$30/mo
```

The hot edges:

- **Browser ↔ HK VPS**: 1 RTT for connect, 1 for TLS, 1 for HTTP request,
  1 for first byte → 4 × RTT per fresh navigation.
- **HK VPS ↔ Neon (us-east-1)**: 200ms per DB query. A page with 5
  serial queries adds 1 second of pure travel time.

The optimizations we shipped today reduce the **server-side processing
cost** but cannot reduce the **HK ↔ us-east-1 travel cost**. That's
~200ms × N queries baked into every logged-in page render.

---

## Option A — Cloudflare in front

Put Cloudflare between the user and the HK VPS, for free.

**What it does**

- TLS termination at the closest CF edge to the user (Hong Kong / Singapore
  / Frankfurt / San Jose — they all exist). The user's TCP+TLS handshake
  hits a node ~20-50ms away instead of the HK VPS ~150-300ms away.
- HTTP cache for static assets (images, JS bundles, fonts) with 1y
  immutable cache, served from CF edge.
- Brotli compression (better than nginx gzip).
- The CF edge talks to our HK origin over a warm-kept connection. Origin
  fetch is still HK ↔ us-east-1 distance, but at least the user's
  perceived TCP+TLS handshake is fast.

**Numbers**

| Metric                          | Now    | With CF | Delta  |
|---------------------------------|-------:|--------:|-------:|
| TCP+TLS (CN user)               | 120ms  |   30ms  |  −75%  |
| TCP+TLS (US user, owner case)   | 700ms  |  100ms  |  −86%  |
| Static asset RTT                | 200ms  |   20ms  |  −90%  |
| DB-driven page server time      | 300ms+ |  300ms+ |   0    |

CF doesn't help with DB latency at all, but for **first-paint perception**
and **static-asset waterfall** it's an enormous win.

**Cost / effort**

- Free tier: $0/mo, covers everything we need (TLS, CDN, basic WAF,
  unlimited bandwidth).
- Setup time: 2 hours (point DNS to CF, set "DNS-only" → "Proxied" once
  origin is reachable, install CF origin cert in nginx).
- Operational risk: low. CF lets you toggle proxied/unproxied per record;
  if anything breaks we flip back to direct.

**Downsides**

- Origin IP is still public if anyone resolves the apex; we'd want to
  block direct IP access via nginx `if ($http_host != cf-hostname)` to
  prevent users bypassing CF.
- The DB-latency problem still exists for logged-in users (their pages
  still wait on us-east-1).
- Mainland China access through Cloudflare is **inconsistent without
  the China Network plan ($1200/mo)** — CF edges aren't in mainland CN,
  so users go through HK or SG CF nodes, which is *fine* but doesn't
  beat the existing HK-direct path for CN users.

**Verdict**: do this. Big win for international + US users, marginal for
CN mainland users. Free, low-risk.

---

## Option B — Migrate Neon DB to ap-southeast-1 (Singapore)

Neon supports per-project region selection. The current DB is in
`us-east-1` because that was the default when we provisioned. Moving
to `ap-southeast-1` puts the DB ~30ms from HK VPS instead of ~200ms.

**Numbers**

| Page type                       | Now | After | Delta  |
|---------------------------------|----:|------:|-------:|
| 1-query page (e.g. login form)  | 1.2s| 1.05s |  −15%  |
| 5-query page (e.g. /me/progress)| 2.0s| 1.05s |  −47%  |
| 10-query page (worst hot path)  | 3.2s| 1.1s  |  −66%  |

Page render time drops ~170ms per query saved. For a logged-in user
loading the dashboard, this is the most impactful single change.

**Cost / effort**

- $0/mo extra (Neon Free + Pro tiers both let you pick region at
  project create-time).
- Migration is one-way: spin up a new project in `ap-southeast-1`,
  `pg_dump` from current, `pg_restore` to new, swap `DATABASE_URL` in
  `.env.local`, redeploy. ~30min downtime if we coordinate it.
- Operational risk: medium. We need to test that the new connection
  string works through the pgbouncer pooler, that our prisma migrations
  apply cleanly to the fresh DB, and that nothing in the app depends
  on us-east-1 specifically. Also lose any continuous-archive history.

**Downsides**

- LLM calls (OpenAI) are still us-east. So calls to the grading judge
  / hint tutor / OCR remain ~200ms away. That's the SECOND biggest
  fixed cost.
- One-time migration risk: if pg_restore is partial, debugging a
  fresh broken DB is more invasive than a config change.

**Verdict**: high-value. Plan it for a low-traffic window (early
morning HK time = late evening CN), do a dry run, then cut over. Best
done after Option A (so users aren't simultaneously affected by both
changes).

---

## Option C — Upgrade VPS specs

The HK VPS is a 2-vCPU / 4GB Aliyun ECS, ~$30/mo. We could bump to
4-vCPU / 8GB for ~$60/mo.

**Numbers**

Almost nothing changes. PM2 logs show CPU idle most of the time even
under load. The bottleneck is network latency, not VPS compute.

**Verdict**: skip. Pure waste at our scale.

---

## Option D — Vercel + Edge Runtime

Re-host Next.js on Vercel, with the Edge runtime for ISR-able routes.
Marketing + auth pages would run at edge nodes worldwide.

**Numbers**

| Metric                          | Now    | Vercel Edge | Delta |
|---------------------------------|-------:|------------:|------:|
| Anonymous landing TTFB (any)    | 700ms  | ~50ms       | −93%  |
| Logged-in DB page (CN user)     | 700ms  | ~500ms      | −28%  |
| Logged-in DB page (US user)     | 1.5s   | ~700ms      | −53%  |

Marketing pages would basically render instantly. DB-driven pages still
wait on Neon (us-east-1) but at least the SSR happens close to the user.

**Cost / effort**

- Vercel hobby: free for personal projects. Pro: $20/mo per member +
  usage. For pilot scale, ~$25-50/mo realistic.
- 3-5 days of refactor: route segments need to declare runtime; some
  Node-only APIs (Buffer, FS) need swapping; Prisma client needs
  Prisma Accelerate or `@prisma/adapter-neon` for HTTP fetch.
- Operational risk: high. Vercel's Edge runtime is a different beast
  from Node; existing code that touches `fs`, `crypto.randomBytes`,
  WebSocket, etc., needs auditing.

**Downsides**

- Vercel has limited free egress on hobby plan; Pro is pay-per-use.
- We give up our HK VPS as the source of truth; if Vercel has an outage
  the whole site goes dark.
- Lock-in. Migrating off Vercel later is non-trivial.

**Verdict**: skip for now. Worth revisiting if A+B isn't enough and we
have real US/EU traffic. Don't do this just for CN users — Vercel's
mainland CN edge presence is also weak.

---

## Recommended order

1. **This weekend**: do Option A (Cloudflare). Free, ~2 hours, big win
   for everyone except mainland-CN users (and even they get faster
   static assets).
2. **Next week**: do Option B (Neon to ap-southeast-1). After A is
   stable. Schedule the migration for 06:00-08:00 HK time.
3. **Skip C** unless we see actual CPU saturation in pm2 logs.
4. **Defer D** until pilot has international traction.

The combined effect of A+B:

| Page                                | Now    | After A+B | Improvement |
|-------------------------------------|-------:|----------:|------------:|
| Anonymous landing TTFB (CN)         | 420ms  | 150ms     | −64%        |
| Anonymous landing TTFB (US owner)   | 1200ms | 200ms     | −83%        |
| Logged-in /me/progress (CN)         | 1500ms | 400ms     | −73%        |
| Logged-in /problems set list (CN)   | 1100ms | 350ms     | −68%        |

That's the realistic ceiling without rebuilding the stack. Beyond A+B
you start trading dollars or architectural complexity for sub-100ms
gains, which is rarely worth it at our stage.
