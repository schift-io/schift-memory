#!/usr/bin/env bash
# SessionStart hook: sync unsynced local files to Schift Cloud
set -euo pipefail

AUTH_FILE="$HOME/.schift/memory/config/auth.json"
MEMORY_ROOT="$HOME/.schift/memory"

# Gate: no auth = skip
[ ! -f "$AUTH_FILE" ] && exit 0

api_key=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('${AUTH_FILE}','utf-8')).api_key||'')}catch{}" 2>/dev/null || echo "")
cloud_url=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('${AUTH_FILE}','utf-8')).cloud_url||'https://api.schift.io')}catch{process.stdout.write('https://api.schift.io')}" 2>/dev/null || echo "https://api.schift.io")

[ -z "$api_key" ] && exit 0

synced=0

# Sync compact sessions
for f in "${MEMORY_ROOT}"/compact/session/*.md; do
  [ ! -f "$f" ] && continue
  grep -q "synced: false" "$f" || continue

  session_id=$(grep "^session_id:" "$f" | head -1 | sed 's/session_id: //')
  date_val=$(grep "^date:" "$f" | head -1 | sed 's/date: //')
  summary=$(node - "$f" <<'EOF'
const fs = require('fs');
const file = process.argv[2];
const text = fs.readFileSync(file, 'utf-8');
const match = text.match(/^## Summary\n([\s\S]*?)(?:\n## |$)/m);
if (match && match[1].trim()) {
  process.stdout.write(match[1].trim());
  process.exit(0);
}
const body = text.replace(/^---[\s\S]*?---\n?/, '').trim();
process.stdout.write(body);
EOF
)

  [ -z "$summary" ] && continue

  body=$(node -e "
    process.stdout.write(JSON.stringify({
      session_id: process.argv[1],
      summary: process.argv[2],
      date: process.argv[3],
      domain: 'business'
    }));
  " "$session_id" "$summary" "$date_val" 2>/dev/null)

  http_code=$(curl -sf -o /dev/null -w "%{http_code}" \
    -X POST "${cloud_url}/v1/memory/compact" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${api_key}" \
    -d "$body" 2>/dev/null || echo "000")

  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    sed -i '' 's/synced: false/synced: true/' "$f"
    synced=$((synced + 1))
  fi
done

# Sync web sources
for f in "${MEMORY_ROOT}"/sources/web/*.md; do
  [ ! -f "$f" ] && continue
  grep -q "synced: false" "$f" || continue

  url=$(grep "^url:" "$f" | head -1 | sed 's/url: //')
  [ -z "$url" ] && continue

  body=$(node -e "
    process.stdout.write(JSON.stringify({
      url: process.argv[1],
      domain: 'reference'
    }));
  " "$url" 2>/dev/null)

  http_code=$(curl -sf -o /dev/null -w "%{http_code}" \
    -X POST "${cloud_url}/v1/memory/ingest-url" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${api_key}" \
    -d "$body" 2>/dev/null || echo "000")

  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    sed -i '' 's/synced: false/synced: true/' "$f"
    synced=$((synced + 1))
  fi
done

# Sync search artifacts as notes
for f in "${MEMORY_ROOT}"/sources/search/*.md; do
  [ ! -f "$f" ] && continue
  grep -q "synced: false" "$f" || continue

  query=$(grep "^query:" "$f" | head -1 | sed 's/query: //')
  searched_at=$(grep "^searched_at:" "$f" | head -1 | sed 's/searched_at: //')
  summary=$(node - "$f" <<'EOF'
const fs = require('fs');
const file = process.argv[2];
const text = fs.readFileSync(file, 'utf-8');
const body = text.replace(/^---[\s\S]*?---\n?/, '').trim();
process.stdout.write(body);
EOF
)

  [ -z "$summary" ] && continue

  body=$(node -e "
    process.stdout.write(JSON.stringify({
      session_id: process.argv[1],
      summary: process.argv[2],
      date: process.argv[3],
      domain: 'research',
      topic: process.argv[4]
    }));
  " "search_$(date +%s)_$(basename "$f" .md)" "$summary" "$searched_at" "$query" 2>/dev/null)

  http_code=$(curl -sf -o /dev/null -w "%{http_code}" \
    -X POST "${cloud_url}/v1/memory/compact" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${api_key}" \
    -d "$body" 2>/dev/null || echo "000")

  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    sed -i '' 's/synced: false/synced: true/' "$f"
    synced=$((synced + 1))
  fi
done

if [ "$synced" -gt 0 ]; then
  echo "{\"systemMessage\":\"Schift Memory: synced ${synced} items to cloud.\"}"
else
  echo '{}'
fi
