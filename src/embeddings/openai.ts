import type { EmbeddingProvider } from "./index.js";

const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export interface OpenAIEmbeddingOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export async function createOpenAIEmbeddingProvider(
  options: OpenAIEmbeddingOptions,
): Promise<EmbeddingProvider> {
  const apiKey = options.apiKey;
  if (!apiKey) {
    throw new Error("OpenAI API key is required");
  }

  const model = options.model?.trim() || DEFAULT_OPENAI_EMBEDDING_MODEL;
  const baseUrl = (options.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, "");
  const url = `${baseUrl}/embeddings`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const embed = async (input: string[]): Promise<number[][]> => {
    if (input.length === 0) return [];

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, input }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI embeddings failed: ${res.status} ${text}`);
    }

    const payload = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const data = payload.data ?? [];
    return data.map((entry) => entry.embedding ?? []);
  };

  return {
    id: "openai",
    model,
    async embedQuery(text: string): Promise<number[]> {
      const [vec] = await embed([text]);
      return vec ?? [];
    },
    embedBatch: embed,
  };
}
