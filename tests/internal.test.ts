import { describe, expect, it } from "bun:test";
import {
  chunkMarkdown,
  cosineSimilarity,
  hashText,
  isMemoryPath,
  normalizeRelPath,
  parseEmbedding,
  truncateUtf16Safe,
} from "../src/internal";

describe("chunkMarkdown", () => {
  it("splits overly long lines into max-sized chunks", () => {
    const chunkTokens = 400;
    const maxChars = chunkTokens * 4;
    const content = "a".repeat(maxChars * 3 + 25);
    const chunks = chunkMarkdown(content, { tokens: chunkTokens, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(maxChars);
    }
  });

  it("handles empty content", () => {
    const chunks = chunkMarkdown("", { tokens: 400, overlap: 80 });
    // Empty string still produces one chunk with empty text
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("");
  });

  it("creates chunks with correct line numbers", () => {
    const content = "line 1\nline 2\nline 3";
    const chunks = chunkMarkdown(content, { tokens: 100, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].startLine).toBe(1);
  });

  it("handles overlap correctly", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join("\n");
    const chunks = chunkMarkdown(lines, { tokens: 10, overlap: 2 });
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe("hashText", () => {
  it("returns consistent SHA256 hash", () => {
    const hash1 = hashText("hello world");
    const hash2 = hashText("hello world");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA256 hex
  });

  it("returns different hash for different input", () => {
    const hash1 = hashText("hello");
    const hash2 = hashText("world");
    expect(hash1).not.toBe(hash2);
  });
});

describe("normalizeRelPath", () => {
  it("removes leading slashes and dots", () => {
    expect(normalizeRelPath("./foo/bar")).toBe("foo/bar");
    expect(normalizeRelPath("../foo/bar")).toBe("foo/bar");
    expect(normalizeRelPath("/foo/bar")).toBe("foo/bar");
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(normalizeRelPath("foo\\bar\\baz")).toBe("foo/bar/baz");
  });
});

describe("isMemoryPath", () => {
  it("returns true for MEMORY.md", () => {
    expect(isMemoryPath("MEMORY.md")).toBe(true);
    expect(isMemoryPath("./MEMORY.md")).toBe(true);
  });

  it("returns true for memory.md", () => {
    expect(isMemoryPath("memory.md")).toBe(true);
  });

  it("returns true for paths under memory/", () => {
    expect(isMemoryPath("memory/foo.md")).toBe(true);
    expect(isMemoryPath("memory/sub/bar.md")).toBe(true);
  });

  it("returns false for other paths", () => {
    expect(isMemoryPath("src/foo.md")).toBe(false);
    expect(isMemoryPath("readme.md")).toBe(false);
  });
});

describe("parseEmbedding", () => {
  it("parses valid JSON array", () => {
    const result = parseEmbedding("[1, 2, 3]");
    expect(result).toEqual([1, 2, 3]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseEmbedding("invalid")).toEqual([]);
    expect(parseEmbedding("")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseEmbedding('{"foo": "bar"}')).toEqual([]);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const vec = [1, 2, 3];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [])).toBe(0);
  });

  it("returns -1 for opposite vectors", () => {
    const a = [1, 0];
    const b = [-1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
  });
});

describe("truncateUtf16Safe", () => {
  it("returns original string if under limit", () => {
    expect(truncateUtf16Safe("hello", 10)).toBe("hello");
  });

  it("truncates to limit", () => {
    expect(truncateUtf16Safe("hello world", 5)).toBe("hello");
  });

  it("handles surrogate pairs", () => {
    const emoji = "👋"; // surrogate pair
    // Don't split in the middle of a surrogate pair
    const result = truncateUtf16Safe(`a${emoji}b`, 2);
    expect(result).toBe("a");
  });
});
