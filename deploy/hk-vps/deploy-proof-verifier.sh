#!/usr/bin/env bash
# Arcmath HK VPS — deploy the Lean/mathlib proof verifier service.
#
# Run as the arcmath user:
#   bash ~/arcmath/deploy/hk-vps/deploy-proof-verifier.sh
#
# Requirements:
#   - Docker installed on the VPS.
#   - /home/arcmath/arcmath contains the repo.
#   - OPENAI_API_KEY is available in apps/web/.env.local or in the shell.

set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/arcmath/arcmath}"
SERVICE_DIR="${REPO_DIR}/services/proof-verifier"
CONTAINER_NAME="${CONTAINER_NAME:-arcmath-proof-verifier}"
IMAGE_NAME="${IMAGE_NAME:-arcmath-proof-verifier:lean}"
HOST_PORT="${PROOF_VERIFIER_HOST_PORT:-8000}"
LEAN_TIMEOUT="${ARCMATH_LEAN_TIMEOUT_SEC:-180}"

cd "${REPO_DIR}"

echo "==> proof-verifier: git sync"
git fetch origin
git reset --hard origin/main

OPENAI_KEY="${OPENAI_API_KEY:-}"
if [ -z "${OPENAI_KEY}" ] && [ -f "${REPO_DIR}/apps/web/.env.local" ]; then
  OPENAI_KEY="$(grep '^OPENAI_API_KEY=' "${REPO_DIR}/apps/web/.env.local" | cut -d= -f2- | sed 's/^"//; s/"$//' | head -n1 || true)"
fi

if [ -z "${OPENAI_KEY}" ]; then
  echo "ERROR: OPENAI_API_KEY is not set in shell or apps/web/.env.local." >&2
  exit 1
fi

echo "==> proof-verifier: build Lean image"
cd "${SERVICE_DIR}"
docker build -f Dockerfile.lean -t "${IMAGE_NAME}" .

echo "==> proof-verifier: replace container"
if docker ps -a --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  docker rm -f "${CONTAINER_NAME}"
fi

docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "127.0.0.1:${HOST_PORT}:8000" \
  -e "OPENAI_API_KEY=${OPENAI_KEY}" \
  -e "ARCMATH_LEAN_TIMEOUT_SEC=${LEAN_TIMEOUT}" \
  "${IMAGE_NAME}"

echo "==> proof-verifier: health check"
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:${HOST_PORT}/health"; then
    echo
    echo "==> proof-verifier: ready on http://127.0.0.1:${HOST_PORT}"
    exit 0
  fi
  echo "waiting for proof verifier (${attempt}/10)"
  sleep 3
done

echo "ERROR: proof-verifier did not become healthy." >&2
docker logs --tail 120 "${CONTAINER_NAME}" >&2 || true
exit 1
