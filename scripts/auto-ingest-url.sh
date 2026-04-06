#!/usr/bin/env bash
# Post-WebFetch hook: Haiku가 URL 콘텐츠 요약 → 로컬 저장
set -euo pipefail

WEB_DIR="$HOME/.schift/memory/sources/web"
TMP="/tmp/.schift-ingest-$$"

input=$(cat 2>/dev/null || echo "{}")

# URL + 콘텐츠 추출 → 임시 파일
node -e "
  const fs = require('fs'), crypto = require('crypto');
  try {
    const d = JSON.parse(process.argv[1]);
    const url = (d.tool_input || {}).url || '';
    const content = typeof d.tool_response === 'string' ? d.tool_response : JSON.stringify(d.tool_response || '');
    if (!url || !/^https?:/.test(url) || content.length < 50) process.exit(0);
    const slug = url.replace(/^https?:\\/\\//, '').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 120);
    const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 8);
    fs.writeFileSync('${TMP}.url', url);
    fs.writeFileSync('${TMP}.filename', slug + '_' + hash + '.md');
    fs.writeFileSync('${TMP}.raw', content.slice(0, 30000));
  } catch {}
" "$input" 2>/dev/null

[ ! -f "${TMP}.url" ] && exit 0

url=$(cat "${TMP}.url")
filename=$(cat "${TMP}.filename")
raw="${TMP}.raw"

mkdir -p "$WEB_DIR"
date_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Haiku로 요약
summary=$(claude -p --model haiku --bare --allowedTools "" "아래 웹페이지 내용을 한국어로 3-5문장으로 핵심 요약해줘. 제목도 추출해줘. 형식:
제목: ...
요약: ...

---
$(cat "$raw")" 2>/dev/null || echo "요약 실패")

cat > "${WEB_DIR}/${filename}" <<EOMD
---
url: ${url}
fetched_at: ${date_iso}
domain: reference
synced: false
---

${summary}

EOMD

rm -f "${TMP}.url" "${TMP}.filename" "${TMP}.raw"
exit 0
