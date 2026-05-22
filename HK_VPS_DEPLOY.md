# 香港 VPS 自托管部署 — 给中国大陆用户的可靠访问

> Pilot 阶段的 China-friendly 方案。绕开 Vercel + Cloudflare 的 GFW
> 抖动问题，直接把 Next.js 跑在 HK 出口的 VPS 上。
>
> 不需要 ICP 备案。3-4 小时上手，95%+ 国内访问率。

---

## 0. 选机器

| 厂商 | 配置建议 | 月价 | 备注 |
|---|---|---|---|
| **阿里云国际 HK** | 4vCPU 8GB / 100GB SSD | ~$35 | 推荐。CN2 GIA 线路，到大陆延迟 30-60ms |
| 腾讯云国际 HK | 同配 | ~$30 | 备选，线路也好 |
| Vultr HKG | 4vCPU 8GB | $48 | 国际厂商，到大陆稳定但稍贵 |
| DigitalOcean SGP | 4vCPU 8GB | $42 | 新加坡，到大陆略慢但更稳 |

**关键**：选**"国际版"或"海外版"**，不是大陆云账户。如果你已经有阿里云
账户，需要单独注册 alibabacloud.com 的 international 账号（跟 aliyun.com
是分开的）。

**Ubuntu 22.04 LTS** 镜像，公网 IPv4 必开。

---

## 1. 服务器初始化（10 分钟）

SSH 进去之后，root 跑：

```bash
# 基础包
apt update && apt upgrade -y
apt install -y curl git nginx ufw build-essential

# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pnpm@9 pm2

# Let's Encrypt 客户端
apt install -y certbot python3-certbot-nginx

# 防火墙
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

# 建一个非 root 用户
adduser --disabled-password --gecos "" arcmath
usermod -aG sudo arcmath
```

---

## 2. 拉代码 & 构建（30 分钟）

```bash
su - arcmath
git clone https://github.com/<your-org>/arcmath.git
cd arcmath/apps/web
pnpm install --frozen-lockfile
```

把 Vercel 现在用的环境变量复制到 `.env.local`：

```bash
cat > .env.local <<'EOF'
DATABASE_URL=postgresql://...?sslmode=require&pgbouncer=true
NEXTAUTH_SECRET=<from vercel>
NEXTAUTH_URL=https://arcscience.forecaster-ai.com   # ⚠ 改成你的域名
OPENAI_API_KEY=<from vercel>
OPENAI_MODEL=gpt-4.1-mini
PROOF_VERIFIER_URL=https://arcmath-proof-verifier.fly.dev
GRADING_ENGINE_VERSION=v2
EOF
```

然后构建：

```bash
pnpm build
```

⚠ 如果 build 报 OOM（4GB 内存够用，但 8GB 更稳）：

```bash
NODE_OPTIONS="--max-old-space-size=6144" pnpm build
```

---

## 3. PM2 守护进程（5 分钟）

```bash
# 在 apps/web 目录下
cat > ecosystem.config.cjs <<'EOF'
module.exports = {
  apps: [{
    name: "arcmath-web",
    script: "node_modules/next/dist/bin/next",
    args: "start -p 3000",
    cwd: "/home/arcmath/arcmath/apps/web",
    instances: 2,             // 4 vCPU 跑 2 worker
    exec_mode: "cluster",
    env: { NODE_ENV: "production" },
    max_memory_restart: "1G",
    error_file: "/home/arcmath/logs/web-err.log",
    out_file:   "/home/arcmath/logs/web-out.log"
  }]
};
EOF

mkdir -p /home/arcmath/logs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # 跟着提示的 sudo 命令执行一次，让 PM2 开机自启
```

---

## 4. nginx 反向代理 + HTTPS（30 分钟）

```bash
# 回到 root 或用 sudo
sudo bash <<'EOF'
cat > /etc/nginx/sites-available/arcmath <<'NGX'
server {
    listen 80;
    server_name arcscience.forecaster-ai.com;       # ⚠ 改成你的域名

    # Let's Encrypt 验证用
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name arcscience.forecaster-ai.com;       # ⚠ 改成你的域名

    ssl_certificate     /etc/letsencrypt/live/arcscience.forecaster-ai.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/arcscience.forecaster-ai.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # ====== Next.js 反代 ======
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90s;        # 证明题批改要 30s
    }

    # Next.js 静态资源加 cache
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # 限制：单 IP 100 req/s burst 200
    limit_req_zone $binary_remote_addr zone=app:10m rate=100r/s;
    limit_req zone=app burst=200 nodelay;

    client_max_body_size 10M;
    gzip on;
    gzip_types application/javascript application/json text/css text/plain;
}
NGX

mkdir -p /var/www/certbot
ln -sf /etc/nginx/sites-available/arcmath /etc/nginx/sites-enabled/arcmath
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
EOF
```

