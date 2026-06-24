#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${EXPRESS_STAR_ROOT:-/Users/yingzhang/Desktop/TrystOfStars/express_star}"
ENV_FILE="${EXPRESS_STAR_ENV_FILE:-"$ROOT_DIR/.env.local"}"

cd "$ROOT_DIR"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${ENV_ID:-}" ]]; then
  ENV_ID="$(
    node -e "const fs=require('fs'); const p='cloudbaserc.json'; if (fs.existsSync(p)) { const v=JSON.parse(fs.readFileSync(p,'utf8')).envId; if (typeof v === 'string') process.stdout.write(v); }"
  )"
  export ENV_ID
fi

: "${ENV_ID:?Missing ENV_ID. Set it in .env.local or export ENV_ID before running express-star-cloudrun-deploy.}"

export CLOUDRUN_SERVICE_NAME="${CLOUDRUN_SERVICE_NAME:-express-star}"
export CLOUDRUN_PORT="${CLOUDRUN_PORT:-80}"

echo "[express_star] dev deploy target:"
echo "  ENV_ID=$ENV_ID"
echo "  CLOUDRUN_SERVICE_NAME=$CLOUDRUN_SERVICE_NAME"
echo "  CLOUDRUN_PORT=$CLOUDRUN_PORT"

exec node "$SCRIPT_DIR/deploy-cloudrun.cjs" "$@"
