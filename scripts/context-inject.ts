#!/usr/bin/env bun
/**
 * Context injection script for Claude Code hooks
 * Reads user message from stdin and injects relevant memory context
 *
 * Usage in .claude/hooks.json:
 * {
 *   "hooks": {
 *     "UserPromptSubmit": [{
 *       "command": "bun ~/projects/memory-search/scripts/context-inject.ts",
 *       "timeout": 10000
 *     }]
 *   }
 * }
 */

import { MemoryIndex } from "../src/index";

interface HookInput {
  user_message?: string;
}

try {
  const input: HookInput = await Bun.stdin.json();
  const query = input.user_message?.slice(0, 200) || "";

  if (!query.trim()) {
    process.exit(0);
  }

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const memory = await MemoryIndex.create({
    workspaceDir: projectDir,
    embeddingProvider: process.env.OPENAI_API_KEY ? "openai" : "auto",
    openaiApiKey: process.env.OPENAI_API_KEY,
  });

  await memory.sync();

  const results = await memory.search(query, {
    maxResults: 3,
    minScore: 0.4,
  });

  await memory.close();

  if (results.length > 0) {
    const context = results
      .map(
        (r) =>
          `**${r.path}** (lines ${r.startLine}-${r.endLine}):\n${r.snippet}`
      )
      .join("\n\n");

    console.log(
      JSON.stringify({
        additionalContext: `## Relevant Memory\n\n${context}`,
      })
    );
  }
} catch (err) {
  // Silently exit on errors to not block the user
  process.exit(0);
}
