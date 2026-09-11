/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReplayCell } from './replay_plan';

/**
 * Blind judging: hide which model produced a trajectory before a judge grades it.
 *
 * An LLM judge that can see it is grading its own family has a measurable
 * preference for it. The judge reads the agent's own words, and models
 * routinely self-identify mid-answer ("As Claude, ..."), so hiding only the
 * metadata field leaves the identity in the graded text.
 */

/** Vendor and family tokens that identify a model regardless of the id format. */
const IDENTITY_PATTERNS: RegExp[] = [
  /\banthropic\b/gi,
  /\bopenai\b/gi,
  /\bgoogle\b/gi,
  /\bdeepmind\b/gi,
  /\bmeta\b/gi,
  /\bmistral\b/gi,
  /\bz-?ai\b/gi,
  /\bclaude\b/gi,
  /\bsonnet\b/gi,
  /\bhaiku\b/gi,
  /\bopus\b/gi,
  /\bgemini\b/gi,
  /\bgpt(?:-[\w.]+)?\b/gi,
  /\bo[1-9](?:-[\w.]+)?\b/gi,
  /\bllama\b/gi,
  /\bqwen[\w.-]*\b/gi,
  /\bglm[\w.-]*\b/gi,
  /\bgrok\b/gi,
];

const REDACTED = '[model]';

/**
 * Map each model to a stable alias, ordered by model id.
 *
 * Sorting rather than using encounter order keeps the alias for a given model
 * identical across replays; otherwise the same model draws a different alias
 * depending on which cell happened to load first, and a blind pass cannot be
 * reproduced or compared.
 */
export function buildAliasMap(cells: ReplayCell[]): Map<string, string> {
  const ids = [...new Set(cells.map((c) => c.modelId))].sort();
  const aliases = new Map<string, string>();
  ids.forEach((id, index) => {
    aliases.set(id, `Model ${alias(index)}`);
  });
  return aliases;
}

/** A, B, ... Z, AA, AB, ... so the scheme survives more models than the alphabet. */
function alias(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function scrub(text: string, modelId: string): string {
  // The exact id first: it is the longest, most specific token, and removing it
  // before the generic patterns avoids leaving fragments like "-4.6-" behind.
  let out = text.split(modelId).join(REDACTED);
  for (const pattern of IDENTITY_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  // Collapse runs produced by adjacent matches ("claude-4.6-sonnet").
  return out.replace(/(?:\[model\][\s.-]*){2,}/g, `${REDACTED} `).trim();
}

/**
 * Strip model identity from every judge-visible field of a cell.
 *
 * Returns a new cell; the caller's plan is reused for the non-blind pass and
 * must not be mutated.
 */
export function anonymizeCell(cell: ReplayCell, aliases: Map<string, string>): ReplayCell {
  return {
    ...cell,
    modelId: aliases.get(cell.modelId) ?? REDACTED,
    question: scrub(cell.question, cell.modelId),
    expected: scrub(cell.expected, cell.modelId),
    agentResponse: scrub(cell.agentResponse, cell.modelId),
    // The tool-call history reaches the groundedness judge as
    // `tool_call_history`, so it is judge-visible and must be scrubbed too.
    // Steps are arbitrary nested JSON, so scrub the serialized form rather
    // than walking a shape that varies per tool.
    steps: cell.steps.length
      ? JSON.parse(scrub(JSON.stringify(cell.steps), cell.modelId))
      : cell.steps,
  };
}
