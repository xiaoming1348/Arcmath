# Cloudflare front-of-VPS setup runbook

> Goal: put Cloudflare's CDN + TLS in front of the HK VPS so user-side
> TCP+TLS hits a nearby CF edge instead of crossing the Pacific. ~2 hours
> end-to-end. Free tier is enough for pilot scale.
>
> Effect (measured baseline on owner's California connection):
>   landing-page TTFB before:  ~1.2-1.4s (handshake-dominated)
>   landing-page TTFB after :  ~200-300ms  (CF edge ~50ms away)

## Pre-flight checklist

- [ ] Domain `forecaster-ai.com` is registered somewhere you can edit
      nameservers (likely the registrar's control panel).
- [ ] You have admin access to a Cloudflare account (free tier OK).
- [ ] VPS root SSH still works (`ssh -i ~/.ssh/arcmath-hk.pem
      root@47.76.201.152 whoami` → `root`).
- [ ] No ongoing pilot demo for the next 60 minutes — there's a 5-15
      minute window where DNS propagation can confuse some users.

## Step 1 — add the apex domain to Cloudflare (15 min)

1. Sign in to dash.cloudflare.com → **Add a Site** → enter
   `forecaster-ai.com` → Free plan → Continue.
2. CF will scan existing DNS records. Verify it picks up at least the
   `arcscience` subdomain pointing to `47.76.201.152`. If not, add
   manually: type A, name `arcscience`, content `47.76.201.152`,
   proxy status **DNS only** for now (grey cloud).
3. CF will give you two nameservers like
   `ns1.cloudflare.com` / `ns2.cloudflare.com`. Note them.

## Step 2 — switch nameservers at the registrar (15 min + propagation)

1. Log in to your registrar (whoever you bought `forecaster-ai.com`
   from — Namecheap / Aliyun Domain / Google Domains / etc).
2. Find the nameserver settings for `forecaster-ai.com`.
3. Replace existing nameservers with the two CF nameservers from
   step 1.3.
4. Save.

DNS propagation: usually 5-15 min. CF dashboard will mark the domain
"Active" once it sees the change.

While waiting, verify nothing is broken:

```bash
dig +short arcscience.forecaster-ai.com
# Should still return 47.76.201.152 — proxy is OFF, CF is just acting
# as authoritative DNS at this point.
```

## Step 3 — get a Cloudflare Origin Certificate (10 min)

This is the cert nginx will use to terminate TLS from CF. It's separate
from the user-visible cert that CF presents (CF handles that automatically).

1. CF dashboard → SSL/TLS → **Origin Server** → **Create Certificate**.
2. Defaults are fine:
   - Generate private key + CSR with Cloudflare ✓
   - Hostnames: `*.forecaster-ai.com`, `forecaster-ai.com`
   - Validity: 15 years
3. Click Create.
4. Two text boxes appear: **Origin Certificate** and **Private Key**.
   Copy both to your Mac as files (do NOT close the page before saving;
   the private key won't be shown again).

Save locally:

```
~/Desktop/cf-origin-cert.pem    # paste the "Origin Certificate" text
~/Desktop/cf-origin-key.pem     # paste the "Private Key" text
chmod 600 ~/Desktop/cf-origin-key.pem
```

## Step 4 — install the cert on the VPS + point nginx at it (15 min)

```bash
# Upload (no sudo on VPS yet; goes to home dir)
scp -i ~/.ssh/arcmath-hk.pem \
    ~/Desktop/cf-origin-cert.pem \
    ~/Desktop/cf-origin-key.pem \
    arcmath@47.76.201.152:~/

# As arcmath we don't have NOPASSWD for mkdir on /etc/ssl/, so use root
# for this one move (bootstrap.sh copied root's authorized_keys to
# arcmath, so the .pem still works for root).
ssh -i ~/.ssh/arcmath-hk.pem root@47.76.201.152 'set -e
mkdir -p /etc/ssl/cloudflare
mv /home/arcmath/cf-origin-cert.pem /etc/ssl/cloudflare/origin.pem
mv /home/arcmath/cf-origin-key.pem  /etc/ssl/cloudflare/origin.key
chmod 600 /etc/ssl/cloudflare/origin.*
chown root:root /etc/ssl/cloudflare/origin.*
echo OK
'
```

Edit `deploy/hk-vps/nginx-arcmath.conf` on your Mac — swap the
Let's Encrypt cert paths for the CF origin paths:

```diff
- ssl_certificate     /etc/letsencrypt/live/arcscience.forecaster-ai.com/fullchain.pem;
- ssl_certificate_key /etc/letsencrypt/live/arcscience.forecaster-ai.com/privkey.pem;
+ ssl_certificate     /etc/ssl/cloudflare/origin.pem;
+ ssl_certificate_key /etc/ssl/cloudflare/origin.key;
```

Deploy the new nginx config the same way we've been doing:

```bash
scp ~/Desktop/Arcmath/deploy/hk-vps/nginx-arcmath.conf \
    arcmath@47.76.201.152:/tmp/nginx-arcmath.conf.new
ssh arcmath@47.76.201.152 'set -e
sudo cp /etc/nginx/sites-available/arcmath /etc/nginx/sites-available/arcmath.bak.$(date +%Y%m%d-%H%M)
sudo cp /tmp/nginx-arcmath.conf.new /etc/nginx/sites-available/arcmath
sudo nginx -t
sudo nginx -s reload
rm /tmp/nginx-arcmath.conf.new
echo OK
'
```

At this point nginx is presenting the CF Origin cert. Browsers won't
trust it directly (it's signed by Cloudflare, not a public CA) — but
that's fine because once we flip CF's proxy on (step 5), browsers will
only ever see CF's public cert.

Verify nginx is healthy:

```bash
curl --insecure -sI https://47.76.201.152/ -H "Host: arcscience.forecaster-ai.com" | head -5
# Should still return HTTP/2 200. (--insecure because our cert isn't
# publicly trusted; we're testing nginx itself.)
```

## Step 5 — turn on the orange cloud (proxied) (5 min)

CF dashboard → DNS → click the grey cloud next to the `arcscience`
A record → it becomes orange (proxied).

Now:

```bash
# Should resolve to a CF anycast IP (104.x.x.x / 172.x.x.x), not 47.76.201.152
dig +short arcscience.forecaster-ai.com

# Real TTFB test
curl -w "tcp=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s\n" \
     -o /dev/null -s https://arcscience.forecaster-ai.com/
```

Expected: tcp+tls << what you had before (CF edge is ~50ms from
California vs ~300ms direct to HK).

## Step 6 — lock down origin (optional but recommended, 10 min)

Once CF is in front, you can block direct VPS access so users can't
bypass CF (and so attackers can't reach the origin):

1. CF dashboard → SSL/TLS → **Overview** → set encryption mode to
   **Full (Strict)**. This enforces cert verification on the
   CF → origin leg.
2. CF dashboard → SSL/TLS → **Edge Certificates** → enable
   **Always Use HTTPS**, **Automatic HTTPS Rewrites**, **HSTS**
   (start with max-age 6 months; increase later once stable).
3. (Optional) Restrict origin firewall to CF IPs only:
   ```bash
   ssh -i ~/.ssh/arcmath-hk.pem root@47.76.201.152 'set -e
   # Get the current CF IPv4 list
   curl -s https://www.cloudflare.com/ips-v4 > /etc/nginx/cf-ips.txt
   ufw status verbose
   # If you want hard lockdown: deny 443 from non-CF. Skip on free tier
   # if you also want to keep direct testing access. For now, just
   # verify ufw still allows 443.
   '
   ```

## Rollback (if anything is wrong)

In any order:

1. CF dashboard → DNS → click the orange cloud → back to grey
   (proxy off). Within seconds users hit the VPS directly again.
2. Revert nginx config to LE cert:
   ```bash
   ssh arcmath@47.76.201.152 'sudo cp /etc/nginx/sites-available/arcmath.bak.<YYYYMMDD-HHMM> /etc/nginx/sites-available/arcmath && sudo nginx -t && sudo nginx -s reload'
   ```
3. If DNS propagation made the apex unreachable, switch nameservers
   back at the registrar.

## Post-deploy checklist

- [ ] `curl -sI https://arcscience.forecaster-ai.com/` returns HTTP/2 200
      with `cf-ray:` and `server: cloudflare` headers.
- [ ] Login flow works end-to-end (session cookie set, redirect lands).
- [ ] `/admin/ocr-stats` still loads correctly when logged in as ADMIN
      (no cache contamination across users).
- [ ] DB keepalive still pinging (`pm2 logs | grep keepalive` shows no
      new errors).
- [ ] X-Cache-Status from our nginx micro-cache still appears in
      response headers (CF and nginx caches coexist; we set CF cache to
      Bypass for HTML by default — see DNS-only Cache Rules if needed).

## What this doesn't fix

- HK VPS ↔ Neon DB latency (us-east-1, ~200ms RTT each query). Logged-in
  pages still wait on Neon. See `docs/PERF_UPGRADE_OPTIONS.md` Option B
  (Neon SG migration).
- Mainland-China access through CF goes via HK/SG edges — fine but not
  faster than direct HK VPS for CN users. Most users see the win
  internationally.
