---
name: memory
description: Project memory system - save and search past decisions, preferences, context, and notes. Use when user says "remember this", asks "what did we decide about X", or wants to recall/store information.
allowed-tools: Bash(memory-search:*), Bash(memory-sync:*), Read, Write, Edit
---

# Memory

A hybrid search memory system for your project. Save important information and find it later using semantic search.

## Setup (One-time)

If not already installed, the user needs to run:

```bash
npm install -g memory-search
```

## Memory File Structure

```
project/
├── MEMORY.md           # Long-term: preferences, patterns, decisions
└── memory/
    └── YYYY-MM-DD.md   # Daily: session notes, context, progress
```

---

## Searching Memory

When the user asks about past decisions, preferences, or wants to recall information:

```bash
memory-search "QUERY_HERE"
```

### Search Examples

```bash
memory-search "database choice decision"
memory-search "error handling pattern"
memory-search "user preferences coding style"
memory-search "authentication implementation"
```

### Output Format

Returns matching snippets with:
- **path**: File where the match was found
- **lines**: Line range (startLine-endLine)
- **score**: Relevance score (0-1)
- **snippet**: The matching text

### After Searching

1. Present the relevant results to the user
2. If they want more detail, use `Read` to get the full file content
3. If no results found, offer to search with different terms

---

## Saving to Memory

When the user says "remember this", "save this", "note that", or wants to store information:

### Decide Which File

**MEMORY.md** (Permanent):
- User preferences ("I prefer TypeScript")
- Project decisions ("We chose PostgreSQL for X reason")
- Coding patterns ("Always use async/await")
- Architecture decisions
- Important URLs, contacts, credentials references

**memory/YYYY-MM-DD.md** (Daily):
- What was worked on today
- Bugs found and fixed
- Ideas to explore later
- Meeting notes
- Temporary context

### How to Save

1. **Read existing file first** (if it exists) to avoid overwriting
2. **Append new content** with a timestamp or section header
3. **Use clear, searchable language** (will be vector-searched later)
4. **Run sync** after saving to update the search index

```bash
memory-sync
```

### Example: MEMORY.md

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

### Example: memory/2024-01-15.md

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

---

## Tips

- Use descriptive queries, not single keywords
- The search is semantic (understands meaning, not just exact words)
- If unsure which file to use, ask the user
- Always sync after saving new content
