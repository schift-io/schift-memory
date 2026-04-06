# @schift-io/memory

Second brain plugin for Claude Code. Saves conversations, web content, and notes to Schift Cloud.

**Requires a Schift account. No local-only mode. No fallback keys.**

## Skills

| Skill | Trigger |
|-------|---------|
| `memory-save` | URL shared, "save this", "remember this" |
| `memory-search` | "find that...", "what did we discuss about...", needs past context |

## Setup

```bash
npx @schift-io/memory login    # sign up + API key
npx @schift-io/memory init     # bootstrap cloud bucket
```

## What's on the user's machine

```
~/.schift/memory/
  config/
    auth.json              # API key
  sources/
    web/                   # Web page markdown (replica)
  compact/
    session/               # Conversation summaries (replica)
    topic/                 # Aggregated topics (replica)
```

Raw data replicas stay local. User owns their data.
Compute (embed, search, index) is Cloud-only.

## Schift Cloud API

- `POST /v1/memory/bootstrap` - Create user's bucket
- `POST /v1/memory/ingest-url` - Save a URL
- `POST /v1/memory/compact` - Save conversation summary
- `POST /v1/query` - Search (collection=localbucket)
