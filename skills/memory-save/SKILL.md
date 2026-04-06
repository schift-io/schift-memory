---
name: memory-save
description: Save URLs, notes, and conversation insights to Schift knowledge bucket. Triggers on URL sharing, "save this", "remember this", or explicit save requests.
---

# Schift Memory - Save

You have a knowledge base powered by Schift Cloud.
When the user shares content worth remembering, save it as a contextualized knowledge document.

## Auth check

Before ANY save operation, verify auth exists:

```bash
cat ~/.schift/memory/config/auth.json
```

If missing or no `api_key`, STOP:

> Schift Memory requires a free account.
> Run: `npx @schift-io/memory login`
> Or sign up: https://schift.io/signup?ref=memory-plugin

Do NOT proceed without a valid API key. There is no local-only mode.

## When to activate

- User shares a URL (article, docs, report, blog post)
- User says "save this", "remember this", "store this"
- User shares important context that should persist across sessions
- After WebFetch, if the content seems valuable

## How to save a URL (the full flow)

This is NOT a simple bookmark. You produce a **contextualized knowledge document**.

### Step 1: Read auth

```bash
SCHIFT_KEY=$(python3 -c "import json; print(json.load(open('$HOME/.schift/memory/config/auth.json'))['api_key'])")
SCHIFT_API=$(python3 -c "import json; print(json.load(open('$HOME/.schift/memory/config/auth.json')).get('cloud_url','https://api.schift.io'))")
```

### Step 2: Fetch and analyze the URL

Use WebFetch to get the content. Then produce a knowledge document with this structure:

```markdown
---
title: <page title>
url: <original url>
fetched_at: <ISO 8601>
context: <why the user shared this / what they were working on>
domain: <domain tag>
---

## Summary
<2-3 sentence summary of what this page is about>

## Why this was investigated
<conversation context - what the user was doing, what question led here>

## Key findings
- <bullet points of the most important information>
- <actionable insights>
- <relevant data points>

## Original content
<extracted markdown from the page>
```

### Step 3: Save locally

Write the knowledge document to the local replica:

```bash
# Save to ~/.schift/memory/sources/web/<filename>.md
```

Use a descriptive filename: `<domain>_<slug>_<hash>.md`

### Step 4: Send to Schift Cloud

```bash
curl -s -X POST "${SCHIFT_API}/v1/memory/ingest-url" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SCHIFT_KEY}" \
  -d '{
    "url": "<the-url>",
    "domain": "<domain>",
    "title": "<title>",
    "summary": "<one-line-summary>",
    "context": "<why this was investigated>",
    "findings": "<key findings as text>"
  }'
```

### Domain values

- `company` - company info, org structure
- `business` - strategy, market, positioning
- `finance` - accounting, pricing, revenue
- `decision` - past decisions, rationale
- `product` - product specs, features, roadmap
- `ops` - operations, processes, tools
- `research` - articles, papers, benchmarks
- `reference` - docs, tutorials, API references

## How to save a note

Same principle - include context:

```bash
curl -s -X POST "${SCHIFT_API}/v1/memory/compact" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SCHIFT_KEY}" \
  -d '{
    "session_id": "<unique-id>",
    "summary": "<the content + context>",
    "domain": "<domain>",
    "topic": "<optional-topic-slug>"
  }'
```

## After saving

Confirm briefly:
- What was saved and key findings
- Which domain it was filed under
- "Saved locally + synced to Schift Cloud"

## Important

- NEVER save without the user's awareness. Ask first: "Save this to your knowledge base?"
- ALWAYS include conversation context (why it was looked up). A URL without context is just a bookmark.
- For sensitive content, warn before saving.
- If auth is missing, ALWAYS redirect to signup. No exceptions.
