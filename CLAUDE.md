# @schift-io/memory

Second brain plugin for Dot. Saves conversations, web content, and notes to Schift Cloud.

**Requires a Schift account. No local-only mode. No fallback keys.**

## Skills

| Skill | Trigger |
|-------|---------|
| `memory-save` | URL shared, "save this", "remember this" |
| `memory-search` | "find that...", "what did we discuss about...", needs past context |

## Setup

```bash
schift auth login              # sign up + API key (shared with CLI)
npx @schift-io/memory init     # bootstrap cloud bucket
```

## Release / Publish

- source of truth: monorepo `packages/schift-memory/`
- public repo: `schift-io/schift-memory`
- monorepo `main`에 `packages/schift-memory/**` 변경이 들어가면 `.github/workflows/sync-public-repos.yml`의 `sync-schift-memory` job이 public repo로 sync한다
- npm publish는 public repo에서만 일어난다
- **버전은 git tag가 진실의 원천**이다. `package.json` version을 수동으로 올리지 않는다
- release 방법:

```bash
git clone https://github.com/schift-io/schift-memory.git
cd schift-memory
git tag v0.2.1
git push origin v0.2.1
```

- 위 tag push가 `Publish schift-memory to npm` workflow를 트리거하고, workflow 내부에서 `npm pkg set version="$VERSION"` 후 publish한다

## What's on the user's machine

```
~/.schift/
  config.json              # API key (shared with schift CLI)
~/.schift/memory/
  config/
    auth.json              # API key (auto-migrated to ~/.schift/config.json)
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
