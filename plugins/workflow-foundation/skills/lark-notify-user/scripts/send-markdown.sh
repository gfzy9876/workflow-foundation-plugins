#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  send-markdown.sh (--user-id ou_xxx | --chat-id oc_xxx) --markdown TEXT [--idempotency-key KEY] [--as bot|user]
USAGE
}

recipient_flag=""
recipient_value=""
markdown=""
idempotency_key=""
identity="bot"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user-id|--chat-id)
      recipient_flag="$1"
      recipient_value="${2:-}"
      shift 2
      ;;
    --markdown)
      markdown="${2:-}"
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

if [[ -z "$recipient_flag" || -z "$recipient_value" || -z "$markdown" ]]; then
  usage
  exit 2
fi

args=(im +messages-send "$recipient_flag" "$recipient_value" --markdown "$markdown" --as "$identity")
if [[ -n "$idempotency_key" ]]; then
  args+=(--idempotency-key "$idempotency_key")
fi

lark-cli "${args[@]}"
