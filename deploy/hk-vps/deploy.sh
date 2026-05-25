#!/usr/bin/env bash
# Arcmath HK VPS — 每次 push 后的 deploy 脚本
#
# 以 arcmath 用户跑：
#   ssh arcmath@<vps-ip> 'bash ~/arcmath/deploy/hk-vps/deploy.sh'

set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/arcmath/arcmath}"
cd "${REPO_DIR}"

echo "==> git pull"
git fetch origin
git reset --hard origin/main

echo "==> 依赖 (有变化才装)"
cd apps/web
pnpm install --frozen-lockfile

echo "==> Prisma generate + migrate (在 packages/db 里跑，那里才装了 prisma CLI)"
(
  cd "${REPO_DIR}/packages/db"
  # DATABASE_URL 从 apps/web/.env.local 取（根 .env 通常不放它）
  if [ -z "${DATABASE_URL:-}" ] && [ -f "${REPO_DIR}/apps/web/.env.local" ]; then
    export DATABASE_URL=$(grep '^DATABASE_URL=' "${REPO_DIR}/apps/web/.env.local" | cut -d= -f2- | tr -d '"' | head -n1)
  fi
  pnpm prisma generate
  pnpm prisma migrate deploy
) || echo "WARN: prisma 步骤失败，继续 build；如果是 schema 变动请手动修复"

echo "==> build"
cd "${REPO_DIR}/apps/web"
NODE_OPTIONS="--max-old-space-size=6144" pnpm build

echo "==> PM2 reload (zero-downtime)"
pm2 reload arcmath-web --update-env
pm2 save

echo "==> ✅ deploy 完成 @ $(date -Iseconds)"
