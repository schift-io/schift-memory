#!/usr/bin/env bash
# Post-tool hook: Haiku가 외부 지식 요약 → 로컬 저장
# 대상: context7, HuggingFace, chrome read_page/get_page_text, microsoft-learn
set -euo pipefail

EXTERNAL_DIR="$HOME/.schift/memory/sources/external"
TMP="/tmp/.schift-ext-$$"

input=$(cat 2>/dev/null || echo "{}")

# tool_name, 입력, 출력 추출
node -e "
  const fs = require('fs'), crypto = require('crypto');
  try {
    const d = JSON.parse(process.argv[1]);
    const tool = d.tool_name || '';
    const inp = d.tool_input || {};
    const resp = typeof d.tool_response === 'string' ? d.tool_response : JSON.stringify(d.tool_response || '');
    if (resp.length < 50) process.exit(0);

    // 도구별 라벨/쿼리 추출
    let label = '', domain = 'reference';
    if (tool.includes('query-docs') || tool.includes('query_docs')) {
      label = inp.query || inp.topic || 'docs';
      domain = 'reference';
    } else if (tool.includes('paper_search')) {
      label = inp.query || 'paper';
      domain = 'research';
    } else if (tool.includes('hf_doc')) {
      label = inp.query || inp.topic || 'hf-docs';
      domain = 'reference';
    } else if (tool.includes('hub_repo')) {
      label = inp.query || inp.search || 'hf-repo';
      domain = 'research';
    } else if (tool.includes('read_page') || tool.includes('get_page_text')) {
      label = inp.url || inp.tabId || 'chrome-page';
      domain = 'reference';
    } else if (tool.includes('microsoft_docs')) {
      label = inp.query || inp.url || 'ms-docs';
      domain = 'reference';
    } else {
      process.exit(0);
    }

    const slug = (tool + '_' + label).replace(/[^a-zA-Z0-9가-힣_-]/g, '_').replace(/_+/g, '_').slice(0, 100);
    const hash = crypto.createHash('sha256').update(slug + Date.now()).digest('hex').slice(0, 8);

    fs.writeFileSync('${TMP}.tool', tool);
    fs.writeFileSync('${TMP}.label', label);
    fs.writeFileSync('${TMP}.domain', domain);
    fs.writeFileSync('${TMP}.filename', slug + '_' + hash + '.md');
    fs.writeFileSync('${TMP}.raw', resp.slice(0, 30000));
  } catch {}
" "$input" 2>/dev/null

[ ! -f "${TMP}.tool" ] && exit 0

tool=$(cat "${TMP}.tool")
label=$(cat "${TMP}.label")
domain=$(cat "${TMP}.domain")
filename=$(cat "${TMP}.filename")

mkdir -p "$EXTERNAL_DIR"
date_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

summary=$(claude -p --model haiku --bare --allowedTools "" "아래 ${tool} 도구의 결과를 한국어로 3-5개 bullet point로 핵심 정리해줘.

쿼리/주제: ${label}

---
$(cat "${TMP}.raw")" 2>/dev/null || echo "요약 실패")

cat > "${EXTERNAL_DIR}/${filename}" <<EOMD
---
tool: ${tool}
query: ${label}
fetched_at: ${date_iso}
domain: ${domain}
synced: false
---

# ${label}

${summary}

EOMD

rm -f "${TMP}.tool" "${TMP}.label" "${TMP}.domain" "${TMP}.filename" "${TMP}.raw"
exit 0
