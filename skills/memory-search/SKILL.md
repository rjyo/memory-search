---
name: memory-search
description: Search project memory for past decisions, preferences, context, and notes. Use when user asks "what did we decide about X", "how did we implement Y", "what's the pattern for Z", or wants to recall past information.
allowed-tools: Bash(bun:*), Read
---

# Memory Search

Search the project's memory index for relevant past context.

## How to Search

Run the search script with the user's query:

```bash
bun ~/projects/memory-search/scripts/search.ts "QUERY_HERE"
```

Replace `QUERY_HERE` with a natural language description of what you're looking for.

## Examples

### Finding decisions
```bash
bun ~/projects/memory-search/scripts/search.ts "database choice decision"
```

### Finding patterns
```bash
bun ~/projects/memory-search/scripts/search.ts "error handling pattern"
```

### Finding recent work
```bash
bun ~/projects/memory-search/scripts/search.ts "authentication implementation"
```

### Finding preferences
```bash
bun ~/projects/memory-search/scripts/search.ts "user preferences coding style"
```

## Output Format

The script returns matching snippets with:
- **path**: File where the match was found
- **lines**: Line range (startLine-endLine)
- **score**: Relevance score (0-1)
- **snippet**: The matching text

## After Searching

1. Present the relevant results to the user
2. If they want more detail, use `Read` to get the full file content
3. If no results found, offer to search with different terms

## Tips

- Use descriptive queries, not single keywords
- The search is semantic (understands meaning, not just exact words)
- Combine with `Read` tool to get full context from matched files
