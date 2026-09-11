/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { RE2JS } from 're2js';
import type { PiiRegexRule, PiiRegexMatch, PiiRegexWorkerTaskPayload } from './types';

type CompiledRule =
  | { engine: 're2'; pattern: ReturnType<typeof RE2JS.compile> }
  | { engine: 'native'; pattern: RegExp };

export function compileRule(rawPattern: string, re2Only = false): CompiledRule {
  try {
    return { engine: 're2', pattern: RE2JS.compile(rawPattern) };
  } catch (err) {
    if (re2Only) {
      throw err instanceof Error ? err : new Error(String(err));
    }
    // RE2 does not support lookahead, lookbehind, or backreferences. Fall back to
    // native RegExp. ReDoS protection is provided by the Piscina worker timeout and
    // per-task abort via AbortSignal.
    return { engine: 'native', pattern: new RegExp(rawPattern, 'g') };
  }
}

function findSpans(
  compiled: CompiledRule,
  value: string
): Array<{ start: number; end: number; matchValue: string }> {
  const spans: Array<{ start: number; end: number; matchValue: string }> = [];

  if (compiled.engine === 're2') {
    const matcher = compiled.pattern.matcher(value);
    let pos: number | null = null;

    while (true) {
      const found = pos === null ? matcher.find() : matcher.find(pos);
      pos = null;
      if (!found) break;

      const start = matcher.start();
      const end = matcher.end();

      if (end <= start) {
        const next = start + 1;
        if (next > value.length) break;
        pos = next;
        continue;
      }

      const matchValue = matcher.group();
      if (matchValue !== null) {
        spans.push({ start, end, matchValue });
      }
    }
  } else {
    compiled.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = compiled.pattern.exec(value)) !== null) {
      const start = match.index;
      const matchValue = match[0];
      const end = start + matchValue.length;

      if (end <= start) {
        // Zero-length match: advance one character to avoid an infinite loop
        compiled.pattern.lastIndex = start + 1;
        continue;
      }

      spans.push({ start, end, matchValue });
    }
  }

  return spans;
}

/**
 * Executes a set of regex rules against a batch of text records.
 *
 * RE2JS is tried first for each pattern. Patterns that contain constructs RE2 does
 * not support (lookahead, lookbehind, backreferences) fall back to native RegExp.
 * The Piscina worker timeout and per-task AbortSignal provide ReDoS protection for
 * native RegExp patterns.
 *
 * When `re2Only` is true, native RegExp fallback is disabled and any non-RE2 pattern
 * throws immediately. Use this on the synchronous (non-worker) path where there is no
 * timeout to contain catastrophic backtracking.
 *
 * Zero-length matches advance one character and continue scanning; they do not
 * terminate the search for that field.
 *
 * Throws only when a pattern is invalid in both RE2 and native RegExp syntax (or in
 * RE2 alone when `re2Only` is true).
 */
export const executeRegexRules = (
  { rules, records }: PiiRegexWorkerTaskPayload,
  { re2Only = false }: { re2Only?: boolean } = {}
): PiiRegexMatch[] => {
  const compiled = rules.map((rule) => compileRule(rule.pattern, re2Only));
  const results: PiiRegexMatch[] = [];

  for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
    const rule = rules[ruleIndex] as PiiRegexRule;

    for (let recordIndex = 0; recordIndex < records.length; recordIndex++) {
      const record = records[recordIndex];
      for (const [recordKey, value] of Object.entries(record)) {
        if (value.length === 0) {
          continue;
        }

        for (const { start, end, matchValue } of findSpans(compiled[ruleIndex], value)) {
          if (rule.maxMatchLength !== undefined && matchValue.length > rule.maxMatchLength) {
            continue;
          }
          results.push({
            ruleIndex,
            recordIndex,
            recordKey,
            start,
            end,
            matchValue,
            entityClass: rule.entityClass,
          });
        }
      }
    }
  }

  return results;
};
