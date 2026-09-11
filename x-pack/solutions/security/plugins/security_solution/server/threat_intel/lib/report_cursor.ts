/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** A cursor that cannot be decoded, is the wrong version, or was minted for a different sort. */
export class InvalidCursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCursorError';
  }
}

export interface ReportCursorPayload {
  version: 2;
  /**
   * Point-in-time id the first page was opened against. Every later page reads
   * the same frozen view, which is what makes `search_after` stable while
   * enrichment and evidence writes touch the reports concurrently, and is what
   * lets the sort use the `_shard_doc` tie-breaker.
   */
  pitId: string;
  /**
   * The sort mode the cursor was minted under. Replaying a cursor under a
   * different sort would apply this primary value to a different field and
   * silently return the wrong page, so the reader rejects a mismatch.
   */
  sort: string;
  /** Primary sort value and `_shard_doc` tiebreak from the last returned hit. */
  sortValues: [number | string | null, number];
}

/** Encodes a cursor payload as an opaque base64url string. */
export const encodeCursor = (payload: ReportCursorPayload): string =>
  Buffer.from(JSON.stringify(payload)).toString('base64url');

/** Decodes an opaque cursor string. Throws `InvalidCursorError` if malformed or unsupported. */
export const decodeCursor = (encoded: string): ReportCursorPayload => {
  let parsed: Partial<ReportCursorPayload>;
  try {
    parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf-8')
    ) as Partial<ReportCursorPayload>;
  } catch {
    throw new InvalidCursorError('Invalid cursor: failed to decode');
  }

  const { version, pitId, sort, sortValues } = parsed;
  if (
    version !== 2 ||
    typeof pitId !== 'string' ||
    pitId.length === 0 ||
    typeof sort !== 'string' ||
    !Array.isArray(sortValues) ||
    sortValues.length !== 2 ||
    typeof sortValues[1] !== 'number'
  ) {
    throw new InvalidCursorError('Invalid or unsupported cursor');
  }

  const primary = sortValues[0];
  if (primary !== null && typeof primary !== 'number' && typeof primary !== 'string') {
    throw new InvalidCursorError('Invalid or unsupported cursor');
  }

  return { version: 2, pitId, sort, sortValues: [primary, sortValues[1]] };
};
