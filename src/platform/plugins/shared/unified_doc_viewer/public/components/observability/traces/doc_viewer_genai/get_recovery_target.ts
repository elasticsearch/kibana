/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import type { DataTableRecord } from '@kbn/discover-utils';
import { SPAN_ID_FIELD, TRACE_ID_FIELD } from '@kbn/discover-utils';
import { castArray } from 'lodash';

export interface GenAiRecoveryTarget {
  /** The index or index-pattern string to search against. */
  index: string;
  /** The document key filter for the ES search. */
  query: estypes.QueryDslQueryContainer;
  /**
   * A stable string that uniquely identifies the fetch target so that the
   * hook's `useAbortableAsync` deps stay primitive — Discover creates a fresh
   * `hit` object on every render.
   */
  cacheKey: string;
}

/** Returns the first non-empty scalar value found in `hit.flattened` for any of
 * the given field names.  Handles ES|QL's single-element-array wrapping via
 * `castArray`.
 */
const readFirst = (hit: DataTableRecord, fieldNames: string[]): string | undefined => {
  for (const name of fieldNames) {
    const raw = hit.flattened[name];
    if (raw == null) continue;
    const val = castArray(raw)[0];
    if (typeof val === 'string' && val !== '') return val;
  }
  return undefined;
};

/**
 * Resolves an ES search target (index + query) from a document record so that
 * the GenAI long-message recovery fetch can run even when `_id` / `_index` are
 * absent (e.g. an ES|QL query without `METADATA _id, _index`).
 *
 * Priority:
 *   1. `_id` → `{ ids: … }` query; index from `_index` else `indexPattern`.
 *   2. `span.id` (or OTel `span_id`) + optionally `trace.id` / `trace_id`
 *      → `{ bool: { filter: […] } }`; index from `indexPattern`.
 *
 * Returns `undefined` when neither a document key nor an index can be resolved.
 */
export const getGenAiRecoveryTarget = ({
  hit,
  indexPattern,
}: {
  hit: DataTableRecord;
  indexPattern?: string;
}): GenAiRecoveryTarget | undefined => {
  const docId = hit.raw._id;
  const docIndex = hit.raw._index;

  // --- Prefer _id / _index (the fast, unique path) ---
  if (docId) {
    const index = docIndex || indexPattern;
    if (!index) return undefined;

    return {
      index,
      query: { bool: { filter: [{ ids: { values: [docId] } }] } },
      cacheKey: `id:${docId}@${index}`,
    };
  }

  // --- Fallback: span.id (+ trace.id for extra narrowing) ---
  // The OTel native field names (underscored) are checked after the ECS/APM
  // dotted names, mirroring the shape-tolerance in `fallbackShapes` in
  // `genai_details_table.tsx`. They have no shared constants yet, so they are
  // inlined with an explanatory comment.
  const spanId = readFirst(hit, [
    SPAN_ID_FIELD, // 'span.id' — APM / ECS alias
    'span_id', // OTel native (no constant exists)
  ]);
  if (!spanId) return undefined;
  if (!indexPattern) return undefined;

  const traceId = readFirst(hit, [
    TRACE_ID_FIELD, // 'trace.id' — APM / ECS alias
    'trace_id', // OTel native
  ]);

  const filter: estypes.QueryDslQueryContainer[] = [{ term: { [SPAN_ID_FIELD]: spanId } }];
  if (traceId) {
    filter.push({ term: { [TRACE_ID_FIELD]: traceId } });
  }

  return {
    index: indexPattern,
    query: { bool: { filter } },
    cacheKey: `span:${spanId}@${traceId ?? ''}@${indexPattern}`,
  };
};
