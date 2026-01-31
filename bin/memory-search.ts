#!/usr/bin/env bun
/**
 * Memory search CLI
 * Usage: memory-search "your query here"
 */

import { MemoryIndex } from "../dist/index.js";

const args = process.argv.slice(2);
const query = args.join(" ");

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

if (args[0] === "--warmup") {
  console.log("Warming up embedding model (first-time download ~300MB)...");
  const memory = await MemoryIndex.create({
    workspaceDir: projectDir,
    embeddingProvider: "local",
  });
  await memory.close();
  console.log("Done! Model is ready for use.");
  process.exit(0);
}

if (args[0] === "--sync" || args[0] === "sync") {
  const force = args.includes("--force");
  console.log(`Syncing memory index for: ${projectDir}`);
  const memory = await MemoryIndex.create({
    workspaceDir: projectDir,
    embeddingProvider: process.env.OPENAI_API_KEY ? "openai" : "auto",
    openaiApiKey: process.env.OPENAI_API_KEY,
  });
  await memory.sync({ force });
  const status = memory.status();
  console.log(`Index synced: ${status.files} files, ${status.chunks} chunks`);
  await memory.close();
  process.exit(0);
}

if (!query.trim() || query === "--help" || query === "-h") {
  console.log("Usage: memory-search \"your query\"");
  console.log("       memory-search --sync      # Sync index with files");
  console.log("       memory-search --warmup    # Pre-download embedding model");
  console.log("Example: memory-search \"database decision\"");
  console.log("");
  console.log("Environment:");
  console.log("  CLAUDE_PROJECT_DIR  Project directory (default: cwd)");
  console.log("  OPENAI_API_KEY      Use OpenAI for faster queries");
  process.exit(query.trim() ? 0 : 1);
}

try {
  const memory = await MemoryIndex.create({
    workspaceDir: projectDir,
    embeddingProvider: process.env.OPENAI_API_KEY ? "openai" : "auto",
    openaiApiKey: process.env.OPENAI_API_KEY,
  });

  await memory.sync();

  const results = await memory.search(query, {
    maxResults: 6,
    minScore: 0.3,
  });

  if (results.length === 0) {
    console.log(`## No results found for: "${query}"`);
    console.log("\nTry a different query or check that MEMORY.md / memory/ files exist.");
    process.exit(0);
  }

  console.log(`## Memory Search: "${query}"\n`);
  console.log(`Found ${results.length} result(s):\n`);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const score = Math.round(r.score * 100);
    console.log(`### ${i + 1}. ${r.path} (lines ${r.startLine}-${r.endLine}) — ${score}% match`);
    console.log("```");
    console.log(r.snippet);
    console.log("```\n");
  }

  await memory.close();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error searching memory: ${message}`);
  process.exit(1);
}
