import type { ResolvedConfig } from "../config.js";
import { log } from "../utils.js";

export interface EmbeddingProvider {
  id: string;
  model: string;
  embedQuery(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingProviderResult {
  provider: EmbeddingProvider;
  requestedProvider: "local" | "openai" | "auto";
  fallbackFrom?: "local" | "openai";
  fallbackReason?: string;
}

export async function createEmbeddingProvider(
  config: ResolvedConfig,
): Promise<EmbeddingProviderResult> {
  const requested = config.embeddingProvider;

  if (requested === "local") {
    const provider = await createLocalProvider(config);
    return { provider, requestedProvider: requested };
  }

  if (requested === "openai") {
    const provider = await createOpenAIProvider(config);
    return { provider, requestedProvider: requested };
  }

  // Auto mode: try local first, then OpenAI
  try {
    const provider = await createLocalProvider(config);
    return { provider, requestedProvider: "auto" };
  } catch (localErr) {
    const reason = localErr instanceof Error ? localErr.message : String(localErr);
    log.warn(`Local embeddings unavailable: ${reason}`);

    if (config.openaiApiKey) {
      try {
        const provider = await createOpenAIProvider(config);
        return {
          provider,
          requestedProvider: "auto",
          fallbackFrom: "local",
          fallbackReason: reason,
        };
      } catch (openaiErr) {
        const openaiReason = openaiErr instanceof Error ? openaiErr.message : String(openaiErr);
        throw new Error(`Local embeddings failed: ${reason}\nOpenAI fallback failed: ${openaiReason}`);
      }
    }

    throw new Error(
      `Local embeddings unavailable: ${reason}\n` +
      `To use local embeddings, ensure node-llama-cpp is installed.\n` +
      `Alternatively, provide an OpenAI API key for remote embeddings.`
    );
  }
}

async function createLocalProvider(config: ResolvedConfig): Promise<EmbeddingProvider> {
  const { createLocalEmbeddingProvider } = await import("./local.js");
  return createLocalEmbeddingProvider({
    modelPath: config.localModelPath,
    cacheDir: config.modelCacheDir,
  });
}

async function createOpenAIProvider(config: ResolvedConfig): Promise<EmbeddingProvider> {
  const { createOpenAIEmbeddingProvider } = await import("./openai.js");
  if (!config.openaiApiKey) {
    throw new Error("OpenAI API key required for openai embedding provider");
  }
  return createOpenAIEmbeddingProvider({
    apiKey: config.openaiApiKey,
    model: config.openaiModel,
  });
}
