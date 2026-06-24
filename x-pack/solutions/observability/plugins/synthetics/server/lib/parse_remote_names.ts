/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Each name becomes a `wildcard` clause that counts against ES's
// `indices.query.bool.max_clause_count` (default 1024). 50 is well clear.
export const MAX_REMOTE_NAMES = 50;

export type ParseRemoteNamesResult =
  | { ok: true; value: string[] | undefined }
  | { ok: false; reason: 'too_many'; received: number; max: number };

/**
 * Parses the comma-separated `remoteNames` query param: trims, drops empties,
 * dedupes, and caps at `maxCount`. Returns `undefined` (under `ok: true`)
 * when nothing is provided so callers can skip CCS scoping entirely.
 */
export const parseRemoteNames = (
  raw: string | undefined,
  { maxCount = MAX_REMOTE_NAMES }: { maxCount?: number } = {}
): ParseRemoteNamesResult => {
  if (!raw) return { ok: true, value: undefined };

  const tokens = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (tokens.length === 0) return { ok: true, value: undefined };

  const deduped = Array.from(new Set(tokens));

  if (deduped.length > maxCount) {
    return { ok: false, reason: 'too_many', received: deduped.length, max: maxCount };
  }

  return { ok: true, value: deduped };
};
