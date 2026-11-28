#!/usr/bin/env bash
set -euo pipefail

url="https://api.skunkworksacademy.com/api/me/profile"
origin="https://portal.skunkworksacademy.com"
headers=$(mktemp)
trap 'rm -f "$headers"' EXIT
status=$(curl --silent --show-error --max-time 20 -X OPTIONS -D "$headers" -o /dev/null -w '%{http_code}' \
  -H "Origin: $origin" -H 'Access-Control-Request-Method: PATCH' -H 'Access-Control-Request-Headers: authorization,content-type' "$url")
header() {
  awk -v key="$1" 'tolower(substr($0,1,length(key)+1)) == key ":" {line=substr($0,length(key)+2); sub(/^[[:blank:]]*/,"",line); sub(/\r$/,"",line); print tolower(line)}' "$headers"
}
allowed=$(header access-control-allow-origin)
methods=$(header access-control-allow-methods)
accepted=$(header access-control-allow-headers)
printf 'Profile preflight HTTP %s, allowed origin %s, methods %s, headers %s\n' "$status" "$allowed" "$methods" "$accepted"
[[ "$status" == 200 || "$status" == 204 ]]
[[ "$allowed" == "$origin" && "$methods" == *patch* ]]
[[ "$accepted" == *authorization* && "$accepted" == *content-type* ]]
# No bearer token or profile fields are sent. Confirm the deployed PATCH handler requires sign-in.
patch_status=$(curl --silent --show-error --max-time 20 -X PATCH -H "Origin: $origin" -o /dev/null -w '%{http_code}' "$url")
echo "Unauthenticated Academy profile PATCH returned HTTP $patch_status."
[[ "$patch_status" == 401 || "$patch_status" == 403 ]]
