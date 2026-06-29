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

: "${ENV_ID:?Missing ENV_ID. Set it in .env.local or export ENV_ID before running express-star-cloudfunctions-deploy.}"

echo "[express_star] dev cloud functions deploy target:"
echo "  ENV_ID=$ENV_ID"
echo "  FUNCTIONS=${*:-star-virtual-notify-relay}"

exec node "$SCRIPT_DIR/deploy-cloudfunctions.cjs" "$@"
