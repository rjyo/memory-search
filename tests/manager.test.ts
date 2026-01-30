import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { MemoryIndex } from "../src/manager";
import { createMockEmbeddingProvider } from "./embeddings.test";

// Patch the embedding provider creation for tests
const originalCreate = MemoryIndex.create.bind(MemoryIndex);

async function createTestMemoryIndex(config: { workspaceDir: string; dbPath?: string }) {
  // Create instance directly with mock provider
  const instance = new (MemoryIndex as any)(config);

  // Override the init to use mock provider
  const mockProvider = createMockEmbeddingProvider();
  (instance as any).provider = mockProvider;
  (instance as any).providerKey = "mock-key";
  (instance as any).ensureSchema();

  return instance as MemoryIndex;
}

describe("MemoryIndex with mock embeddings", () => {
  let testDir: string;
  let memory: MemoryIndex;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "memory-test-"));
    await writeFile(
      join(testDir, "MEMORY.md"),
      `# Authentication

Use JWT tokens for user authentication.
Tokens expire after 24 hours.
Store refresh tokens securely.

# Database

PostgreSQL is the primary database.
Redis is used for caching session data.
Use connection pooling for efficiency.

# API Design

REST endpoints follow standard conventions.
Use proper HTTP status codes.
Always validate input data.
`,
    );

    await mkdir(join(testDir, "memory"));
    await writeFile(
      join(testDir, "memory", "deployment.md"),
      `# Deployment

Use Docker containers for deployment.
Kubernetes manages orchestration.
CI/CD pipeline runs on every push.
`,
    );

    memory = await createTestMemoryIndex({
      workspaceDir: testDir,
      dbPath: join(testDir, ".memory.sqlite"),
    });
    await memory.sync();
  }, 60_000);

  afterAll(async () => {
    await memory?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("indexes memory files", async () => {
    const status = memory.status();
    expect(status.files).toBe(2); // MEMORY.md and memory/deployment.md
    expect(status.chunks).toBeGreaterThan(0);
  });

  it("searches for content", async () => {
    const results = await memory.search("authentication", { minScore: 0 });
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns results with expected shape", async () => {
    const results = await memory.search("database", { minScore: 0 });
    expect(results.length).toBeGreaterThan(0);

    const result = results[0];
    expect(result).toHaveProperty("path");
    expect(result).toHaveProperty("startLine");
    expect(result).toHaveProperty("endLine");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("snippet");
  });

  it("reads memory files", async () => {
    const file = await memory.readFile({ path: "MEMORY.md" });
    expect(file.path).toBe("MEMORY.md");
    expect(file.text).toContain("Authentication");
  });

  it("reads memory files with line range", async () => {
    const file = await memory.readFile({ path: "MEMORY.md", from: 1, lines: 2 });
    const lines = file.text.split("\n");
    expect(lines.length).toBe(2);
  });

  it("reads files from memory/ directory", async () => {
    const file = await memory.readFile({ path: "memory/deployment.md" });
    expect(file.text).toContain("Docker");
  });

  it("rejects invalid paths", async () => {
    await expect(memory.readFile({ path: "src/index.ts" })).rejects.toThrow();
    await expect(memory.readFile({ path: "../../../etc/passwd" })).rejects.toThrow();
  });

  it("returns empty array for empty query", async () => {
    const results = await memory.search("");
    expect(results).toEqual([]);
  });

  it("respects maxResults option", async () => {
    const results = await memory.search("the", { maxResults: 2, minScore: 0 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("respects minScore option", async () => {
    const results = await memory.search("authentication", { minScore: 0.99 });
    for (const result of results) {
      expect(result.score).toBeGreaterThanOrEqual(0.99);
    }
  });

  it("status returns correct information", () => {
    const status = memory.status();
    expect(status.workspaceDir).toBe(testDir);
    expect(status.provider).toBe("mock");
    expect(status.model).toBe("mock-model");
    expect(status.fts.enabled).toBe(true);
  });
});

describe("MemoryIndex sync behavior", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "memory-sync-test-"));
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("handles missing MEMORY.md gracefully", async () => {
    const memory = await createTestMemoryIndex({
      workspaceDir: testDir,
      dbPath: join(testDir, ".memory-empty.sqlite"),
    });
    await memory.sync();
    const status = memory.status();
    expect(status.files).toBe(0);
    await memory.close();
  });

  it("re-syncs when files change", async () => {
    const subDir = join(testDir, "resync-test");
    await mkdir(subDir, { recursive: true });

    await writeFile(join(subDir, "MEMORY.md"), "# Initial\n\nFirst content.");

    const memory = await createTestMemoryIndex({
      workspaceDir: subDir,
      dbPath: join(subDir, ".memory.sqlite"),
    });
    await memory.sync();

    let status = memory.status();
    expect(status.files).toBe(1);

    // Modify file
    await writeFile(join(subDir, "MEMORY.md"), "# Updated\n\nNew content added.");
    await memory.sync();

    status = memory.status();
    expect(status.files).toBe(1);

    await memory.close();
  });

  it("removes stale files from index", async () => {
    const subDir = join(testDir, "stale-test");
    await mkdir(subDir, { recursive: true });
    await mkdir(join(subDir, "memory"), { recursive: true });

    await writeFile(join(subDir, "MEMORY.md"), "# Main");
    await writeFile(join(subDir, "memory", "extra.md"), "# Extra");

    const memory = await createTestMemoryIndex({
      workspaceDir: subDir,
      dbPath: join(subDir, ".memory.sqlite"),
    });
    await memory.sync();

    let status = memory.status();
    expect(status.files).toBe(2);

    // Remove extra file
    await rm(join(subDir, "memory", "extra.md"));
    await memory.sync();

    status = memory.status();
    expect(status.files).toBe(1);

    await memory.close();
  });
});

describe("MemoryIndex force re-index", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "memory-force-test-"));
    await writeFile(join(testDir, "MEMORY.md"), "# Test\n\nContent here.");
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("force option triggers full reindex", async () => {
    const memory = await createTestMemoryIndex({
      workspaceDir: testDir,
      dbPath: join(testDir, ".memory.sqlite"),
    });

    await memory.sync();
    const initialStatus = memory.status();

    await memory.sync({ force: true });
    const afterForceStatus = memory.status();

    expect(afterForceStatus.files).toBe(initialStatus.files);
    expect(afterForceStatus.chunks).toBe(initialStatus.chunks);

    await memory.close();
  });
});
