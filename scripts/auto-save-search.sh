#!/usr/bin/env bash
# Post-WebSearch hook: Haiku가 검색 결과 요약 → 로컬 저장
set -euo pipefail

SEARCH_DIR="$HOME/.schift/memory/sources/search"
TMP="/tmp/.schift-search-$$"

input=$(cat 2>/dev/null || echo "{}")

node -e "
  const fs = require('fs'), crypto = require('crypto');
  try {
    const d = JSON.parse(process.argv[1]);
    const query = (d.tool_input || {}).query || '';
    const results = typeof d.tool_response === 'string' ? d.tool_response : JSON.stringify(d.tool_response || '');
    if (!query || results.length < 10) process.exit(0);
    const slug = query.replace(/[^a-zA-Z0-9가-힣 _-]/g, '').replace(/\\s+/g, '_').slice(0, 80);
    const hash = crypto.createHash('sha256').update(query + Date.now()).digest('hex').slice(0, 8);
    fs.writeFileSync('${TMP}.query', query);
    fs.writeFileSync('${TMP}.filename', slug + '_' + hash + '.md');
    fs.writeFileSync('${TMP}.raw', results.slice(0, 20000));
  } catch {}
" "$input" 2>/dev/null

[ ! -f "${TMP}.query" ] && exit 0

query=$(cat "${TMP}.query")
filename=$(cat "${TMP}.filename")

mkdir -p "$SEARCH_DIR"
date_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

summary=$(claude -p --model haiku --bare --allowedTools "" "아래 검색 결과에서 핵심 정보를 3-5개 bullet point로 정리해줘. 한국어로.

검색어: ${query}

---
$(cat "${TMP}.raw")" 2>/dev/null || echo "요약 실패")

cat > "${SEARCH_DIR}/${filename}" <<EOMD
---
query: ${query}
searched_at: ${date_iso}
domain: research
synced: false
---

# ${query}

${summary}

EOMD

rm -f "${TMP}.query" "${TMP}.filename" "${TMP}.raw"
exit 0
