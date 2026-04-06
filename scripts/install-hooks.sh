#!/usr/bin/env bash
# Install Schift Memory hooks into Claude Code settings
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

AUTH_FILE="$HOME/.schift/memory/config/auth.json"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo ""
echo "  Schift Memory - Hook Installer"
echo "  ==============================="
echo ""

# Gate: auth required
if [ ! -f "$AUTH_FILE" ]; then
  echo "  Not logged in. Run first: npx @schift-io/memory login"
  exit 1
fi

# Ensure directories
mkdir -p "$HOME/.schift/memory"/{config,sources/web,sources/search,sources/external,compact/session,compact/topic,queue,runtime/engine}

# Ensure settings.json exists
mkdir -p "$HOME/.claude"
[ ! -f "$SETTINGS_FILE" ] && echo '{}' > "$SETTINGS_FILE"

# Install hooks into Claude Code settings using node
node -e "
  const fs = require('fs');
  const settingsPath = process.argv[1];
  const pluginRoot = process.argv[2];

  const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8') || '{}');
  const hooks = data.hooks || {};

  // --- PostToolUse ---
  const postToolUse = hooks.PostToolUse || [];

  function upsertMatcher(arr, matcher, command) {
    const idx = arr.findIndex(h => h.matcher === matcher);
    const entry = {
      matcher,
      hooks: [{ type: 'command', command, async: true }]
    };
    if (idx >= 0) arr[idx] = entry;
    else arr.push(entry);
  }

  upsertMatcher(postToolUse, 'WebFetch',
    JSON.stringify(pluginRoot + '/scripts/auto-ingest-url.sh'));
  upsertMatcher(postToolUse, 'WebSearch',
    JSON.stringify(pluginRoot + '/scripts/auto-save-search.sh'));
  upsertMatcher(postToolUse, 'mcp__context7|mcp__claude_ai_Hugging_Face|mcp__huggingface|mcp__claude-in-chrome__read_page|mcp__claude-in-chrome__get_page_text|mcp__microsoft-learn',
    JSON.stringify(pluginRoot + '/scripts/auto-save-external.sh'));

  hooks.PostToolUse = postToolUse;

  // --- Stop ---
  const stop = hooks.Stop || [];
  const compactCmd = JSON.stringify(pluginRoot + '/hooks/run-hook.cmd') + ' compact-session';
  const hasCompact = stop.some(s => (s.hooks || []).some(h => h.command && h.command.includes('compact-session')));
  if (!hasCompact) {
    stop.push({
      hooks: [{ type: 'command', command: compactCmd, async: true, timeout: 30 }]
    });
  }
  hooks.Stop = stop;

  // --- SessionStart: sync ---
  const sessionStart = hooks.SessionStart || [];
  const syncCmd = JSON.stringify(pluginRoot + '/scripts/sync-to-cloud.sh');
  const hasSync = sessionStart.some(s => (s.hooks || []).some(h => h.command && h.command.includes('sync-to-cloud')));
  if (!hasSync) {
    // Find existing SessionStart entry or create one
    if (sessionStart.length > 0) {
      sessionStart[0].hooks = sessionStart[0].hooks || [];
      sessionStart[0].hooks.push({ type: 'command', command: syncCmd, async: true, timeout: 30 });
    } else {
      sessionStart.push({
        hooks: [{ type: 'command', command: syncCmd, async: true, timeout: 30 }]
      });
    }
  }
  hooks.SessionStart = sessionStart;

  data.hooks = hooks;
  fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2) + '\n');
  console.log('  Hooks installed into: ' + settingsPath);
" "$SETTINGS_FILE" "$PLUGIN_ROOT"

echo ""
echo "  Installed hooks:"
echo "    - WebFetch      → auto-ingest-url.sh"
echo "    - WebSearch     → auto-save-search.sh"
echo "    - External APIs → auto-save-external.sh (context7, HF, chrome, MS Learn)"
echo "    - Stop          → compact-session (session summary)"
echo "    - SessionStart  → sync-to-cloud.sh (batch upload)"
echo ""
echo "  Local storage: ~/.schift/memory/"
echo "    compact/session/   - conversation summaries"
echo "    sources/web/       - fetched URLs"
echo "    sources/search/    - search results"
echo "    sources/external/  - external tool results"
echo ""
echo "  Done! Restart Claude Code to activate."
echo ""
