import { Database } from "bun:sqlite";
import { cosineSimilarity, parseEmbedding, truncateUtf16Safe } from "./internal.js";
import { bm25RankToScore, buildFtsQuery } from "./hybrid.js";

export type SearchSource = string;

export type SearchRowResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: SearchSource;
};

/**
 * Pure JS vector search using cosine similarity.
 * Loads all chunks matching the model and computes similarity in memory.
 */
export function searchVector(params: {
  db: Database;
  providerModel: string;
  queryVec: number[];
  limit: number;
  snippetMaxChars: number;
  sourceFilter: { sql: string; params: SearchSource[] };
}): SearchRowResult[] {
  if (params.queryVec.length === 0 || params.limit <= 0) return [];

  const candidates = listChunks({
    db: params.db,
    providerModel: params.providerModel,
    sourceFilter: params.sourceFilter,
  });

  const scored = candidates
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(params.queryVec, chunk.embedding),
    }))
    .filter((entry) => Number.isFinite(entry.score));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit)
    .map((entry) => ({
      id: entry.chunk.id,
      path: entry.chunk.path,
      startLine: entry.chunk.startLine,
      endLine: entry.chunk.endLine,
      score: entry.score,
      snippet: truncateUtf16Safe(entry.chunk.text, params.snippetMaxChars),
      source: entry.chunk.source,
    }));
}

function listChunks(params: {
  db: Database;
  providerModel: string;
  sourceFilter: { sql: string; params: SearchSource[] };
}): Array<{
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  embedding: number[];
  source: SearchSource;
}> {
  const rows = params.db
    .prepare(
      `SELECT id, path, start_line, end_line, text, embedding, source
        FROM chunks
       WHERE model = ?${params.sourceFilter.sql}`,
    )
    .all(params.providerModel, ...params.sourceFilter.params) as Array<{
    id: string;
    path: string;
    start_line: number;
    end_line: number;
    text: string;
    embedding: string;
    source: SearchSource;
  }>;

  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    startLine: row.start_line,
    endLine: row.end_line,
    text: row.text,
    embedding: parseEmbedding(row.embedding),
    source: row.source,
  }));
}

/**
 * FTS5-based keyword search using BM25 ranking.
 */
export function searchKeyword(params: {
  db: Database;
  ftsTable: string;
  providerModel: string;
  query: string;
  limit: number;
  snippetMaxChars: number;
  sourceFilter: { sql: string; params: SearchSource[] };
}): Array<SearchRowResult & { textScore: number }> {
  if (params.limit <= 0) return [];

  const ftsQuery = buildFtsQuery(params.query);
  if (!ftsQuery) return [];

  const rows = params.db
    .prepare(
      `SELECT id, path, source, start_line, end_line, text,
              bm25(${params.ftsTable}) AS rank
         FROM ${params.ftsTable}
        WHERE ${params.ftsTable} MATCH ? AND model = ?${params.sourceFilter.sql}
        ORDER BY rank ASC
        LIMIT ?`,
    )
    .all(ftsQuery, params.providerModel, ...params.sourceFilter.params, params.limit) as Array<{
    id: string;
    path: string;
    source: SearchSource;
    start_line: number;
    end_line: number;
    text: string;
    rank: number;
  }>;

  return rows.map((row) => {
    const textScore = bm25RankToScore(row.rank);
    return {
      id: row.id,
      path: row.path,
      startLine: row.start_line,
      endLine: row.end_line,
      score: textScore,
      textScore,
      snippet: truncateUtf16Safe(row.text, params.snippetMaxChars),
      source: row.source,
    };
  });
}
