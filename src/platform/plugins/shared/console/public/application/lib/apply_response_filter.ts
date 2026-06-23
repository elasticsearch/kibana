/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { executeScript } from '@elastic/micro-jq';
import type { OutputFilterState } from '../contexts/output_filter_context';

interface ApplyResponseFilterArgs {
  text: string;
  contentType: string;
  state: OutputFilterState;
}

/**
 * Applies a regex or jq filter to a single response text string.
 * Returns the original text if the expression is empty, invalid, or inapplicable.
 */
export function isFilterableStatusCode(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

export function applyResponseFilter({ text, contentType, state }: ApplyResponseFilterArgs): string {
  if (!state.expression) return text;

  if (state.mode === 'jq') {
    if (!contentType.includes('json')) return text;
    try {
      const parsed = JSON.parse(text);
      const result = executeScript(parsed, state.expression);
      return JSON.stringify(result, null, 2) ?? text;
    } catch {
      return text;
    }
  }

  // regex mode
  try {
    const regex = new RegExp(state.expression);
    const predicate = state.invertMatch
      ? (line: string) => !regex.test(line)
      : (line: string) => regex.test(line);
    return text.split('\n').filter(predicate).join('\n');
  } catch {
    return text;
  }
}
