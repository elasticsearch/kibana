/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isObject } from 'lodash';
import type { z } from '@kbn/zod';

/**
 * Mirrors `@kbn/securitysolution-io-ts-utils` `formatErrors` for zod issues so
 * API `details` strings stay stable across the io-ts → zod cutover.
 *
 * Prefer a codec's own message when present (custom refine / `error:` option);
 * otherwise render `Invalid value "…" supplied to "…"`. Zod v4 issues do not
 * carry the failing value, so callers pass the original `input` to recover it.
 * Empty paths use `rootName` (e.g. decoding `MonitorTypeCodec` alone → `"type"`).
 * Messages are sorted so multi-error `details` strings stay stable (zod issue
 * order follows object key order; io-ts/`formatErrors` ordered differently).
 */
export function formatZodErrors(
  error: z.ZodError,
  { rootName = '', input }: { rootName?: string; input?: unknown } = {}
): string[] {
  const messages = error.issues.map((issue) => {
    if (issue.message != null && !isGenericZodMessage(issue.message)) {
      return issue.message;
    }

    // Match formatErrors: drop integer (array-index) path segments.
    const keyContext = issue.path
      .filter((entry) => typeof entry === 'string' && entry.trim() !== '')
      .join(',');

    const suppliedValue = keyContext !== '' ? keyContext : rootName;
    const raw = getAtPath(input, issue.path);
    const value = isObject(raw) ? JSON.stringify(raw) : raw;
    return `Invalid value "${value}" supplied to "${suppliedValue}"`;
  });

  return [...new Set(messages)].sort();
}

/** Zod's built-in copy — keep those out of API details; prefer the Invalid value form. */
function isGenericZodMessage(message: string): boolean {
  return (
    message === 'Invalid input' ||
    message.startsWith('Invalid input:') ||
    message === 'Required' ||
    message.startsWith('Invalid option:') ||
    message.startsWith('Invalid enum value.') ||
    message.startsWith('Expected ') ||
    message.startsWith('Invalid type:')
  );
}

function getAtPath(input: unknown, path: PropertyKey[]): unknown {
  let cur: unknown = input;
  for (const key of path) {
    if (cur == null || (typeof cur !== 'object' && typeof cur !== 'string')) {
      return cur;
    }
    cur = (cur as Record<PropertyKey, unknown>)[key];
  }
  return cur;
}
