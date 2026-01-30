---
name: remember
description: Save important information to project memory. Use when user says "remember this", "save this", "note that", or wants to store preferences, decisions, or facts for later.
allowed-tools: Write, Edit, Read
---

# Remember

Save information to the project's memory system for future retrieval.

## Memory File Structure

```
project/
├── MEMORY.md           # Long-term: preferences, patterns, decisions
└── memory/
    └── YYYY-MM-DD.md   # Daily: session notes, context, progress
```

## When to Use Which File

### MEMORY.md (Permanent)
- User preferences ("I prefer TypeScript")
- Project decisions ("We chose PostgreSQL for X reason")
- Coding patterns ("Always use async/await, not callbacks")
- Important contacts, URLs, credentials references
- Architecture decisions

### memory/YYYY-MM-DD.md (Daily)
- What was worked on today
- Bugs found and fixed
- Ideas to explore later
- Meeting notes
- Temporary context that might be useful tomorrow

## How to Save

1. **Read existing file first** (if it exists) to avoid overwriting
2. **Append new content** with a timestamp header
3. **Use clear, searchable language** (will be vector-searched later)

### Example: Save to MEMORY.md

```markdown
## User Preferences

- Prefers Bun over Node for TypeScript projects
- Uses pnpm as package manager
- Likes minimal dependencies

## Project Decisions

### 2024-01-15: Database Choice
Chose SQLite over PostgreSQL because:
- Single-user application
- No need for concurrent writes
- Simpler deployment
```

### Example: Save to memory/2024-01-15.md

```markdown
# 2024-01-15

## Session Notes

### 10:30 - Authentication Setup
- Implemented JWT auth flow
- Added refresh token rotation
- TODO: Add rate limiting

### 14:00 - Bug Fix
- Fixed race condition in user creation
- Root cause: missing transaction wrapper
```

## Instructions

When user asks to remember something:

1. Determine if it's permanent (MEMORY.md) or daily (memory/YYYY-MM-DD.md)
2. Read the target file if it exists
3. Append the new information with appropriate headers
4. Confirm what was saved

If unsure which file, ask: "Should I save this as a permanent preference (MEMORY.md) or as today's notes (memory/YYYY-MM-DD.md)?"
