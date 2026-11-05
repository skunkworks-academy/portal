#!/usr/bin/env bash
set -euo pipefail

url="${1:?Pass the protected API URL}"
redirect_args=()
if [[ "${2:-}" == "--location" ]]; then
  redirect_args=(--location)
elif [[ -n "${2:-}" ]]; then
  echo "Unsupported route probe option." >&2
  exit 2
fi

# After a restart, a protected route returned 404 while health already passed.
# Retry only that observed status; never accept it as proof of protection.
max_attempts=12
for ((attempt=1; attempt<=max_attempts; attempt++)); do
  status="$(curl --silent --show-error --max-time 20 "${redirect_args[@]}" --output /dev/null --write-out '%{http_code}' "$url" || true)"
  case "$status" in
    401|403)
      echo "Protected API route requires authentication (HTTP $status): $url"
      exit 0
      ;;
    404)
      if ((attempt < max_attempts)); then
        echo "Protected route not registered yet (attempt $attempt/$max_attempts); retrying in 5 seconds: $url"
        sleep 5
        continue
      fi
      ;;
  esac
  echo "Expected HTTP 401/403 from protected API route; received $status after $attempt attempt(s): $url" >&2
  exit 1
done
