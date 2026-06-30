/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isPlainObject } from 'lodash';
import objectHash from 'object-hash';
import type { ESQLSearchResponse } from '@kbn/es-types';

export interface EsqlSourceDocument {
  /**
   * The `_id` column value when present and a string. `undefined` for ES|QL
   * views, which silently drop the outer `METADATA _id`. Callers that need a
   * stable identity for view rows should derive one (e.g. hash the source).
   */
  id: string | undefined;
  source: Record<string, unknown>;
}

/**
 * Returns a stable string identity for a parsed ES|QL document: the real `_id`
 * for concrete indices, or a content hash of the reconstructed source for ES|QL
 * views (which expose no `_id`). The hash is deterministic across runs, so
 * identity-based dedup (alert dedup in the rule executor, cross-bucket sample
 * dedup) works for views too.
 */
export function getEsqlDocumentId({ id, source }: EsqlSourceDocument): string {
  return id ?? objectHash(source);
}

// ES|QL metadata columns that are never part of the reconstructed document body.
const METADATA_COLUMN_NAMES = new Set([
  '_id',
  '_index',
  '_source',
  '_version',
  '_score',
  '_ignored',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => isPlainObject(value);

/**
 * Parses ES|QL response rows into `{ id, source }` documents, handling both
 * source shapes ES|QL can return:
 *
 * - Concrete indices queried with `METADATA _id, _source`: identity and full
 *   source come straight from those columns.
 * - ES|QL views (e.g. query streams' `$.<name>` views): ES|QL silently drops the
 *   outer `METADATA _id, _source`, so neither column is returned. Reconstruct
 *   `_source` from the projected (non-metadata) columns and report `id:
 *   undefined`.
 *
 * Rows with no usable source are omitted.
 */
export function parseEsqlSourceDocuments(response: ESQLSearchResponse): EsqlSourceDocument[] {
  const { columns, values } = response;
  const idIndex = columns.findIndex((column) => column.name === '_id');
  const sourceIndex = columns.findIndex((column) => column.name === '_source');

  const documents: EsqlSourceDocument[] = [];

  // Concrete-index path: `_id` and `_source` columns are returned directly.
  if (idIndex !== -1 && sourceIndex !== -1) {
    for (const row of values) {
      const id = row[idIndex];
      if (typeof id !== 'string') {
        continue;
      }
      const source = row[sourceIndex];
      documents.push({ id, source: isRecord(source) ? source : {} });
    }
    return documents;
  }

  // View path: reconstruct `_source` from the projected (non-metadata) columns.
  const dataColumns = columns
    .map((column, columnIndex) => ({ name: column.name, columnIndex }))
    .filter(({ name }) => !METADATA_COLUMN_NAMES.has(name));

  if (dataColumns.length === 0) {
    return documents;
  }

  for (const row of values) {
    const source: Record<string, unknown> = {};
    let hasValue = false;
    for (const { name, columnIndex } of dataColumns) {
      const value = row[columnIndex];
      if (value != null) {
        source[name] = value;
        hasValue = true;
      }
    }
    if (!hasValue) {
      continue;
    }
    const id = idIndex !== -1 ? row[idIndex] : undefined;
    documents.push({ id: typeof id === 'string' ? id : undefined, source });
  }

  return documents;
}
