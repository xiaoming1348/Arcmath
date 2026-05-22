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

echo "==> build"
NODE_OPTIONS="--max-old-space-size=6144" pnpm build

echo "==> Prisma migrate (如果有新 migration)"
pnpm prisma migrate deploy --schema=../../packages/db/prisma/schema.prisma || true

echo "==> PM2 reload (zero-downtime)"
pm2 reload arcmath-web --update-env
pm2 save

echo "==> ✅ deploy 完成 @ $(date -Iseconds)"
