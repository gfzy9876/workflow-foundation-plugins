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

if [[ ! -f "$image_path" ]]; then
  echo "Image file not found: $image_path" >&2
  exit 1
fi

args=(im +messages-send "$recipient_flag" "$recipient_value" --image "$image_path" --as "$identity")
if [[ -n "$idempotency_key" ]]; then
  args+=(--idempotency-key "$idempotency_key")
fi

lark-cli "${args[@]}"
