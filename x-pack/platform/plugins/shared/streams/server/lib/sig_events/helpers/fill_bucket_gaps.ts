/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const MAX_FILL_BUCKETS = 10_000;

// Short-form unit character → ES|QL long-form name (for `BUCKET(@timestamp, N <unit>)`).
// Millisecond conversions live in `MS_PER_UNIT` (`@kbn/streams-schema`).
export const ESQL_UNITS: Record<string, string> = {
  s: 'seconds',
  m: 'minutes',
  h: 'hours',
  d: 'days',
};

// Parses bucket-size strings like `"1m"`, `"5s"`, `"2h"`, `"3d"`.
// Canonical bucket-size grammar shared by `parseBucketSize` and the route
// schemas. Update both sides together — the parser falls back to 60s for
// non-matching input as a defensive secondary, but the route schemas are the
// primary gate that surfaces malformed values as a 400 to the caller.
export const BUCKET_SIZE_PATTERN = /^(\d+)([smhd])$/;

export function parseBucketSize(raw: string): { value: number; unit: string } {
  const match = raw.match(BUCKET_SIZE_PATTERN);
  // Routes enforce `BUCKET_SIZE_PATTERN` via zod, so callers reached through
  // the API never hit the fallback. It stays as belt-and-braces for internal
  // direct callers — and to guard `0m` / `0s`, which the regex permits but
  // would zero out the bucket interval.
  if (!match) return { value: 60, unit: 's' };
  const value = parseInt(match[1], 10);
  if (value < 1) return { value: 60, unit: 's' };
  return { value, unit: match[2] };
}
