# @schift-io/memory

> Second brain for Claude Code - saves conversations and web content to your local knowledge base.

## Structure

```
schift-memory/
  CLAUDE.md          # Main plugin docs
  AGENTS.md          # This file
  hooks/
    hooks.json       # Claude Code hook config
    run-hook.cmd     # Hook dispatcher
    session-start    # Injects memory awareness
  skills/
    memory-save/     # Save URLs, notes, insights
    memory-search/   # Search past knowledge
  scripts/
    auto-ingest-url.sh  # Post-WebFetch auto-save
    init.sh              # Bootstrap local memory
  references/
    architecture.md  # How it works under the hood
```

## Skills

- **memory-save**: Invoke when the user shares a URL or wants to save something
- **memory-search**: Invoke when the user needs past context or searches their knowledge base
