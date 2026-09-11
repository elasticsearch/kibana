/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Evaluator } from '../../types';
import { TRACE_INDEX_PATTERN, createTraceBasedEvaluator } from './factory';

// The ES client folds the root-cause reason into `message`. Pinned to this one column: any other
// unknown column is a query bug and must stay a hard failure.
const CACHE_READ_COLUMN_MISSING =
  /Unknown column \[attributes\.gen_ai\.usage\.cache_read\.input_tokens\]/;

export function createOutputTokensEvaluator({
  traceEsClient,
  log,
}: {
  traceEsClient: EsClient;
  log: ToolingLog;
}): Evaluator {
  return createTraceBasedEvaluator({
    traceEsClient,
    log,
    config: {
      name: 'Output Tokens',
      direction: 'minimize',
      // TO_LONG resolves union types (integer vs long across trace index generations).
      buildQuery: (traceId) => `FROM ${TRACE_INDEX_PATTERN}
        | WHERE trace.id == "${traceId}"
        | STATS 
        output_tokens = SUM(TO_LONG(attributes.gen_ai.usage.output_tokens))`,
      extractResult: (response) => {
        const { columns, values } = response;
        const row = values[0];
        const outputTokensIdx = columns.findIndex((col) => col.name === 'output_tokens');
        return row[outputTokensIdx];
      },
      isResultValid: (result) => result !== null && result > 0,
    },
  });
}

export function createInputTokensEvaluator({
  traceEsClient,
  log,
}: {
  traceEsClient: EsClient;
  log: ToolingLog;
}): Evaluator {
  return createTraceBasedEvaluator({
    traceEsClient,
    log,
    config: {
      name: 'Input Tokens',
      direction: 'minimize',
      // TO_LONG resolves union types (integer vs long across trace index generations).
      buildQuery: (traceId) => `FROM ${TRACE_INDEX_PATTERN}
        | WHERE trace.id == "${traceId}"
        | STATS 
        input_tokens = SUM(TO_LONG(attributes.gen_ai.usage.input_tokens))`,
      extractResult: (response) => {
        const { columns, values } = response;
        const row = values[0];
        const inputTokensIdx = columns.findIndex((col) => col.name === 'input_tokens');
        return row[inputTokensIdx];
      },
      isResultValid: (result) => result !== null && result > 0,
    },
  });
}

export function createCachedTokensEvaluator({
  traceEsClient,
  log,
}: {
  traceEsClient: EsClient;
  log: ToolingLog;
}): Evaluator {
  return createTraceBasedEvaluator({
    traceEsClient,
    log,
    config: {
      name: 'Cached Tokens',
      direction: 'neutral',
      // `input_tokens` is a liveness probe: providers that never report caching (most EIS models)
      // omit cache_read entirely, which otherwise looks like a trace that has not finished indexing.
      buildQuery: (traceId) => `FROM ${TRACE_INDEX_PATTERN}
        | WHERE trace.id == "${traceId}"
        | STATS 
        cached_tokens = SUM(TO_LONG(attributes.gen_ai.usage.cache_read.input_tokens)),
        input_tokens = SUM(TO_LONG(attributes.gen_ai.usage.input_tokens))`,
      // A caching provider reports 0 on a miss, which scores normally. Absent from every span means
      // no measurement exists, and a 0 would misreport that as a fully missed cache.
      isNotReported: (response) => {
        const { columns, values } = response;
        const row = values[0];
        const cachedTokens = row[columns.findIndex((col) => col.name === 'cached_tokens')];
        const inputTokens = row[columns.findIndex((col) => col.name === 'input_tokens')];

        return cachedTokens == null && inputTokens != null;
      },
      // Where no span ever reported cache reads the column is unmapped and the query above is
      // rejected outright, so the same liveness evidence has to be gathered on its own.
      notReportedProbe: {
        matchesQueryError: (error) =>
          error instanceof Error && CACHE_READ_COLUMN_MISSING.test(error.message),
        buildQuery: (traceId) => `FROM ${TRACE_INDEX_PATTERN}
        | WHERE trace.id == "${traceId}"
        | STATS input_tokens = SUM(TO_LONG(attributes.gen_ai.usage.input_tokens))`,
        isTraceComplete: (response) => {
          const { columns, values } = response;
          const inputTokensIdx = columns.findIndex((col) => col.name === 'input_tokens');
          return values[0][inputTokensIdx] != null;
        },
      },
      extractResult: (response) => {
        const { columns, values } = response;
        const row = values[0];
        const cachedTokensIdx = columns.findIndex((col) => col.name === 'cached_tokens');
        return row[cachedTokensIdx];
      },
      isResultValid: (result) => result !== null,
    },
  });
}
