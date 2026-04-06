#!/usr/bin/env bash
# Hook dispatcher for schift-memory plugin

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

hook_name="${1:-}"
if [ -z "$hook_name" ]; then
  echo '{"error": "no hook name provided"}' >&2
  exit 1
fi

hook_script="${SCRIPT_DIR}/${hook_name}"
if [ -x "$hook_script" ]; then
  exec "$hook_script"
elif [ -f "$hook_script" ]; then
  exec bash "$hook_script"
else
  echo "{\"error\": \"hook not found: ${hook_name}\"}" >&2
  exit 1
fi
