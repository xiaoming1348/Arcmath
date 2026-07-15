#!/usr/bin/env bash
# Arcmath HK VPS — 每次 push 后的 deploy 脚本
#
# 以 arcmath 用户跑：
#   ssh arcmath@47.76.201.152 'bash ~/arcmath/deploy/hk-vps/deploy.sh'

set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/arcmath/arcmath}"
WEB_ENV_FILE="${REPO_DIR}/apps/web/.env.local"

read_web_env_value() {
  local name="$1"
  if [ ! -f "${WEB_ENV_FILE}" ]; then
    return 0
  fi
  grep "^${name}=" "${WEB_ENV_FILE}" | cut -d= -f2- | sed 's/^"//; s/"$//' | head -n1 || true
}

export_web_env_if_present() {
  local name="$1"
  local value
  value="$(read_web_env_value "${name}")"
  if [ -n "${value}" ]; then
    export "${name}=${value}"
  fi
}

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
)
# NOTE: removed `|| echo WARN` fallthrough — if prisma generate fails
# the Next build will then use a stale client and the deploy ships a
# version with type errors masked, which is worse than failing here.
# `set -e` at the top of the script terminates on the subshell error.

echo "==> build"
cd "${REPO_DIR}/apps/web"
NODE_OPTIONS="--max-old-space-size=6144" pnpm build

echo "==> PM2 restart with updated env"
export_web_env_if_present DATABASE_URL
export_web_env_if_present PASSWORD_PEPPER
export_web_env_if_present NEXTAUTH_SECRET
export_web_env_if_present NEXTAUTH_URL
export_web_env_if_present OFFICIAL_PDF_STORAGE_DRIVER
export_web_env_if_present OFFICIAL_PDF_CACHE_DIR
export_web_env_if_present OPENAI_API_KEY
export_web_env_if_present OPENAI_MODEL
export_web_env_if_present OPENAI_BASE_URL
export_web_env_if_present OPENAI_CHAT_COMPLETIONS_URL
export_web_env_if_present OPENAI_VISION_URL
export_web_env_if_present OPENAI_VISION_RESPONSES_URL
export_web_env_if_present PROOF_VERIFIER_URL
export_web_env_if_present RESEARCH_OPENAI_CHAT_COMPLETIONS_URL
export_web_env_if_present RESEARCH_PROVER_MODEL
export_web_env_if_present S3_BUCKET
export_web_env_if_present S3_REGION
export_web_env_if_present S3_ACCESS_KEY_ID
export_web_env_if_present S3_SECRET_ACCESS_KEY
export_web_env_if_present S3_ENDPOINT
export_web_env_if_present S3_KEY_PREFIX
export_web_env_if_present S3_FORCE_PATH_STYLE
export_web_env_if_present DISABLE_ACCESS_GATING
pm2 restart arcmath-web --update-env
pm2 save

echo "==> ✅ deploy 完成 @ $(date -Iseconds)"
