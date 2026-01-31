#!/usr/bin/env bun
/**
 * Memory search CLI
 * Usage: memory-search "your query here"
 */

import { MemoryIndex } from "../dist/index.js";

const query = process.argv.slice(2).join(" ");

if (!query.trim() || query === "--help" || query === "-h") {
  console.log("Usage: memory-search \"your query\"");
  console.log("Example: memory-search \"database decision\"");
  console.log("");
  console.log("Environment:");
  console.log("  CLAUDE_PROJECT_DIR  Project directory (default: cwd)");
  console.log("  OPENAI_API_KEY      Use OpenAI for faster queries");
  process.exit(query.trim() ? 0 : 1);
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

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
