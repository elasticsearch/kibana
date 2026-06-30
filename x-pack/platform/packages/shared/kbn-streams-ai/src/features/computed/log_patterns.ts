/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getSigEventsLogPatternsEsql, type LogPatternEsqlEntry } from '@kbn/ai-tools';
import { getStreamSamplingSource } from '@kbn/streams-schema';
import { LOG_PATTERNS_FEATURE_TYPE } from '@kbn/significant-events-schema';
import { createTracedEsClient } from '@kbn/traced-es-client';
import type { ComputedFeatureGenerator } from './types';

const LOG_MESSAGE_FIELDS = ['message', 'body.text'];

const MAX_COMMON_PATTERNS = 4;
const MAX_RARE_PATTERNS = 6;
const MAX_SAMPLE_LENGTH = 500;

const truncateSample = (sample: string) =>
  sample.length > MAX_SAMPLE_LENGTH ? `${sample.slice(0, MAX_SAMPLE_LENGTH)}…` : sample;

export type LogPatternEntry = LogPatternEsqlEntry;

export function selectLogPatternsForLlm(patterns: LogPatternEntry[]): LogPatternEntry[] {
  const common = patterns.slice(0, MAX_COMMON_PATTERNS);
  const rareStart = Math.max(MAX_COMMON_PATTERNS, patterns.length - MAX_RARE_PATTERNS);
  const rare = patterns.slice(rareStart);

  return [...common, ...rare].map(({ field, pattern, count, sample }) => ({
    pattern,
    count,
    sample: truncateSample(sample),
    field,
  }));
}

export const logPatternsGenerator: ComputedFeatureGenerator = {
  type: LOG_PATTERNS_FEATURE_TYPE,

  description: 'Log message patterns identified through categorization analysis',

  llmInstructions: `Contains log message patterns identified by analyzing the log messages in the stream.
Use the \`properties.patterns\` array to see both common and rare log patterns. The array contains the top common patterns (highest \`count\`) and the rarest patterns (lowest \`count\`) — rare patterns are often the most interesting for anomaly or error detection.
Each pattern includes: field (source field name), pattern (normalized message with placeholders), count (frequency), and sample (a real example message, possibly truncated).
This is useful for understanding the types of logs in the stream and identifying anomalies or trends.`,

  generate: async ({ stream, start, end, esClient, logger }) => {
    const tracedClient = createTracedEsClient({
      client: esClient,
      logger,
      plugin: 'streams',
    });

    const patterns = await getSigEventsLogPatternsEsql({
      esClient: tracedClient,
      samplingSource: getStreamSamplingSource(stream),
      start,
      end,
      fields: LOG_MESSAGE_FIELDS,
    });

    return { patterns: selectLogPatternsForLlm(patterns) };
  },
};
