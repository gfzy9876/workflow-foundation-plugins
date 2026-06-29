#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  send-image.sh (--user-id ou_xxx | --chat-id oc_xxx) --image PATH [--idempotency-key KEY] [--as bot|user]
USAGE
}

recipient_flag=""
recipient_value=""
image_path=""
idempotency_key=""
identity="bot"
max_idempotency_key_length=50

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user-id|--chat-id)
      recipient_flag="$1"
      recipient_value="${2:-}"
      shift 2
      ;;
    --image)
      image_path="${2:-}"
      shift 2
      ;;
    --idempotency-key)
      idempotency_key="${2:-}"
      shift 2
      ;;
    --as)
      identity="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$recipient_flag" || -z "$recipient_value" || -z "$image_path" ]]; then
  usage
  exit 2
fi

if [[ ${#idempotency_key} -gt $max_idempotency_key_length ]]; then
  echo "idempotency key is too long: ${#idempotency_key} > ${max_idempotency_key_length}" >&2
  exit 2
fi

image_arg="$image_path"
if [[ -f "$image_path" ]]; then
  if [[ "$identity" != "bot" ]]; then
    echo "local image upload requires --as bot" >&2
    exit 2
  fi
  if [[ "$image_path" = /* ]]; then
    image_dir=$(dirname "$image_path")
    image_file=$(basename "$image_path")
    upload_output=$(cd "$image_dir" && lark-cli im images create --data '{"image_type":"message"}' --file "image=$image_file" --as bot)
  else
    upload_output=$(lark-cli im images create --data '{"image_type":"message"}' --file "image=$image_path" --as bot)
  fi
  if ! image_arg=$(printf '%s' "$upload_output" | node -e 'const fs = require("fs"); const data = JSON.parse(fs.readFileSync(0, "utf8")); const key = data?.data?.image_key || data?.image_key; if (!key) process.exit(1); process.stdout.write(key);'); then
    echo "failed to read image_key from upload response" >&2
    echo "$upload_output" >&2
    exit 1
  fi
elif [[ "$image_path" != img_* ]]; then
  echo "Image file not found or invalid image_key: $image_path" >&2
  exit 1
fi

args=(im +messages-send "$recipient_flag" "$recipient_value" --image "$image_arg" --as "$identity")
if [[ -n "$idempotency_key" ]]; then
  args+=(--idempotency-key "$idempotency_key")
fi

lark-cli "${args[@]}"
