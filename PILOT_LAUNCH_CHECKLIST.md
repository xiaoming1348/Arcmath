# Pilot launch checklist — Monday target

> Status: prep (2026-05-13). The B1 individual flow + B2 school flow
> are both in place. This doc lists every thing that has to be true
> before we open registration to outside users.

---

## 1. B1 individual flow — registration → solve → report

### Code state

| Path | Status | Notes |
|---|---|---|
| `/register` | ✅ v3 design | Florid headline, hairline card, inline error/success states, autocomplete attrs set |
| `/login` | ✅ v3 design | Two-column editorial layout, brand-blue link accents, proper `autocomplete="current-password"` |
| `/login/set-password` | ✅ v3 design | Same Eyebrow + florid headline + hero-panel + input-field tokens as `/login`. Verified 2026-05-18. |
| `/problems`, `/problems/[problemId]` | ✅ uses surface-card | Inherits new tokens automatically. Visual audit recommended. |
| `unified-practice-workspace` | ✅ v3 + animations | Step VERIFIED stamp, hint reveal, hairline cards |
| `/reports` | ✅ v3 redesign | Big accuracy %, Brilliant tile breakdown, animated reveal |

### Smoke test ritual before launch

Run on Mac, in a fresh incognito window, with the new dev server:

```
1. Register     — new email, password ≥ 8 chars
   → assert: redirected to /login, success banner shown
2. Login        — same credentials
   → assert: lands on /dashboard or /student (depending on org membership)
3. /problems    — pick any AMC8/AMC10 set
   → assert: problem statement renders, KaTeX math visible
4. Solve        — input an answer (right and wrong), submit
   → assert: verdict pill animates in, feedback text shown
5. Solve proof  — pick a PROOF problem, add 2-3 steps, submit
   → assert: per-step verdict + final overall review
6. /reports     — open
   → assert: accuracy %, outcome tiles, question review cards
```

If any of the 6 fails, stop and ship a fix.

### Known UX polish items (nice-to-have, not blockers)

- Forgot-password flow doesn't exist. Workaround: ask user to use
  `/login/set-password` (the same form is reused for setting an
  initial password) — that's not obvious from the current copy.
  **Action**: rename the link to "Forgot password? Set a new one".

---

## 2. China access (Vercel routing issue)

### Background

Vercel's edge network does serve traffic to mainland China, but:

- DNS resolution is often blocked or throttled
- TLS handshakes are slow (200-500ms extra)
- Some ISPs (China Mobile in particular) route requests via overseas
  links, adding 600-1200ms per request

For a small pilot (≤ 200 users), this is borderline tolerable. For a
public launch, it is not.

### Three options, in order of effort

#### Option A — Cloudflare in front of Vercel (CHEAPEST, ~20 min)

1. Move DNS for `arcmath.cn` (or whatever the production domain is) to
   Cloudflare. (Free tier.)
2. Create a CNAME record `app` → `cname.vercel-dns.com`.
3. Turn on Cloudflare's "Orange Cloud" (proxied) — that puts CF in
   front of Vercel.
4. In Cloudflare → SSL/TLS → set to "Full (strict)".
5. In Cloudflare → Rules → Page Rules → for `app.arcmath.cn/*` set
   "Cache Level: Bypass" (we have lots of dynamic SSR routes).

**Why this often helps**: CF's network has more peering in China and
their TLS termination is closer. Not perfect — some Chinese ISPs
still block CF edges — but typically lifts success rate from ~50% to
~85%.

**Why it might NOT help enough**: CF doesn't have mainland China
nodes. If a particular user is on China Telecom in a bad region, they
will still see slow loads.

#### Option B — Tencent EdgeOne in front of Vercel (~1 hour)

Tencent's CDN/edge product. They have China mainland nodes that work
without ICP filing for `.com`/`.io` domains:

1. Register EdgeOne in Tencent Cloud console (international tier).
2. Add `arcmath.com` as a site.
3. Set origin = your Vercel deployment URL.
4. Update DNS to point to EdgeOne nameservers.
5. Optional: in EdgeOne → Rules → cache-bypass dynamic routes.

Better China performance than Cloudflare. Higher ops cost (~$15/mo
minimum tier) but well within pilot budget.

#### Option C — Host inside China on Aliyun (~1 week, requires ICP)

Full migration off Vercel onto Aliyun ECS + Aliyun CDN. Requires:

- ICP filing (备案) for the domain — takes 2-4 weeks
- Aliyun ECS in `cn-hangzhou` or `cn-shanghai`
- Dockerise the Next.js app, deploy via SAE (Serverless App Engine)
- Move Neon DB to RDS Postgres in the same region

This is the production-ready answer but won't be done by Monday.

### My recommendation

For **Monday launch**: **Option A** (Cloudflare). Free, fast to set
up, ~85% success rate in China. Acceptable for a 100-user pilot. We
write down option B/C as the next-month migration plan.

> **Update 2026-05-18**: Cloudflare proxy was deployed but mainland
> IPs still cannot reach the site reliably (CF free tier has no
> mainland nodes and HK edges are intermittently blocked / slowed by
> GFW). The new pilot plan is to self-host on a HK VPS — see
> [`HK_VPS_DEPLOY.md`](./HK_VPS_DEPLOY.md). Cloudflare-in-front-of-Vercel
> stays as the overseas fallback path.

