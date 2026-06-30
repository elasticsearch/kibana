/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getSampleDocumentsEsql } from '@kbn/ai-tools';
import { esql } from '@elastic/esql';
import { ERROR_LOGS_FEATURE_TYPE, getStreamSamplingSource } from '@kbn/streams-schema';
import { compact } from 'lodash';
import type { ComputedFeatureGenerator } from './types';
import { formatRawDocument } from '../utils/format_raw_document';

const SAMPLE_SIZE = 5;
const LOG_MESSAGE_FIELDS = ['message', 'body.text'] as const;
const ERROR_KEYWORDS = ['error', 'exception'] as const;

const columnPath = (field: string) => (field.includes('.') ? field.split('.') : field);

// Equivalent to the pre-ES|QL DSL filter:
//   { term: { 'log.level': 'error' } }
//   OR match_phrase: { message: 'error' | 'exception' }
//   OR match_phrase: { 'body.text': 'error' | 'exception' }
//
// Built as a Composer `whereCondition` rather than a `KQL(...)` string because
// ES 9.3 rejects `WHERE KQL(...) | SAMPLE` at planning time. `MATCH_PHRASE` is
// the analyzer-aware ES|QL analogue of DSL `match_phrase` and works after
// `SAMPLE` on both 9.3 and 9.5.
const ERROR_WHERE_CONDITION = (() => {
  const logLevelClause = esql.exp`${esql.col(columnPath('log.level'))} == "error"`;
  const messageClauses = LOG_MESSAGE_FIELDS.flatMap((field) =>
    ERROR_KEYWORDS.map(
      (keyword) => esql.exp`MATCH_PHRASE(${esql.col(columnPath(field))}, ${esql.str(keyword)})`
    )
  );
  return [logLevelClause, ...messageClauses].reduce(
    (acc, current) => esql.exp`${acc} OR ${current}`
  );
})();

export const errorLogsGenerator: ComputedFeatureGenerator = {
  type: ERROR_LOGS_FEATURE_TYPE,

  description: 'Sample error logs extracted from the stream',

  llmInstructions: `Contains sample error logs from the stream, filtered by log.level: error or messages containing error/exception keywords.
Use the \`properties.samples\` array to see actual error log entries.
This is useful for understanding error patterns, identifying recurring issues, and diagnosing problems in the system.`,

  generate: async ({ stream, start, end, esClient }) => {
    // `unmappedFields: 'NULLIFY'` lets `MATCH_PHRASE` skip clauses whose field
    // is not mapped on any backing index. Without it, ECS-only streams (no
    // `body.text`) and OTEL-only streams (no `message`) would fail with
    // `verification_exception: Unknown column [...]`. DSL `match_phrase`
    // silently no-matches missing fields, so this preserves baseline parity.
    const { hits } = await getSampleDocumentsEsql({
      esClient,
      index: getStreamSamplingSource(stream),
      start,
      end,
      sampleSize: SAMPLE_SIZE,
      whereCondition: ERROR_WHERE_CONDITION,
      unmappedFields: 'NULLIFY',
    });

    return {
      samples: compact(hits.map((hit) => formatRawDocument({ hit })?.fields)),
    };
  },
};
