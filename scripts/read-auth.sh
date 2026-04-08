#!/usr/bin/env bash
# Unified auth reader with auto-migration
# Exports: SCHIFT_API_KEY, SCHIFT_API_URL
set -euo pipefail

SCHIFT_API_KEY=""
SCHIFT_API_URL="https://api.schift.io"

CLI_CONFIG="$HOME/.schift/config.json"
MEMORY_AUTH="$HOME/.schift/memory/config/auth.json"

# 1. env var (highest priority)
if [ -n "${SCHIFT_API_KEY:-}" ]; then
  return 0 2>/dev/null || exit 0
fi

# 2. ~/.schift/config.json
if [ -f "$CLI_CONFIG" ]; then
  SCHIFT_API_KEY=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('${CLI_CONFIG}','utf-8')).api_key||'')}catch{}" 2>/dev/null || echo "")
  _url=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('${CLI_CONFIG}','utf-8')).api_url||'')}catch{}" 2>/dev/null || echo "")
  [ -n "$_url" ] && SCHIFT_API_URL="$_url"
fi

# 3. ~/.schift/memory/config/auth.json -> auto-migrate to config.json
if [ -z "$SCHIFT_API_KEY" ] && [ -f "$MEMORY_AUTH" ]; then
  SCHIFT_API_KEY=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('${MEMORY_AUTH}','utf-8')).api_key||'')}catch{}" 2>/dev/null || echo "")
  _url=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('${MEMORY_AUTH}','utf-8')).cloud_url||'')}catch{}" 2>/dev/null || echo "")
  [ -n "$_url" ] && SCHIFT_API_URL="$_url"

  # Auto-migrate: write to config.json so next time it's found directly
  if [ -n "$SCHIFT_API_KEY" ]; then
    mkdir -p "$(dirname "$CLI_CONFIG")"
    node -e "
      const fs = require('fs');
      const path = '${CLI_CONFIG}';
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(path, 'utf-8')); } catch {}
      cfg.api_key = '${SCHIFT_API_KEY}';
      if ('${SCHIFT_API_URL}' !== 'https://api.schift.io') cfg.api_url = '${SCHIFT_API_URL}';
      fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
      try { fs.chmodSync(path, 0o600); } catch {}
    " 2>/dev/null || true
  fi
fi

export SCHIFT_API_KEY
export SCHIFT_API_URL
