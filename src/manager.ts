import { Database } from "bun:sqlite";
import fs from "fs/promises";
import path from "path";

import type { MemoryConfig, ResolvedConfig } from "./config.js";
import { resolveConfig } from "./config.js";
import type { EmbeddingProvider, EmbeddingProviderResult } from "./embeddings/index.js";
import { createEmbeddingProvider } from "./embeddings/index.js";
import { mergeHybridResults } from "./hybrid.js";
import {
  buildFileEntry,
  chunkMarkdown,
  ensureDir,
  hashText,
  isMemoryPath,
  listMemoryFiles,
  type MemoryChunk,
  type MemoryFileEntry,
  normalizeRelPath,
  parseEmbedding,
} from "./internal.js";
import { ensureMemoryIndexSchema } from "./schema.js";
import { searchKeyword, searchVector, type SearchSource } from "./search.js";
import { log } from "./utils.js";

type MemorySource = "memory";

export type MemorySearchResult = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
};

type MemoryIndexMeta = {
  model: string;
  provider: string;
  providerKey: string;
  chunkTokens: number;
  chunkOverlap: number;
};

const META_KEY = "memory_index_meta_v1";
const SNIPPET_MAX_CHARS = 700;
const FTS_TABLE = "chunks_fts";
const EMBEDDING_CACHE_TABLE = "embedding_cache";
const EMBEDDING_BATCH_MAX_TOKENS = 8000;
const EMBEDDING_APPROX_CHARS_PER_TOKEN = 1;

export class MemoryIndex {
  private readonly config: ResolvedConfig;
  private readonly db: Database;
  private provider: EmbeddingProvider;
  private readonly requestedProvider: "local" | "openai" | "auto";
  private fallbackFrom?: "local" | "openai";
  private fallbackReason?: string;
  private providerKey: string;
  private readonly fts: { enabled: boolean; available: boolean; loadError?: string };
  private closed = false;

  constructor(userConfig: MemoryConfig) {
    this.config = resolveConfig(userConfig);
    this.db = this.openDatabase();
    this.provider = null!; // Set during init
    this.requestedProvider = this.config.embeddingProvider;
    this.providerKey = "";
    this.fts = { enabled: true, available: false };
  }

  private async init(): Promise<void> {
    const result = await createEmbeddingProvider(this.config);
    this.provider = result.provider;
    this.fallbackFrom = result.fallbackFrom;
    this.fallbackReason = result.fallbackReason;
    this.providerKey = this.computeProviderKey();
    this.ensureSchema();
  }

  /**
   * Create a new MemoryIndex instance.
   * Use this static factory method instead of the constructor.
   */
  static async create(config: MemoryConfig): Promise<MemoryIndex> {
    const instance = new MemoryIndex(config);
    await instance.init();
    return instance;
  }

  /**
   * Synchronize the index with files on disk.
   * Call this after creating the index and whenever files change.
   */
  async sync(params?: { force?: boolean }): Promise<void> {
    const meta = this.readMeta();
    const needsFullReindex =
      params?.force ||
      !meta ||
      meta.model !== this.provider.model ||
      meta.provider !== this.provider.id ||
      meta.providerKey !== this.providerKey ||
      meta.chunkTokens !== this.config.chunkTokens ||
      meta.chunkOverlap !== this.config.chunkOverlap;

    if (needsFullReindex) {
      this.resetIndex();
    }

    await this.syncMemoryFiles({ needsFullReindex });

    const nextMeta: MemoryIndexMeta = {
      model: this.provider.model,
      provider: this.provider.id,
      providerKey: this.providerKey,
      chunkTokens: this.config.chunkTokens,
      chunkOverlap: this.config.chunkOverlap,
    };
    this.writeMeta(nextMeta);
  }

