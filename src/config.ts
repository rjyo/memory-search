export interface MemoryConfig {
  /** Required: directory containing MEMORY.md and/or memory/ folder */
  workspaceDir: string;

  /** Path to SQLite database. Default: {workspaceDir}/.memory.sqlite */
  dbPath?: string;

  /** Embedding provider selection. Default: 'auto' (tries local first, then openai) */
  embeddingProvider?: "local" | "openai" | "auto";

  /** OpenAI API key. Required if embeddingProvider is 'openai' */
  openaiApiKey?: string;

  /** OpenAI embedding model. Default: 'text-embedding-3-small' */
  openaiModel?: string;

  /** Local model path for node-llama-cpp. Default: hf:ggml-org/embeddinggemma-300M-GGUF/... */
  localModelPath?: string;

  /** Directory for caching downloaded models. Default: ~/.cache/memory-search */
  modelCacheDir?: string;

  /** Tokens per chunk. Default: 400 */
  chunkTokens?: number;

  /** Overlap tokens between chunks. Default: 80 */
  chunkOverlap?: number;

  /** Maximum search results. Default: 6 */
  maxResults?: number;

  /** Minimum score threshold. Default: 0.35 */
  minScore?: number;

  /** Weight for vector similarity in hybrid search. Default: 0.7 */
  vectorWeight?: number;

  /** Weight for keyword/BM25 in hybrid search. Default: 0.3 */
  textWeight?: number;
}

export interface ResolvedConfig {
  workspaceDir: string;
  dbPath: string;
  embeddingProvider: "local" | "openai" | "auto";
  openaiApiKey?: string;
  openaiModel: string;
  localModelPath: string;
  modelCacheDir: string;
  chunkTokens: number;
  chunkOverlap: number;
  maxResults: number;
  minScore: number;
  vectorWeight: number;
  textWeight: number;
}

const DEFAULT_LOCAL_MODEL = "hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf";
const DEFAULT_OPENAI_MODEL = "text-embedding-3-small";

export function resolveConfig(config: MemoryConfig): ResolvedConfig {
  const workspaceDir = config.workspaceDir;
  const homeDir = process.env.HOME || process.env.USERPROFILE || "~";

  return {
    workspaceDir,
    dbPath: config.dbPath || `${workspaceDir}/.memory.sqlite`,
    embeddingProvider: config.embeddingProvider || "auto",
    openaiApiKey: config.openaiApiKey,
    openaiModel: config.openaiModel || DEFAULT_OPENAI_MODEL,
    localModelPath: config.localModelPath || DEFAULT_LOCAL_MODEL,
    modelCacheDir: config.modelCacheDir || `${homeDir}/.cache/memory-search`,
    chunkTokens: config.chunkTokens ?? 400,
    chunkOverlap: config.chunkOverlap ?? 80,
    maxResults: config.maxResults ?? 6,
    minScore: config.minScore ?? 0.35,
    vectorWeight: config.vectorWeight ?? 0.7,
    textWeight: config.textWeight ?? 0.3,
  };
}
