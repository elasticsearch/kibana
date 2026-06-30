/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import dateMath from '@kbn/datemath';

// Sanitizes a cell value before it is included in an LLM prompt.
// Strips HTML angle brackets, newlines, and Liquid template delimiters ({{ and {%)
// to prevent prompt injection via crafted field names or values.
export function sanitizeCellValue(v: unknown): string {
  return String(v ?? '')
    .replace(/[<>]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\{\{/g, '{ {')
    .replace(/\{%/g, '{ %')
    .slice(0, 500);
}

export interface EsqlColumn {
  name: string;
  type: string;
}

interface EsqlQueryResult {
  columns: EsqlColumn[];
  rows: unknown[][];
}

/**
 * Runs an ES|QL query server-side (used by the generate route for schema sampling).
 * Resolves `?_tstart` / `?_tend` named params when the query contains them and a
 * `timeRange` is provided.
 */
export async function runEsqlQuery(
  esClient: ElasticsearchClient,
  esqlQuery: string,
  timeRange?: { from: string; to: string } | null
): Promise<EsqlQueryResult> {
  const hasTimeParams = esqlQuery.includes('?_tstart') || esqlQuery.includes('?_tend');

  const esqlParams =
    hasTimeParams && timeRange
      ? [
          { _tstart: dateMath.parse(timeRange.from)?.toISOString() ?? timeRange.from },
          { _tend: dateMath.parse(timeRange.to, { roundUp: true })?.toISOString() ?? timeRange.to },
        ]
      : undefined;

  const result = await esClient.esql.query(
    {
      query: esqlQuery,
      ...(esqlParams ? { params: esqlParams } : {}),
    },
    { requestTimeout: 30_000 }
  );

  return {
    columns: result.columns as EsqlColumn[],
    rows: result.values as unknown[][],
  };
}