  /**
   * Search the indexed memory files.
   */
  async search(
    query: string,
    opts?: { maxResults?: number; minScore?: number },
  ): Promise<MemorySearchResult[]> {
    const cleaned = query.trim();
    if (!cleaned) return [];

    const minScore = opts?.minScore ?? this.config.minScore;
    const maxResults = opts?.maxResults ?? this.config.maxResults;
    const candidates = Math.min(200, Math.max(1, Math.floor(maxResults * 3)));

    const keywordResults =
      this.fts.enabled && this.fts.available
        ? this.searchKeyword(cleaned, candidates)
        : [];

    const queryVec = await this.provider.embedQuery(cleaned);
    const hasVector = queryVec.some((v) => v !== 0);
    const vectorResults = hasVector ? this.searchVector(queryVec, candidates) : [];

    if (!this.fts.available) {
      return vectorResults
        .filter((entry) => entry.score >= minScore)
        .slice(0, maxResults)
        .map(({ path, startLine, endLine, score, snippet }) => ({
          path,
          startLine,
          endLine,
          score,
          snippet,
        }));
    }

    const merged = mergeHybridResults({
      vector: vectorResults.map((r) => ({
        id: r.id,
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        source: "memory",
        snippet: r.snippet,
        vectorScore: r.score,
      })),
      keyword: keywordResults.map((r) => ({
        id: r.id,
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        source: "memory",
        snippet: r.snippet,
        textScore: r.textScore,
      })),
      vectorWeight: this.config.vectorWeight,
      textWeight: this.config.textWeight,
    });

    return merged
      .filter((entry) => entry.score >= minScore)
      .slice(0, maxResults)
      .map(({ path, startLine, endLine, score, snippet }) => ({
        path,
        startLine,
        endLine,
        score,
        snippet,
      }));
  }

