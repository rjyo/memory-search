# memory-search

A standalone memory search module with hybrid search (70% vector similarity + 30% BM25 keyword).

## Features

- Hybrid search combining vector similarity and keyword matching
- Local embeddings via `node-llama-cpp` (EmbeddingGemma 300M, 768 dims)
- OpenAI fallback when local unavailable
- `bun:sqlite` storage (no native extensions needed)
- Support for `MEMORY.md` + `memory/*.md` files
- Embedding cache for efficiency

## Installation

```bash
bun add memory-search
```

For local embeddings (optional):
```bash
bun add node-llama-cpp
```

## Usage

```typescript
import { MemoryIndex } from "memory-search";

// Create with local embeddings (no API key needed)
const memory = await MemoryIndex.create({
  workspaceDir: "./my-project",
});

// Or with OpenAI
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

## File Structure

The module indexes these files from your workspace:
- `MEMORY.md` or `memory.md` in the root
- All `.md` files under the `memory/` directory

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

## License

MIT
