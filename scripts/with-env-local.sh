#!/bin/sh
set -eu

ENV_FILE="${ARCMATH_ENV_LOCAL_PATH:-./.env.local}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

read_env() {
  key="$1"
  sed -n "s/^${key}=//p" "$ENV_FILE" | head -n 1
}

trim_wrapping_quotes() {
  value="$1"
  case "$value" in
    \"*\")
      value="${value#\"}"
      value="${value%\"}"
      ;;
    \'*\')
      value="${value#\'}"
      value="${value%\'}"
      ;;
  esac
  printf '%s' "$value"
}

export_if_present() {
  key="$1"
  value="$(trim_wrapping_quotes "$(read_env "$key")")"
  if [ -n "$value" ]; then
    export "$key=$value"
  fi
}

DATABASE_URL_VALUE="$(trim_wrapping_quotes "$(read_env DATABASE_URL)")"

if [ -z "$DATABASE_URL_VALUE" ]; then
  echo "DATABASE_URL is missing in $ENV_FILE" >&2
  exit 1
fi

export DATABASE_URL="$DATABASE_URL_VALUE"
export_if_present PASSWORD_PEPPER
export_if_present NEXTAUTH_SECRET
export_if_present NEXTAUTH_URL
export_if_present OFFICIAL_PDF_STORAGE_DRIVER
export_if_present OFFICIAL_PDF_CACHE_DIR
export_if_present OPENAI_API_KEY
export_if_present OPENAI_MODEL
export_if_present OPENAI_BASE_URL
export_if_present S3_BUCKET
export_if_present S3_REGION
export_if_present S3_ACCESS_KEY_ID
export_if_present S3_SECRET_ACCESS_KEY
export_if_present S3_ENDPOINT
export_if_present S3_KEY_PREFIX
export_if_present S3_FORCE_PATH_STYLE

exec "$@"