  /**
   * Read a memory file or portion of it.
   */
  async readFile(params: {
    path: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }> {
    const relPath = normalizeRelPath(params.path);
    if (!relPath || !isMemoryPath(relPath)) {
      throw new Error("Invalid path: must be MEMORY.md, memory.md, or under memory/");
    }
    const absPath = path.resolve(this.config.workspaceDir, relPath);
    if (!absPath.startsWith(this.config.workspaceDir)) {
      throw new Error("Path escapes workspace");
    }
    const content = await fs.readFile(absPath, "utf-8");
    if (!params.from && !params.lines) {
      return { text: content, path: relPath };
    }
    const lines = content.split("\n");
    const start = Math.max(1, params.from ?? 1);
    const count = Math.max(1, params.lines ?? lines.length);
    const slice = lines.slice(start - 1, start - 1 + count);
    return { text: slice.join("\n"), path: relPath };
  }

  /**
   * Get status information about the index.
   */
  status(): {
    files: number;
    chunks: number;
    workspaceDir: string;
    dbPath: string;
    provider: string;
    model: string;
    fts: { enabled: boolean; available: boolean; error?: string };
    fallback?: { from: string; reason?: string };
  } {
    const sourceFilter = this.buildSourceFilter();
    const files = this.db
      .prepare(`SELECT COUNT(*) as c FROM files WHERE 1=1${sourceFilter.sql}`)
      .get(...sourceFilter.params) as { c: number };
    const chunks = this.db
      .prepare(`SELECT COUNT(*) as c FROM chunks WHERE 1=1${sourceFilter.sql}`)
      .get(...sourceFilter.params) as { c: number };

    return {
      files: files?.c ?? 0,
      chunks: chunks?.c ?? 0,
      workspaceDir: this.config.workspaceDir,
      dbPath: this.config.dbPath,
      provider: this.provider.id,
      model: this.provider.model,
      fts: {
        enabled: this.fts.enabled,
        available: this.fts.available,
        error: this.fts.loadError,
      },
      fallback: this.fallbackReason
        ? { from: this.fallbackFrom ?? "local", reason: this.fallbackReason }
        : undefined,
    };
  }

  /**
   * Close the index and release resources.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private openDatabase(): Database {
    const dbPath = this.config.dbPath;
    const dir = path.dirname(dbPath);
    ensureDir(dir);
    return new Database(dbPath);
  }

  private ensureSchema(): void {
    const result = ensureMemoryIndexSchema({
      db: this.db,
      embeddingCacheTable: EMBEDDING_CACHE_TABLE,
      ftsTable: FTS_TABLE,
      ftsEnabled: this.fts.enabled,
    });
    this.fts.available = result.ftsAvailable;
    if (result.ftsError) {
      this.fts.loadError = result.ftsError;
      log.warn(`FTS unavailable: ${result.ftsError}`);
    }
  }

  private buildSourceFilter(alias?: string): { sql: string; params: SearchSource[] } {
    const column = alias ? `${alias}.source` : "source";
    return { sql: ` AND ${column} = ?`, params: ["memory"] };
  }

  private readMeta(): MemoryIndexMeta | null {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key = ?`).get(META_KEY) as
      | { value: string }
      | undefined;
    if (!row?.value) return null;
    try {
      return JSON.parse(row.value) as MemoryIndexMeta;
    } catch {
      return null;
    }
  }

  private writeMeta(meta: MemoryIndexMeta): void {
    const value = JSON.stringify(meta);
    this.db
      .prepare(
        `INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      )
      .run(META_KEY, value);
  }

  private resetIndex(): void {
    this.db.exec(`DELETE FROM files`);
    this.db.exec(`DELETE FROM chunks`);
    if (this.fts.enabled && this.fts.available) {
      try {
        this.db.exec(`DELETE FROM ${FTS_TABLE}`);
      } catch {}
    }
  }

  private computeProviderKey(): string {
    return hashText(JSON.stringify({ provider: this.provider.id, model: this.provider.model }));
  }

  private async syncMemoryFiles(params: { needsFullReindex: boolean }): Promise<void> {
    const files = await listMemoryFiles(this.config.workspaceDir);
    const fileEntries = await Promise.all(
      files.map(async (file) => buildFileEntry(file, this.config.workspaceDir)),
    );

    log.debug("memory sync: indexing files", {
      files: fileEntries.length,
      needsFullReindex: params.needsFullReindex,
    });

    const activePaths = new Set(fileEntries.map((entry) => entry.path));

    for (const entry of fileEntries) {
      const record = this.db
        .prepare(`SELECT hash FROM files WHERE path = ? AND source = ?`)
        .get(entry.path, "memory") as { hash: string } | undefined;

      if (!params.needsFullReindex && record?.hash === entry.hash) {
        continue;
      }

      await this.indexFile(entry);
    }

    // Clean up stale files
    const staleRows = this.db
      .prepare(`SELECT path FROM files WHERE source = ?`)
      .all("memory") as Array<{ path: string }>;

    for (const stale of staleRows) {
      if (activePaths.has(stale.path)) continue;
      this.db.prepare(`DELETE FROM files WHERE path = ? AND source = ?`).run(stale.path, "memory");
      this.db.prepare(`DELETE FROM chunks WHERE path = ? AND source = ?`).run(stale.path, "memory");
      if (this.fts.enabled && this.fts.available) {
        try {
          this.db
            .prepare(`DELETE FROM ${FTS_TABLE} WHERE path = ? AND source = ? AND model = ?`)
            .run(stale.path, "memory", this.provider.model);
        } catch {}
      }
    }
  }

  private async indexFile(entry: MemoryFileEntry): Promise<void> {
    const content = await fs.readFile(entry.absPath, "utf-8");
    const chunks = chunkMarkdown(content, {
      tokens: this.config.chunkTokens,
      overlap: this.config.chunkOverlap,
    }).filter((chunk) => chunk.text.trim().length > 0);

    const embeddings = await this.embedChunksInBatches(chunks);
    const now = Date.now();

    // Clear existing data for this file
    if (this.fts.enabled && this.fts.available) {
      try {
        this.db
          .prepare(`DELETE FROM ${FTS_TABLE} WHERE path = ? AND source = ? AND model = ?`)
          .run(entry.path, "memory", this.provider.model);
      } catch {}
    }
    this.db.prepare(`DELETE FROM chunks WHERE path = ? AND source = ?`).run(entry.path, "memory");

    // Insert new chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i] ?? [];
      const id = hashText(
        `memory:${entry.path}:${chunk.startLine}:${chunk.endLine}:${chunk.hash}:${this.provider.model}`,
      );

      this.db
        .prepare(
          `INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             hash=excluded.hash,
             model=excluded.model,
             text=excluded.text,
             embedding=excluded.embedding,
             updated_at=excluded.updated_at`,
        )
        .run(
          id,
          entry.path,
          "memory",
          chunk.startLine,
          chunk.endLine,
          chunk.hash,
          this.provider.model,
          chunk.text,
          JSON.stringify(embedding),
          now,
        );

      if (this.fts.enabled && this.fts.available) {
        this.db
          .prepare(
            `INSERT INTO ${FTS_TABLE} (text, id, path, source, model, start_line, end_line)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(chunk.text, id, entry.path, "memory", this.provider.model, chunk.startLine, chunk.endLine);
      }
    }

    // Update file record
    this.db
      .prepare(
        `INSERT INTO files (path, source, hash, mtime, size) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           source=excluded.source,
           hash=excluded.hash,
           mtime=excluded.mtime,
           size=excluded.size`,
      )
      .run(entry.path, "memory", entry.hash, entry.mtimeMs, entry.size);
  }

  private estimateEmbeddingTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / EMBEDDING_APPROX_CHARS_PER_TOKEN);
  }

  private buildEmbeddingBatches(chunks: MemoryChunk[]): MemoryChunk[][] {
    const batches: MemoryChunk[][] = [];
    let current: MemoryChunk[] = [];
    let currentTokens = 0;

    for (const chunk of chunks) {
      const estimate = this.estimateEmbeddingTokens(chunk.text);
      const wouldExceed =
        current.length > 0 && currentTokens + estimate > EMBEDDING_BATCH_MAX_TOKENS;

      if (wouldExceed) {
        batches.push(current);
        current = [];
        currentTokens = 0;
      }

      if (current.length === 0 && estimate > EMBEDDING_BATCH_MAX_TOKENS) {
        batches.push([chunk]);
        continue;
      }

      current.push(chunk);
      currentTokens += estimate;
    }

    if (current.length > 0) {
      batches.push(current);
    }
    return batches;
  }

  private loadEmbeddingCache(hashes: string[]): Map<string, number[]> {
    if (hashes.length === 0) return new Map();

    const unique = [...new Set(hashes.filter(Boolean))];
    if (unique.length === 0) return new Map();

    const out = new Map<string, number[]>();
    const baseParams = [this.provider.id, this.provider.model, this.providerKey];
    const batchSize = 400;

    for (let start = 0; start < unique.length; start += batchSize) {
      const batch = unique.slice(start, start + batchSize);
      const placeholders = batch.map(() => "?").join(", ");
      const rows = this.db
        .prepare(
          `SELECT hash, embedding FROM ${EMBEDDING_CACHE_TABLE}
           WHERE provider = ? AND model = ? AND provider_key = ? AND hash IN (${placeholders})`,
        )
        .all(...baseParams, ...batch) as Array<{ hash: string; embedding: string }>;

      for (const row of rows) {
        out.set(row.hash, parseEmbedding(row.embedding));
      }
    }
    return out;
  }

  private upsertEmbeddingCache(entries: Array<{ hash: string; embedding: number[] }>): void {
    if (entries.length === 0) return;
    const now = Date.now();
    const stmt = this.db.prepare(
      `INSERT INTO ${EMBEDDING_CACHE_TABLE} (provider, model, provider_key, hash, embedding, dims, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, model, provider_key, hash) DO UPDATE SET
         embedding=excluded.embedding,
         dims=excluded.dims,
         updated_at=excluded.updated_at`,
    );

    for (const entry of entries) {
      const embedding = entry.embedding ?? [];
      stmt.run(
        this.provider.id,
        this.provider.model,
        this.providerKey,
        entry.hash,
        JSON.stringify(embedding),
        embedding.length,
        now,
      );
    }
  }

  private async embedChunksInBatches(chunks: MemoryChunk[]): Promise<number[][]> {
    if (chunks.length === 0) return [];

    const cached = this.loadEmbeddingCache(chunks.map((chunk) => chunk.hash));
    const embeddings: number[][] = Array.from({ length: chunks.length }, () => []);
    const missing: Array<{ index: number; chunk: MemoryChunk }> = [];

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      const hit = chunk?.hash ? cached.get(chunk.hash) : undefined;
      if (hit && hit.length > 0) {
        embeddings[i] = hit;
      } else if (chunk) {
        missing.push({ index: i, chunk });
      }
    }

    if (missing.length === 0) return embeddings;

    const missingChunks = missing.map((m) => m.chunk);
    const batches = this.buildEmbeddingBatches(missingChunks);
    const toCache: Array<{ hash: string; embedding: number[] }> = [];
    let cursor = 0;

    for (const batch of batches) {
      const batchEmbeddings = await this.provider.embedBatch(batch.map((chunk) => chunk.text));
      for (let i = 0; i < batch.length; i += 1) {
        const item = missing[cursor + i];
        const embedding = batchEmbeddings[i] ?? [];
        if (item) {
          embeddings[item.index] = embedding;
          toCache.push({ hash: item.chunk.hash, embedding });
        }
      }
      cursor += batch.length;
    }

    this.upsertEmbeddingCache(toCache);
    return embeddings;
  }

  private searchVector(
    queryVec: number[],
    limit: number,
  ): Array<{ id: string; path: string; startLine: number; endLine: number; score: number; snippet: string }> {
    return searchVector({
      db: this.db,
      providerModel: this.provider.model,
      queryVec,
      limit,
      snippetMaxChars: SNIPPET_MAX_CHARS,
      sourceFilter: this.buildSourceFilter(),
    });
  }

  private searchKeyword(
    query: string,
    limit: number,
  ): Array<{ id: string; path: string; startLine: number; endLine: number; score: number; snippet: string; textScore: number }> {
    if (!this.fts.enabled || !this.fts.available) return [];
    return searchKeyword({
      db: this.db,
      ftsTable: FTS_TABLE,
      providerModel: this.provider.model,
      query,
      limit,
      snippetMaxChars: SNIPPET_MAX_CHARS,
      sourceFilter: this.buildSourceFilter(),
    });
  }
}
