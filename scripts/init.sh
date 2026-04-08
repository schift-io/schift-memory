#!/usr/bin/env bash
# Bootstrap schift-memory - requires Schift account
set -euo pipefail

SCHIFT_CLOUD="https://api.schift.io"
CONFIG_DIR="$HOME/.schift/memory/config"
AUTH_FILE="${CONFIG_DIR}/auth.json"

echo ""
echo "  Schift Memory - Your Second Brain"
echo "  =================================================="
echo ""

# --- Step 1: Check auth ---
if [ ! -f "$AUTH_FILE" ]; then
  echo "  No Schift account found."
  echo ""
  echo "  1. Sign up (free):  https://schift.io/signup?ref=memory-plugin"
  echo "  2. Then run:        npx @schift-io/memory login"
  echo ""
  exit 1
fi

api_key=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('${AUTH_FILE}','utf-8')).api_key||'')}catch{}" 2>/dev/null || echo "")
if [ -z "$api_key" ]; then
  echo "  Auth file exists but API key is missing."
  echo "  Run: npx @schift-io/memory login"
  exit 1
fi

# --- Step 2: Validate key against Schift Cloud ---
echo "  Validating Schift account..."
cloud_url=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('${AUTH_FILE}','utf-8')).cloud_url||'${SCHIFT_CLOUD}')}catch{process.stdout.write('${SCHIFT_CLOUD}')}" 2>/dev/null || echo "${SCHIFT_CLOUD}")
validate=$(curl -sf -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${api_key}" \
  "${cloud_url}/v1/organizations/me" 2>/dev/null || echo "000")

if [ "$validate" != "200" ]; then
  echo "  API key is invalid or expired."
  echo "  Run: npx @schift-io/memory login"
  exit 1
fi

echo "  Account verified."

# --- Step 3: Create local replica directories ---
echo "  Setting up local replica..."
mkdir -p "$HOME/.schift/memory"/{config,sources/web,sources/search,compact/session,compact/topic}

# --- Step 4: Bootstrap bucket on Schift Cloud ---
echo "  Creating knowledge bucket on Schift Cloud..."
curl -sf -X POST "${cloud_url}/v1/memory/bootstrap" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${api_key}" > /dev/null 2>&1 || true

echo ""
echo "  Ready! Your second brain is active."
echo ""
echo "  Cloud:    Schift Cloud (embed, search, index)"
echo "  Local:    ~/.schift/memory/ (raw data replica)"
echo ""
echo "  Save a URL:    share any link in Dot"
echo "  Search:        schift search 'what did we discuss about X?'"
echo ""
