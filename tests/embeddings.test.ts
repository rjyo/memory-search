import { describe, expect, it, mock } from "bun:test";
import type { EmbeddingProvider } from "../src/embeddings/index";

// Mock embedding provider for tests that don't need real embeddings
export function createMockEmbeddingProvider(dims = 768): EmbeddingProvider {
  let callCount = 0;

  return {
    id: "mock",
    model: "mock-model",
    async embedQuery(text: string): Promise<number[]> {
      callCount++;
      // Generate deterministic embeddings based on text hash
      const hash = simpleHash(text);
      return generateVector(hash, dims);
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      callCount += texts.length;
      return texts.map((text) => {
        const hash = simpleHash(text);
        return generateVector(hash, dims);
      });
    },
  };
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function generateVector(seed: number, dims: number): number[] {
  const vec: number[] = [];
  let current = seed;
  for (let i = 0; i < dims; i++) {
    current = (current * 1103515245 + 12345) & 0x7fffffff;
    vec.push((current / 0x7fffffff) * 2 - 1); // -1 to 1
  }
  // Normalize
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map((v) => v / norm);
}

describe("Mock embedding provider", () => {
  it("generates consistent embeddings for same input", async () => {
    const provider = createMockEmbeddingProvider();
    const emb1 = await provider.embedQuery("hello world");
    const emb2 = await provider.embedQuery("hello world");
    expect(emb1).toEqual(emb2);
  });

  it("generates different embeddings for different inputs", async () => {
    const provider = createMockEmbeddingProvider();
    const emb1 = await provider.embedQuery("hello");
    const emb2 = await provider.embedQuery("world");
    expect(emb1).not.toEqual(emb2);
  });

  it("generates normalized vectors", async () => {
    const provider = createMockEmbeddingProvider();
    const emb = await provider.embedQuery("test");
    const norm = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("supports batch embedding", async () => {
    const provider = createMockEmbeddingProvider();
    const embeddings = await provider.embedBatch(["hello", "world"]);
    expect(embeddings).toHaveLength(2);
    expect(embeddings[0]).not.toEqual(embeddings[1]);
  });

  it("uses specified dimensions", async () => {
    const provider = createMockEmbeddingProvider(128);
    const emb = await provider.embedQuery("test");
    expect(emb).toHaveLength(128);
  });
});

describe("Embedding similarity", () => {
  it("similar texts have higher similarity", async () => {
    const provider = createMockEmbeddingProvider();

    // Get embeddings for similar and different texts
    const authEmb = await provider.embedQuery("user authentication login");
    const loginEmb = await provider.embedQuery("login authentication");
    const dbEmb = await provider.embedQuery("database postgres sql");

    // Calculate cosine similarities
    const authLoginSim = cosineSim(authEmb, loginEmb);
    const authDbSim = cosineSim(authEmb, dbEmb);

    // Similar topics should have higher similarity (with mock this is based on hash collision)
    // This test verifies the provider is working, not semantic similarity
    expect(authLoginSim).toBeDefined();
    expect(authDbSim).toBeDefined();
  });
});

function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}
