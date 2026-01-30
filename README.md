# memory-search

A standalone memory search module with hybrid search (70% vector similarity + 30% BM25 keyword).

## Features

- Hybrid search combining vector similarity and keyword matching
- Local embeddings via `node-llama-cpp` (EmbeddingGemma 300M, 768 dims)
- OpenAI fallback when local unavailable
- `bun:sqlite` storage (no native extensions needed)
- Support for `MEMORY.md` + `memory/*.md` files
- Embedding cache for efficiency
- **Claude Code skills** for easy integration

## Installation

```bash
cd ~/projects/memory-search
bun install
```

For local embeddings (optional, ~600MB model download on first use):
```bash
bun add node-llama-cpp
```

## Claude Code Integration

### 1. Copy Skills to Your Project

```bash
cp -r ~/projects/memory-search/skills/remember ~/.claude/skills/
cp -r ~/projects/memory-search/skills/memory-search ~/.claude/skills/
```

Or symlink them:
```bash
ln -s ~/projects/memory-search/skills/remember ~/.claude/skills/remember
ln -s ~/projects/memory-search/skills/memory-search ~/.claude/skills/memory-search
```

### 2. Create Memory Files

In your project:
```bash
touch MEMORY.md
mkdir -p memory
```

### 3. Use the Skills

**To save information:**
```
/remember that I prefer TypeScript over JavaScript
```

**To search memories:**
```
/memory-search authentication implementation
```

Or just ask naturally:
- "Remember that we decided to use PostgreSQL"
- "What did we decide about the database?"

### 4. Environment Variables (Optional)

For faster search queries, set an OpenAI API key:
```bash
export OPENAI_API_KEY=sk-...
```

Without this, local embeddings are used (slower first load, but free).

## CLI Scripts

### Search
```bash
bun ~/projects/memory-search/scripts/search.ts "your query"
```

### Sync Index
```bash
bun ~/projects/memory-search/scripts/sync.ts [--force]
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
