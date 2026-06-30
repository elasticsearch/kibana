/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';
import type { ESQLSearchResponse } from '@kbn/es-types';

export interface CategorizeWithSampleRow {
  count: number;
  pattern: string;
  sample: string;
}

/**
 * Converts a possibly-dotted ECS field path (e.g. `body.text`) into the
 * ES|QL Composer column-path shape (`['body', 'text']`), or returns the literal
 * field name when there is no dot. Required because `esql.col(...)` accepts a
 * column-segment array for nested paths.
 */
export function columnPath(field: string): string | string[] {
  return field.includes('.') ? field.split('.') : field;
}

/**
 * Builds a single-pass ES|QL categorization query that returns, per pattern, the
 * document count and one representative sample value for the field. The sample
 * uses `TOP(<field>::keyword, 1, "desc")`: text fields are not aggregatable, so
 * the cast to keyword makes the value usable by `TOP` while keeping the original
 * message text.
 *
 * Crucially this needs no `_index`/`_id`/`_source` metadata, so it works for both
 * concrete indices and ES|QL views (e.g. query streams' `$.<name>` views), where
 * `FROM <view> METADATA _index, _id` raises `Unknown column [_index]`.
 */
export function buildCategorizeWithSampleQuery({
  indices,
  field,
  limit,
  samplingProbability,
  kql,
}: {
  indices: string | string[];
  field: string;
  limit: number;
  samplingProbability: number;
  kql?: string;
}): string {
  let query = esql.from(Array.isArray(indices) ? indices : [indices]);

  if (kql) {
    query = query.where`KQL(${esql.str(kql)})`;
  }
  if (samplingProbability < 1) {
    query = query.pipe`SAMPLE ${esql.num(samplingProbability)}`;
  }

  const fieldCol = esql.col(columnPath(field));

  return query.pipe`STATS count = COUNT(*), sample = TOP(${fieldCol}::keyword, 1, "desc") BY pattern = CATEGORIZE(${fieldCol})`
    .sort([['count'], 'DESC', ''])
    .limit(limit)
    .print('basic');
}

export function parseCategorizeWithSampleRows(
  response: ESQLSearchResponse
): CategorizeWithSampleRow[] {
  const countIndex = response.columns.findIndex((column) => column.name === 'count');
  const sampleIndex = response.columns.findIndex((column) => column.name === 'sample');
  const patternIndex = response.columns.findIndex((column) => column.name === 'pattern');

  if (countIndex === -1 || sampleIndex === -1 || patternIndex === -1) {
    return [];
  }

  return response.values.flatMap((row) => {
    const count = row[countIndex];
    const pattern = row[patternIndex];
    const rawSample = row[sampleIndex];
    const sample = Array.isArray(rawSample) ? rawSample[0] : rawSample;

    if (typeof count !== 'number' || typeof pattern !== 'string') {
      return [];
    }

    return [{ count, pattern, sample: typeof sample === 'string' ? sample : '' }];
  });
}
