import type { EmbeddingProvider } from "./index.js";

const DEFAULT_LOCAL_MODEL = "hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf";

export interface LocalEmbeddingOptions {
  modelPath?: string;
  cacheDir?: string;
}

type Llama = Awaited<ReturnType<typeof import("node-llama-cpp")["getLlama"]>>;
type LlamaModel = Awaited<ReturnType<Llama["loadModel"]>>;
type LlamaEmbeddingContext = Awaited<ReturnType<LlamaModel["createEmbeddingContext"]>>;

export async function createLocalEmbeddingProvider(
  options: LocalEmbeddingOptions = {},
): Promise<EmbeddingProvider> {
  const modelPath = options.modelPath?.trim() || DEFAULT_LOCAL_MODEL;
  const cacheDir = options.cacheDir?.trim();

  // Lazy-load node-llama-cpp
  let nodeLlamaCpp: typeof import("node-llama-cpp");
  try {
    nodeLlamaCpp = await import("node-llama-cpp");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `node-llama-cpp not available. Install it with: bun add node-llama-cpp\n` +
      `Original error: ${message}`
    );
  }

  const { getLlama, resolveModelFile, LlamaLogLevel } = nodeLlamaCpp;

  let llama: Llama | null = null;
  let embeddingModel: LlamaModel | null = null;
  let embeddingContext: LlamaEmbeddingContext | null = null;

  const ensureContext = async (): Promise<LlamaEmbeddingContext> => {
    if (!llama) {
      llama = await getLlama({ logLevel: LlamaLogLevel.error });
    }
    if (!embeddingModel) {
      const resolved = await resolveModelFile(modelPath, {
        directory: cacheDir || undefined,
        onProgress: ({ downloadedSize, totalSize }) => {
          if (totalSize > 0) {
            const pct = Math.round((downloadedSize / totalSize) * 100);
            process.stderr.write(`\rDownloading embedding model... ${pct}%`);
            if (pct >= 100) process.stderr.write("\n");
          }
        },
      });
      embeddingModel = await llama.loadModel({ modelPath: resolved });
    }
    if (!embeddingContext) {
      embeddingContext = await embeddingModel.createEmbeddingContext();
    }
    return embeddingContext;
  };

  return {
    id: "local",
    model: modelPath,
    async embedQuery(text: string): Promise<number[]> {
      const ctx = await ensureContext();
      const embedding = await ctx.getEmbeddingFor(text);
      return Array.from(embedding.vector) as number[];
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      const ctx = await ensureContext();
      const embeddings = await Promise.all(
        texts.map(async (text) => {
          const embedding = await ctx.getEmbeddingFor(text);
          return Array.from(embedding.vector) as number[];
        }),
      );
      return embeddings;
    },
  };
}
