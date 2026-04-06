#!/usr/bin/env bash
# Schift Memory login - OAuth browser flow with manual fallback
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="$HOME/.schift/memory/config"
AUTH_FILE="${CONFIG_DIR}/auth.json"
SCHIFT_CLOUD="https://api.schift.io"

# Check if already logged in
if [ -f "$AUTH_FILE" ]; then
  existing_key=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('${AUTH_FILE}','utf-8')).api_key||'')}catch{}" 2>/dev/null || echo "")
  if [ -n "$existing_key" ]; then
    validate=$(curl -sf -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer ${existing_key}" \
      "${SCHIFT_CLOUD}/v1/organizations/me" 2>/dev/null || echo "000")
    if [ "$validate" = "200" ]; then
      echo ""
      echo "  Already logged in. Account is valid."
      echo "  To re-login, delete: ${AUTH_FILE}"
      echo ""
      # Still run init + hooks in case they're not set up
      "${SCRIPT_DIR}/init.sh"
      exec "${SCRIPT_DIR}/install-hooks.sh"
    fi
  fi
fi

echo ""
echo "  Schift Memory Login"
echo "  ==================="
echo ""

# Try OAuth browser flow first
if command -v node >/dev/null 2>&1; then
  node "${SCRIPT_DIR}/login.js"
  login_exit=$?
  if [ "$login_exit" -eq 0 ] && [ -f "$AUTH_FILE" ]; then
    "${SCRIPT_DIR}/init.sh"
    exec "${SCRIPT_DIR}/install-hooks.sh"
  fi
fi

# Fallback: manual key entry
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

# Auto-run init + install hooks
"${SCRIPT_DIR}/init.sh"
exec "${SCRIPT_DIR}/install-hooks.sh"
