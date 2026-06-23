/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Parser } from '@elastic/esql';

export type SplitConfidence = 'high' | 'low' | 'none';

export interface SplitResult {
  base: string;
  alertBlock: string;
  confidence: SplitConfidence;
  /**
   * Machine-readable reason for the confidence level, useful for downstream
   * branching without string-matching the human-readable messages.
   *
   * - 'no_stats'           — no STATS and no WHERE; entire query is base
   * - 'no_where'           — STATS found but no WHERE after it; alert block is absent
   * - 'split_succeeded'    — both STATS and a post-STATS WHERE were found
   * - 'where_without_stats' — no STATS but a WHERE exists; split at the last WHERE
   */
  reason: 'no_stats' | 'no_where' | 'split_succeeded' | 'where_without_stats';
}

/**
 * Splits an ES|QL query into a base portion and an alert-condition block
 * using the ANTLR-based AST parser from `@elastic/esql`.
 *
 * Heuristic (three rules, evaluated in order):
 *
 * 1. If there is at least one WHERE after a STATS, split directly before
 *    the first WHERE after the last STATS.
 * 2. If there is at least one WHERE but no STATS, split directly after
 *    the last non-WHERE command that precedes the last WHERE. Consecutive
 *    trailing WHEREs all become part of the alert block.
 * 3. Otherwise (no WHERE, or only WHEREs before a STATS), we cannot
 *    determine the split — the entire query is the base, alert block is
 *    empty.
 *
 * Parsing uses the real AST, so pipes inside string literals, comments,
 * or other lexical contexts are handled correctly.
 */
export function splitQuery(query: string): SplitResult {
  if (!query.trim()) {
    return { base: '', alertBlock: '', confidence: 'none', reason: 'no_stats' };
  }

  const { root } = Parser.parse(query);
  const { commands } = root;

  if (commands.length === 0) {
    return { base: '', alertBlock: query.trim(), confidence: 'none', reason: 'no_stats' };
  }

  let lastStatsIdx = -1;
  for (let j = commands.length - 1; j >= 0; j--) {
    if (commands[j].name === 'stats') {
      lastStatsIdx = j;
      break;
    }
  }

  if (lastStatsIdx === -1) {
    // No STATS — find the last non-WHERE command that precedes the last WHERE.
    // All commands from that point onward (a trailing chain of WHEREs, possibly
    // interspersed with SORT/LIMIT/EVAL tail commands) become the alert block.
    let lastWhereIdx = -1;
    for (let j = commands.length - 1; j >= 0; j--) {
      if (commands[j].name === 'where') {
        lastWhereIdx = j;
        break;
      }
    }

    if (lastWhereIdx === -1) {
      return { base: query.trim(), alertBlock: '', confidence: 'none', reason: 'no_stats' };
    }

    // Walk backwards from the last WHERE to find the last non-WHERE before it.
    let splitAfterIdx = -1;
    for (let j = lastWhereIdx - 1; j >= 0; j--) {
      if (commands[j].name !== 'where') {
        splitAfterIdx = j;
        break;
      }
    }

    // If every command up to the last WHERE is also a WHERE, there's no base.
    if (splitAfterIdx === -1) {
      return { base: '', alertBlock: query.trim(), confidence: 'none', reason: 'no_stats' };
    }

    // Split directly after the last non-WHERE command preceding the trailing WHERE chain.
    const firstAlertCmd = commands[splitAfterIdx + 1];
    const splitPos = query.lastIndexOf('|', firstAlertCmd.location.min);
    const cutAt = splitPos >= 0 ? splitPos : firstAlertCmd.location.min;

    return {
      base: query.slice(0, cutAt).trim(),
      alertBlock: query.slice(cutAt).trim(),
      confidence: 'low',
      reason: 'where_without_stats',
    };
  }

  let firstWhereAfterStats = -1;
  for (let j = lastStatsIdx + 1; j < commands.length; j++) {
    if (commands[j].name === 'where') {
      firstWhereAfterStats = j;
      break;
    }
  }

  if (firstWhereAfterStats === -1) {
    return { base: query.trim(), alertBlock: '', confidence: 'low', reason: 'no_where' };
  }

  const whereCmd = commands[firstWhereAfterStats];
  const splitPos = query.lastIndexOf('|', whereCmd.location.min);
  const cutAt = splitPos >= 0 ? splitPos : whereCmd.location.min;

  const base = query.slice(0, cutAt).trim();
  const alertBlock = query.slice(cutAt).trim();

  return { base, alertBlock, confidence: 'high', reason: 'split_succeeded' };
}

/** Splits a full ES|QL query (e.g. from Discover) into composed base + breach segment. */
export function discoverQueryToComposed(inlinedQuery: string): {
  format: 'composed';
  base: string;
  breach: { segment: string };
} {
  const { base, alertBlock } = splitQuery(inlinedQuery);
  return { format: 'composed', base, breach: { segment: alertBlock } };
}

/**
 * Produces a candidate recovery block from an alert block by performing a
 * naive per-operator flip of comparison operators (`>` ↔ `<`, `>=` ↔ `<=`).
 * Uses a single-pass regex substitution to avoid the double-replacement bug
 * that arises from sequential `.replace()` calls on overlapping patterns
 * (e.g. `>=` being matched by both `>=` and `>`).
 *
 * **Important:** This is NOT a logical negation (De Morgan's law). For
 * compound expressions like `a > 1 AND b < 2`, the true negation would be
 * `a <= 1 OR b >= 2` — but this function produces `a < 1 AND b > 2`
 * (flips each operator independently, preserves AND/OR connectives). For
 * single-condition alert blocks this is usually what users want operationally,
 * and it works well as a starting seed for the Recovery query editor.
 */
export function guessRecoveryBlock(alertBlock: string): string {
  const FLIP: Record<string, string> = { '>=': '<=', '<=': '>=', '>': '<', '<': '>' };
  return alertBlock.replace(/>=|<=|>|</g, (op) => FLIP[op] ?? op);
}
