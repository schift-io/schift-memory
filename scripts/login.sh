#!/usr/bin/env bash
# Schift Memory login - get API key from Schift Cloud
set -euo pipefail

CONFIG_DIR="$HOME/.schift/memory/config"
AUTH_FILE="${CONFIG_DIR}/auth.json"
SCHIFT_CLOUD="https://api.schift.io"

echo ""
echo "  Schift Memory Login"
echo "  ==================="
echo ""

# Check if already logged in
if [ -f "$AUTH_FILE" ]; then
  existing_key=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('${AUTH_FILE}','utf-8')).api_key||'')}catch{}" 2>/dev/null || echo "")
  if [ -n "$existing_key" ]; then
    validate=$(curl -sf -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer ${existing_key}" \
      "${SCHIFT_CLOUD}/v1/organizations/me" 2>/dev/null || echo "000")
    if [ "$validate" = "200" ]; then
      echo "  Already logged in. Account is valid."
      echo "  To re-login, delete: ${AUTH_FILE}"
      exit 0
    fi
  fi
fi

echo "  Enter your Schift API key."
echo "  (Get one at: https://schift.io/signup?ref=memory-plugin)"
echo ""
printf "  API Key: "
read -r api_key

if [ -z "$api_key" ]; then
  echo "  No key provided. Aborting."
  exit 1
fi

# Validate
echo "  Validating..."
validate=$(curl -sf -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${api_key}" \
  "${SCHIFT_CLOUD}/v1/organizations/me" 2>/dev/null || echo "000")

if [ "$validate" != "200" ]; then
  echo "  Invalid API key. Check your key and try again."
  echo "  Sign up: https://schift.io/signup?ref=memory-plugin"
  exit 1
fi

# Save
mkdir -p "$CONFIG_DIR"
cat > "$AUTH_FILE" << AUTHEOF
{
  "api_key": "${api_key}",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "cloud_url": "${SCHIFT_CLOUD}"
}
AUTHEOF
chmod 600 "$AUTH_FILE"

echo "  Logged in! Running setup..."
echo ""

# Auto-run init
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "${SCRIPT_DIR}/init.sh"
