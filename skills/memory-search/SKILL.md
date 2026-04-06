---
name: memory-search
description: Search Schift knowledge bucket for past conversations, saved URLs, notes, and documents. Use when user asks "what did we discuss about X", "find that article", or needs context from previous sessions.
---

# Schift Memory - Search

Search your second brain for previously saved content.

## Auth check

Before ANY search operation, verify auth exists:

```bash
cat ~/.schift/memory/config/auth.json
```

If the file is missing or has no `api_key`, STOP and tell the user:

> Schift Memory requires a free account.
> Run: `npx @schift-io/memory login`
> Or sign up: https://schift.io/signup?ref=memory-plugin

Do NOT proceed without a valid API key. There is no local-only mode.

## When to activate

- User asks "what did we talk about...", "find that article about...", "what was the decision on..."
- User needs context from a previous session
- Before starting work that might benefit from past knowledge

## How to search

Read auth first:
```bash
SCHIFT_KEY=$(python3 -c "import json; print(json.load(open('$HOME/.schift/memory/config/auth.json'))['api_key'])")
SCHIFT_API=$(python3 -c "import json; print(json.load(open('$HOME/.schift/memory/config/auth.json')).get('cloud_url','https://api.schift.io'))")
```

### Query (recommended)

```bash
curl -s -X POST "${SCHIFT_API}/v1/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SCHIFT_KEY}" \
  -d '{
    "query": "<natural language query>",
    "collection": "localbucket",
    "top_k": 5
  }'
```

### With domain filter (bucket search)

```bash
curl -s -X POST "${SCHIFT_API}/v1/buckets/<bucket_id>/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SCHIFT_KEY}" \
  -d '{
    "query": "<query>",
    "top_k": 5,
    "filter": {"domain": "business"}
  }'
```

## Presenting results

- Show the top 3 results with title, domain, and a snippet
- If the result has `source_url`, include it
- If `source_type` is `session_compact`, note it came from a past conversation
- If `source_type` is `topic_synthesis`, it's an aggregated topic summary (highest quality)

## Source type priority

1. `topic_synthesis` - aggregated, most reliable
2. `session_compact` - conversation summaries
3. `raw` - original documents/web pages

## If no results

- Suggest broadening the query
- Note: "Your knowledge base might not have this yet. Want me to search the web and save it?"
- If auth error: redirect to `npx @schift-io/memory login`
