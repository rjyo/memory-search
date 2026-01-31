# memory-search

A hybrid search memory system for coding agents (70% vector similarity + 30% BM25 keyword).

Based on the memory system from [OpenClaw](https://github.com/openclaw/openclaw) (originally Clawdbot).

## Features

- Hybrid search combining vector similarity and keyword matching
- Local embeddings via `node-llama-cpp` (EmbeddingGemma 300M, 768 dims)
- OpenAI fallback when local unavailable
- `bun:sqlite` storage (no native extensions needed)
- Support for `MEMORY.md` + `memory/*.md` files
- Embedding cache for efficiency
- Works with Claude Code, Cursor, Codex, and 30+ other agents

## Quick Start

### 1. Install the Skill

```bash
npx skills add rjyo/memory-search
```

This installs the `/memory` skill to your coding agent.

### 2. Install the CLI

```bash
npm install -g memory-search
```

### 3. Create Memory Files

```bash
touch MEMORY.md
mkdir -p memory
```

### 4. Use It

**Save information:**
```
/memory remember that I prefer TypeScript over JavaScript
```

**Search memories:**
```
/memory what did we decide about authentication?
```

Or just ask naturally - the skill triggers on phrases like "remember this" or "what did we decide about X".

## Alternative Installation

### Install CLI Only (No Skill)

```bash
# From npm (when published)
npm install -g memory-search

# From source
git clone https://github.com/rjyo/memory-search
cd memory-search
bun install && bun run build
npm link
```

### Local Embeddings (Optional)

For free, offline embeddings (~600MB model download on first use):
```bash
npm install -g node-llama-cpp
```

### OpenAI Embeddings (Faster)

```bash
export OPENAI_API_KEY=sk-...
```

## Automatic Memory Injection (Optional)

Want Claude to search memory automatically? Add to your `.claude/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [{
      "command": "memory-search \"project context preferences decisions\"",
      "timeout": 30000
    }]
  }
}
```

Or add to your `CLAUDE.md`:
```markdown
## Memory
When questions relate to past decisions or preferences, use /memory to search first.
```

## CLI Commands

### Search
```bash
memory-search "your query"
memory-search --help
```

### Sync Index
```bash
memory-sync [--force]
memory-sync --help
```

### Development Scripts (from source)
```bash
bun scripts/search.ts "your query"
bun scripts/sync.ts [--force]
```

## Programmatic Usage

```typescript
import { MemoryIndex } from "memory-search";

// Create with local embeddings (no API key needed)
const memory = await MemoryIndex.create({
  workspaceDir: "./my-project",
});

// Or with OpenAI (faster queries)
const memory = await MemoryIndex.create({
  workspaceDir: "./my-project",
  embeddingProvider: "openai",
  openaiApiKey: process.env.OPENAI_API_KEY,
});

// Index files
await memory.sync();

// Search
const results = await memory.search("authentication");
// Returns: [{ path, startLine, endLine, score, snippet }]

// Read a file
const file = await memory.readFile({ path: "MEMORY.md" });

// Get status
const status = memory.status();

// Clean up
await memory.close();
```

## Memory File Structure

```
your-project/
├── MEMORY.md           # Long-term: preferences, patterns, decisions
└── memory/
    ├── 2024-01-15.md   # Daily notes
    ├── 2024-01-16.md
    └── architecture.md # Topic-specific memory
```

### MEMORY.md (Permanent)
- User preferences
- Project decisions
- Coding patterns
- Architecture choices

### memory/*.md (Contextual)
- Daily session notes
- Work in progress
- Ideas to explore
- Meeting notes

## Configuration

```typescript
interface MemoryConfig {
  workspaceDir: string;       // Required: directory with MEMORY.md

  // Database
  dbPath?: string;            // Default: {workspaceDir}/.memory.sqlite

  // Embeddings (auto-detects: local → openai → error)
  embeddingProvider?: 'local' | 'openai' | 'auto';  // Default: auto
  openaiApiKey?: string;      // Required if provider is 'openai'
  openaiModel?: string;       // Default: text-embedding-3-small
  localModelPath?: string;    // Default: hf:ggml-org/embeddinggemma-300M-GGUF/...
  modelCacheDir?: string;     // Default: ~/.cache/memory-search

  // Chunking
  chunkTokens?: number;       // Default: 400
  chunkOverlap?: number;      // Default: 80

  // Search
  maxResults?: number;        // Default: 6
  minScore?: number;          // Default: 0.35
  vectorWeight?: number;      // Default: 0.7
  textWeight?: number;        // Default: 0.3
}
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Build
bun run build
```

## How It Works

1. **Indexing**: Scans `MEMORY.md` and `memory/*.md`, chunks into ~400 token pieces
2. **Embedding**: Converts chunks to vectors (local or OpenAI)
3. **Storage**: SQLite database with FTS5 for keyword search
4. **Search**: Hybrid (70% vector similarity + 30% BM25 keyword)
5. **Caching**: Embeddings cached to avoid re-computation

## License

MIT
