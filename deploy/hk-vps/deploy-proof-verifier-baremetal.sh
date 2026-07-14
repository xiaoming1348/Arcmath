#!/usr/bin/env bash
# Arcmath HK VPS — deploy proof verifier without Docker/root.
#
# Run as the arcmath user:
#   bash ~/arcmath/deploy/hk-vps/deploy-proof-verifier-baremetal.sh
#
# This installs Lean through user-space elan, warms the Mathlib cache, and
# runs FastAPI/uvicorn under PM2 on 127.0.0.1:8000.

set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/arcmath/arcmath}"
SERVICE_DIR="${REPO_DIR}/services/proof-verifier"
VENV_DIR="${SERVICE_DIR}/.venv-linux"
PROCESS_NAME="${PROCESS_NAME:-arcmath-proof-verifier}"
HOST="${PROOF_VERIFIER_HOST:-127.0.0.1}"
PORT="${PROOF_VERIFIER_HOST_PORT:-8000}"
LEAN_TIMEOUT="${ARCMATH_LEAN_TIMEOUT_SEC:-180}"

run_with_heartbeat() {
  local description="$1"
  shift

  local log_file
  log_file="$(mktemp)"
  "$@" >"${log_file}" 2>&1 &
  local pid=$!

  while kill -0 "${pid}" >/dev/null 2>&1; do
    echo "${description} still running..."
    sleep 20
  done

  if ! wait "${pid}"; then
    cat "${log_file}" >&2
    rm -f "${log_file}"
    return 1
  fi

  cat "${log_file}"
  rm -f "${log_file}"
}

cd "${REPO_DIR}"

echo "==> proof-verifier baremetal: git sync"
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

echo "==> proof-verifier baremetal: ensure elan/lake"
if [ ! -x "${HOME}/.elan/bin/lake" ]; then
  curl -fsSL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -o /tmp/elan-init.sh
  sh /tmp/elan-init.sh -y --default-toolchain none
fi
export PATH="${HOME}/.elan/bin:${PATH}"

echo "==> proof-verifier baremetal: python environment"
cd "${SERVICE_DIR}"
if [ ! -x "${VENV_DIR}/bin/python" ] || [ ! -x "${VENV_DIR}/bin/pip" ]; then
  rm -rf "${VENV_DIR}"
  if ! python3 -m venv "${VENV_DIR}"; then
    echo "python3 venv is unavailable; falling back to user-space virtualenv"
    python3 -m pip install --user --upgrade virtualenv
    export PATH="${HOME}/.local/bin:${PATH}"
    python3 -m virtualenv "${VENV_DIR}"
  fi
fi
"${VENV_DIR}/bin/pip" install --upgrade pip
"${VENV_DIR}/bin/pip" install -r requirements.txt

echo "==> proof-verifier baremetal: warm Lean/mathlib"
cd "${SERVICE_DIR}/lean-workspace"
lake exe cache get
run_with_heartbeat "lake build ArcmathVerifier" lake build ArcmathVerifier

echo "==> proof-verifier baremetal: PM2 start"
cd "${SERVICE_DIR}"
pm2 delete "${PROCESS_NAME}" >/dev/null 2>&1 || true
env \
  "OPENAI_API_KEY=${OPENAI_KEY}" \
  "ARCMATH_LEAN_TIMEOUT_SEC=${LEAN_TIMEOUT}" \
  "PORT=${PORT}" \
  "PATH=${HOME}/.elan/bin:${VENV_DIR}/bin:${PATH}" \
  pm2 start "${VENV_DIR}/bin/uvicorn" \
    --name "${PROCESS_NAME}" \
    --cwd "${SERVICE_DIR}" \
    --time \
    -- app.main:app --host "${HOST}" --port "${PORT}"

pm2 save

echo "==> proof-verifier baremetal: health check"
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://${HOST}:${PORT}/health"; then
    echo
    echo "==> proof-verifier baremetal: ready on http://${HOST}:${PORT}"
    exit 0
  fi
  echo "waiting for proof verifier (${attempt}/10)"
  sleep 3
done

echo "ERROR: proof-verifier did not become healthy." >&2
pm2 logs "${PROCESS_NAME}" --lines 120 --nostream >&2 || true
exit 1
