#!/usr/bin/env bash
# Rebuild ArcmathVerifier.lean (with the v2 Mathlib expansion) and
# redeploy the proof-verifier to Fly.io in one shot.
#
# Run this from a Mac (or any machine with elan + flyctl already
# authenticated). The sandbox that Claude runs in cannot do this — Lean
# kernel compilation needs ~4 GB cache, ~20-40 min, and Fly deploys
# need your credentials.
#
# Steps:
#   1. install elan if missing
#   2. set up Lean toolchain pinned by lean-workspace/lean-toolchain
#   3. pull Mathlib cache (avoids recompiling Mathlib from source)
#   4. lake build  (compiles ArcmathVerifier.lean → olean)
#   5. flyctl deploy
#   6. smoke test the deployed verifier
#
# Usage:
#   bash scripts/lean-rebuild-and-deploy.sh
#   bash scripts/lean-rebuild-and-deploy.sh --skip-deploy   # build only
#   bash scripts/lean-rebuild-and-deploy.sh --skip-build    # deploy only

set -euo pipefail

SKIP_BUILD=0
SKIP_DEPLOY=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --skip-deploy) SKIP_DEPLOY=1 ;;
    -h|--help)
      sed -n '2,28p' "$0"
      exit 0
      ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LEAN_WS="$REPO_ROOT/services/proof-verifier/lean-workspace"
VERIFIER_DIR="$REPO_ROOT/services/proof-verifier"

note() { printf "\033[1;36m[lean-deploy]\033[0m %s\n" "$*"; }
fail() { printf "\033[1;31m[lean-deploy ERROR]\033[0m %s\n" "$*" >&2; exit 1; }

if [ "$SKIP_BUILD" -eq 0 ]; then
  # === 1. elan ===
  if ! command -v elan >/dev/null 2>&1; then
    note "elan not found; installing"
    curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh \
      | sh -s -- -y --default-toolchain none
    # shellcheck disable=SC1091
    source "$HOME/.elan/env"
  else
    note "elan present: $(elan --version)"
  fi

  # === 2. toolchain ===
  cd "$LEAN_WS"
  if [ ! -f lean-toolchain ]; then
    fail "missing $LEAN_WS/lean-toolchain"
  fi
  note "pinning toolchain to $(cat lean-toolchain)"
  elan default "$(cat lean-toolchain)"

  # === 3. mathlib cache ===
  note "downloading Mathlib olean cache (this is the time saver)"
  if ! lake exe cache get; then
    note "lake exe cache get failed; falling back to a fresh build (slow!)"
  fi

  # === 4. lake build ===
  note "lake build  (compiles ArcmathVerifier.lean)"
  time lake build
  note "build OK. olean size: $(du -sh .lake/build 2>/dev/null | cut -f1)"
fi

if [ "$SKIP_DEPLOY" -eq 0 ]; then
  # === 5. fly deploy ===
  if ! command -v flyctl >/dev/null 2>&1; then
    fail "flyctl not found. brew install flyctl, then 'flyctl auth login'"
  fi
  cd "$VERIFIER_DIR"
  note "flyctl deploy"
  flyctl deploy --remote-only

  # === 6. smoke test ===
  if [ -n "${PROOF_VERIFIER_URL:-}" ]; then
    note "smoke test: GET $PROOF_VERIFIER_URL/health"
    curl -sSf "$PROOF_VERIFIER_URL/health" || note "health check failed"
    note "smoke test: POST /verify with a trivial CLAIM"
    curl -sSf -X POST -H "Content-Type: application/json" \
      "$PROOF_VERIFIER_URL/verify" \
      -d '{"step_type":"CLAIM","latex":"For all real x, x^2 >= 0.","context_latex":[]}' \
      | head -c 600
    echo
  else
    note "PROOF_VERIFIER_URL not set; skipping smoke test"
  fi
fi

note "done"