**先解析 DNS 到 VPS 的公网 IP**（DNS A 记录），等 1-2 分钟生效再继续。

```bash
# 用 certbot 取 SSL 证书
sudo certbot --nginx -d arcscience.forecaster-ai.com  # ⚠ 改成你的域名
# 按提示输入邮箱，同意 ToS，选自动续期 (Y)
```

证书申请成功后 nginx 会自动重启，HTTPS 就活了。

---

## 5. DNS 切换（5 分钟 + 30 分钟传播）

之前是：
```
A    app    <Vercel IP>
```

改成：
```
A    app    <HK VPS IP>
```

**保留 Vercel 部署不删**，作为海外用户后备 / 紧急 rollback。

如果想做地理路由（国内→VPS、海外→Vercel）：

- 国内域名（备案了 .cn 域名）用 **DNSPod** 免费版支持运营商分线路
- 国际域名用 **Cloudflare** 的 Geo Steering（付费 $5/月） 或 **AWS Route53**
  的 Geolocation Routing

对 pilot 来说不需要分线路，**全切到 VPS 就行**——VPS 的 HK 出口对海外
也是正常可访问的，只是比 Vercel 边缘节点慢 100-200ms，pilot 阶段
可接受。

---

## 6. 部署日常 — 每次 push 后

```bash
ssh arcmath@<vps-ip>
cd ~/arcmath
git pull
cd apps/web
pnpm install --frozen-lockfile  # 依赖有变才需要
pnpm build
pm2 reload arcmath-web
```

或者你想要自动化，写个 GitHub Actions workflow，push 到 main 自动 SSH
deploy。下面这个文件丢到 `.github/workflows/deploy-hk.yml`：

```yaml
name: Deploy to HK VPS
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1.0.3
        with:
          host:     ${{ secrets.HK_VPS_HOST }}
          username: arcmath
          key:      ${{ secrets.HK_VPS_SSH_KEY }}
          script: |
            cd ~/arcmath
            git pull
            cd apps/web
            pnpm install --frozen-lockfile
            pnpm build
            pm2 reload arcmath-web
```

在 GitHub repo Settings → Secrets 里加 `HK_VPS_HOST` 和 `HK_VPS_SSH_KEY`。

---

## 7. 测试国内访问

```bash
# 在 HK VPS 上，用 https://ping.chinaz.com 探测
curl https://arcscience.forecaster-ai.com -I
```

打开 `https://ping.chinaz.com`，输入你的域名，看：
- 北京电信、上海电信、广州电信 → 延迟应该 50-120ms
- 内陆移动 → 100-200ms

只要全部能解析 + TLS 不 reset，就可以宣布国内访问可用。

---

## 8. 监控（推荐但非阻塞）

```bash
# 简单的 uptime 监控：用 UptimeRobot 免费 tier
# https://uptimerobot.com → Add monitor → HTTPS → 你的域名
# 每 5 分钟探测一次，宕机 email 通知
```

PM2 自己有 `pm2 monit` 可以看 CPU / 内存 / 重启次数：

```bash
pm2 monit
```

---

## 9. 几个常见坑

**1. Neon DB 连接慢**  
HK VPS 到 Neon 美东 ~250ms。可以接受但慢。下周做 Neon 新加坡 read
replica。如果连接经常断，把 `DATABASE_URL` 末尾加
`?pool_timeout=30&connection_limit=20`。

**2. NextAuth callback URL 不对**  
`NEXTAUTH_URL` 必须是你的 HK 域名，不能是 Vercel 默认域名，否则
OAuth callback / cookie 都会出问题。

**3. Vercel cron / scheduled jobs**  
如果项目用了 Vercel cron（定时任务）记得在 HK VPS 上用 cron 或
PM2 schedule 补一份，否则定时任务在 Vercel 那边偶尔跑、不可靠。

**4. SSE / 长连接超时**  
nginx 默认 60s 超时。证明题批改可能要 90s+。我上面 nginx 配置里加了
`proxy_read_timeout 90s`，记得保留。

---

## 长期方案（pilot 之后）

| 时机 | 动作 |
|---|---|
| 上线第 1 周 | HK VPS 只跑 1 台。监控访问成功率 |
| 上线第 2-4 周 | ICP 备案启动（.com 域名也可以备案，材料齐 7-15 天） |
| ICP 通过后 | 迁移到阿里云大陆 SAE / ECS，延迟 < 20ms |
| 上 100 用户后 | HK VPS 升 8 核 16G，或加 Neon Singapore replica |

ICP 备案需要：
- 企业营业执照 或 个人身份证
- 域名注册商提供"备案授权码"
- 服务器在国内（这就是为什么先 ICP、再迁国内）
