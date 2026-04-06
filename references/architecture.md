# Schift Memory Architecture

## Core Principle

**Compute는 전부 Cloud. Raw data 복제본은 유저 로컬에.**

- Embedding, vector search, LLM routing = Schift Cloud
- Engine 바이너리, 벡터 인덱스 = 유저 컴에 없음
- 원본 markdown (웹페이지, 세션 compact, 메모) = 유저 로컬에 복제본 보관
- Cloud가 진실의 원천, 로컬은 읽기 전용 복제

## Data Flow

```
User conversation (Claude Code)
    |
    v
[Hook: SessionStart] -- checks ~/.schift/memory/config/auth.json
    |
    |-- no auth --> "Sign up at schift.io/signup" (BLOCKED)
    |
    |-- auth OK --> inject memory skills
    |
    +---> User shares URL ---> memory-save skill
    |         |
    |         v
    |     WebFetch content (Claude Code built-in)
    |         |
    |         v
    |     POST api.schift.io/v1/local-memory/ingest-url
    |         |
    |         v
    |     Schift Cloud: fetch + extract + embed + store
    |         |
    |         v
    |     Response includes markdown --> save to ~/.schift/memory/sources/web/
    |
    +---> Session ends ---> compact hook
    |         |
    |         v
    |     POST api.schift.io/v1/local-memory/compact
    |         |
    |         v
    |     Schift Cloud: summarize + embed + store
    |         |
    |         v
    |     Response includes compact md --> save to ~/.schift/memory/compact/session/
    |
    +---> User searches ---> memory-search skill
              |
              v
          POST api.schift.io/v1/query
              |
              v
          Schift Cloud: Engine vector search
              |
              v
          Return ranked results
```

## What lives on the user's machine

```
~/.schift/memory/
  config/
    auth.json             # API key (required)
  sources/
    web/                  # Fetched web pages (markdown replica)
  compact/
    session/              # Conversation summaries (markdown replica)
    topic/                # Aggregated topics (markdown replica)
```

Read-only replicas. The user owns their raw data.
If they delete it locally, Cloud still has the original.
If they cancel their account, they keep the markdown files.

## What lives on Schift Cloud (exclusively)

- Embedded vectors (Engine)
- Vector index
- Manifest / metadata
- Usage metering
- Search ranking

## Why this split

| Concern | Answer |
|---------|--------|
| Data ownership | User has markdown copies. No hostage situation. |
| Lock-in | Search/embed only works via Cloud. Can't self-host. |
| Portability | Markdown is universal. Export = just copy the folder. |
| Trust | "Your data is yours" = lower signup friction. |
| Revenue | Every search = API call = metered. Raw files don't search themselves. |

## Metadata Schema

Every document in the user's cloud bucket has:

| Field | Required | Values |
|-------|----------|--------|
| `source_type` | yes | `raw`, `session_compact`, `topic_synthesis` |
| `domain` | yes | `company`, `business`, `finance`, `decision`, `product`, `ops`, `research`, `reference` |
| `origin` | yes | `docs`, `memory`, `claude_history`, `external`, `web` |
| `updated_at` | yes | ISO 8601 UTC |
| `source_url` | no | Original URL (for web sources) |
| `title` | no | Document title |
| `session_id` | no | Claude session ID |
| `topic` | no | Topic slug |

## Search Priority

1. `topic_synthesis` - aggregated, most reliable
2. `session_compact` - conversation context
3. `raw` - original documents
