#!/usr/bin/env bun
/**
 * Sync memory index with files on disk
 * Usage: bun sync.ts [--force]
 */

import { MemoryIndex } from "../src/index";

const force = process.argv.includes("--force");
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

try {
  console.log(`Syncing memory index for: ${projectDir}`);

  const memory = await MemoryIndex.create({
    workspaceDir: projectDir,
    embeddingProvider: process.env.OPENAI_API_KEY ? "openai" : "auto",
    openaiApiKey: process.env.OPENAI_API_KEY,
  });

  await memory.sync({ force });

  const status = memory.status();
  console.log(`\nIndex synced:`);
  console.log(`  Files: ${status.files}`);
  console.log(`  Chunks: ${status.chunks}`);
  console.log(`  Provider: ${status.provider}`);
  console.log(`  Model: ${status.model}`);

  if (status.fallback) {
    console.log(`  Fallback: ${status.fallback.from} → ${status.provider}`);
    console.log(`  Reason: ${status.fallback.reason}`);
  }

  await memory.close();
  console.log("\nDone.");
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error syncing memory: ${message}`);
  process.exit(1);
}
