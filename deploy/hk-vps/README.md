# `deploy/hk-vps/` — Arcmath HK VPS 自托管部署

针对国内访问问题的 pilot 方案。把 Next.js 跑在 HK VPS 上，绕开 Vercel +
Cloudflare 的 GFW 抖动。完整背景见 [`../../HK_VPS_DEPLOY.md`](../../HK_VPS_DEPLOY.md)。

## 文件清单

| 文件 | 用途 | 谁来跑 |
|---|---|---|
| `bootstrap.sh` | 全新 Ubuntu 22.04 VPS 一键初始化（Node/pnpm/PM2/nginx/certbot/UFW/swap/非 root 用户） | root，**一次性** |
| `ecosystem.config.cjs` | PM2 配置：cluster 模式 2 worker，max_memory_restart 1G | PM2 读 |
| `setup-nginx.sh` | nginx 反代 + Let's Encrypt 自动签证书 + HTTPS + rate-limit + 90s 超时 | sudo，**一次性** |
| `deploy.sh` | 日常 deploy：git pull → install → build → migrate → PM2 reload | arcmath，**每次 push 后** |
| `deploy-proof-verifier.sh` | 构建并启动 Lean/mathlib proof verifier Docker 服务 | arcmath，Research Mode 需要 |

## 上线顺序

```bash
# === 在你本地 ===
# 1. 买好 HK VPS，记下公网 IP，把 SSH key 加到 root authorized_keys

# === SSH 进 VPS（以 root） ===
# 2. 初始化系统
curl -fsSL https://raw.githubusercontent.com/<your-org>/arcmath/main/deploy/hk-vps/bootstrap.sh | bash
# （如果 repo 还没 push，先 scp 这个目录上去）

# 3. 切到 arcmath 用户
ssh arcmath@47.76.201.152
git clone https://github.com/<your-org>/arcmath.git
cd arcmath/apps/web

# 4. 配 .env.local（把 Vercel 上的 env 全部复制过来；NEXTAUTH_URL 改成新域名）
nano .env.local

# 5. 装依赖 + build
NODE_OPTIONS="--max-old-space-size=6144" pnpm install --frozen-lockfile
pnpm build

# 6. 启动 PM2
pm2 start ../../deploy/hk-vps/ecosystem.config.cjs
pm2 save
pm2 startup        # 跟着提示再跑一次 sudo

# 7. 配 nginx + HTTPS（这一步会自动 certbot 签证书，要求 DNS A 记录已生效）
sudo bash ~/arcmath/deploy/hk-vps/setup-nginx.sh

# === 改 DNS ===
# 8. 在域名注册商处把 arcscience.forecaster-ai.com 的 A 记录指向 VPS 公网 IP

# === 测试 ===
# 9. 浏览器打开 https://arcscience.forecaster-ai.com 看是否能登录
# 10. ping.chinaz.com 测国内 ISP 探测，全部能 200 OK = 上线
```

## 日常 deploy

push 到 main 之后：

```bash
ssh arcmath@47.76.201.152 'bash ~/arcmath/deploy/hk-vps/deploy.sh'
```

如果 Research Mode / Lean verifier 也有变化，或首次部署形式化验证服务：

```bash
ssh arcmath@47.76.201.152 'bash ~/arcmath/deploy/hk-vps/deploy-proof-verifier.sh'
```

Web 服务需要能访问 verifier。推荐在 `apps/web/.env.local` 加：

```bash
PROOF_VERIFIER_URL=http://127.0.0.1:8000
```

`deploy-proof-verifier.sh` 会从 `apps/web/.env.local` 读取 `OPENAI_API_KEY`，并将 verifier 绑定到 VPS 本机
`127.0.0.1:8000`，不对公网开放。

或用同目录的 GitHub Actions workflow `.github/workflows/deploy-hk.yml`（在
HK_VPS_DEPLOY.md §6 里），push 后自动 SSH 部署。

## 紧急回滚

如果新 deploy 把站搞挂：

```bash
ssh arcmath@47.76.201.152
cd ~/arcmath
git log --oneline -5             # 找到上一个好的 commit
git reset --hard <good-sha>
cd apps/web
pnpm install --frozen-lockfile
pnpm build
pm2 reload arcmath-web
```

最坏情况：把 DNS A 记录暂时切回 Vercel（Vercel 部署保留）。