### Cloudflare setup steps (concrete)

Once your domain registrar lets you change nameservers:

```bash
# 1. Sign up at cloudflare.com (free tier)
# 2. Add site → enter your domain
# 3. Cloudflare gives you two nameservers, e.g.:
#      adam.ns.cloudflare.com
#      eve.ns.cloudflare.com
# 4. Go to your registrar → set nameservers to those two
# 5. Wait ~5-30 min for propagation
# 6. In Cloudflare DNS panel, add:
#      Type   Name   Content                Proxy
#      CNAME  @      cname.vercel-dns.com   ✓ Proxied
#      CNAME  www    cname.vercel-dns.com   ✓ Proxied
# 7. In Vercel project → Settings → Domains → add your domain
# 8. Test from a China-IP probe (e.g. 17ce.com, ping.chinaz.com)
```

### Database latency

**Important**: even with Cloudflare, every request that hits the DB
goes back to Neon's US-East region. For Chinese users that's
300-500ms per round-trip. Multiple round-trips per page = 1-2s page
loads.

**Fix**: provision a Neon read-replica in `ap-southeast-1`
(Singapore) and route reads there. Neon supports this on their
Scale tier ($69/mo). For a free-tier pilot, skip this and accept the
latency — but plan the read-replica for week 2.

---

## 3. Scale concerns at ~100 concurrent users

### Pinpoints

| Component | Limit | At 100 users | Verdict |
|---|---|---|---|
| Vercel serverless | 100GB-h/mo (free), 1000 (Pro) | ~20-40 GB-h for 100 users × 1h session | **Need Pro tier** |
| Neon free tier | 0.5 GB storage, ~100 connections | ~50 MB used, ~30 concurrent connections | Borderline OK; upgrade soon |
| OpenAI gpt-4.1-mini | varies | ~5-10 calls/student/session × 100 = 500-1000 req | Fine — well below TPM |
| Fly verifier (1 vCPU / 2 GB) | ~5-10 concurrent SymPy requests | Possibly bottleneck | **Scale up** |
| Vercel bandwidth | 100 GB free, 1 TB Pro | <1 GB for 100 users | Fine |

### Concrete actions before launch

#### 3.1 Vercel — upgrade to Pro

Free tier hard-limits at 100 GB-h compute / month and gives you 12s
function timeouts. For a pilot with multi-step proof grading,
upgrade to Pro ($20/mo) so:

- 1000 GB-h/month
- 60s function timeout (some grading flows can hit 20-30s)
- Better DDoS protection

#### 3.2 Fly verifier — keep at least one warm

The verifier currently auto-stops to save cost. Cold start is 5-10s,
which feels bad when it's the first request of a session. Fix:

```bash
# Bump min_machines_running to 1 in fly.toml:
# (you have 2 GB / shared-1x VM already)
[http_service]
  min_machines_running = 1   # was 0
```

Then `flyctl deploy` again. Costs ~$2/mo more but eliminates cold
starts.

#### 3.3 Neon — monitor pooler usage

Free tier gets ~100 connections. With 100 concurrent users on
Next.js serverless functions, each function may hold a connection
briefly. Risk of pool exhaustion.

**Action**: in Neon console → Settings → Connection pooling, verify
that the project URL ends in `-pooler` (we already use the pooled
endpoint in `.env.local`). If not, switch to the pooled URL.

#### 3.4 OpenAI rate-limits — enable the retry layer (already done)

P12 added 3-attempt exponential backoff with jitter. Confirms in
`apps/web/src/lib/ai/openai-json.ts`. If you do see rate-limit
errors in production logs, raise your TPM on the OpenAI dashboard.

#### 3.5 Sentry / error monitoring (optional but advised)

Right now errors only land in Vercel logs. For pilot, add Sentry:

```bash
pnpm -C apps/web add @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

Takes ~10 minutes. Free tier (5K errors/mo) is enough for the
pilot. Without it you will not notice silent failures.

#### 3.6 Backups

Neon does point-in-time recovery by default. Confirm in the Neon
console under your project → Backups. If you're on the free tier,
add a manual export to S3 / Drive once a week.

---

## 4. Final go/no-go list

Block launch if any are NO:

- [ ] Smoke test ritual (B1) passes end-to-end on a clean account
- [ ] HK VPS deployed per `HK_VPS_DEPLOY.md` and verified from a
      China-IP probe (ping.chinaz.com) — Cloudflare-in-front-of-Vercel
      already attempted, mainland access not reliable enough
- [ ] Vercel Pro tier active
- [ ] Fly verifier `min_machines_running = 1` deployed
- [ ] Sentry (or equivalent) wired up — or you've accepted "watch
      logs manually"
- [ ] OPENAI_API_KEY budget configured (set a monthly cap in OpenAI
      dashboard to avoid surprise bills)
- [x] `/login/set-password` v3 visually consistent with `/login`
      (verified 2026-05-18)

Nice-to-have, not blockers:
- [ ] Forgot-password copy clarified
- [ ] Read-replica in Singapore (week 2 work)
- [ ] EdgeOne or Aliyun migration for China prod (week 4+)
