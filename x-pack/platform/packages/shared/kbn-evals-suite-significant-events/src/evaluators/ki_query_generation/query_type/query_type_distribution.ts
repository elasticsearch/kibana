/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { deriveQueryType } from '@kbn/streams-schema';
import { QUERY_TYPE_STATS } from '@kbn/significant-events-schema';
import type { KIQueryGenerationEvaluator } from '../types';
import { getQueriesFromOutput } from '../types';

/**
 * Validates the distribution of MATCH vs STATS queries in the output.
 * When `expect_stats` is true in the scenario output, checks that both
 * query types are present. Returns `null` when `expect_stats` is not set.
 */
export const queryTypeDistributionEvaluator: KIQueryGenerationEvaluator = {
  name: 'query_type_distribution',
  kind: 'CODE' as const,
  evaluate: async ({ output, expected }) => {
    const expectStats = expected.expect_stats;
    if (!expectStats) {
      return { score: null, explanation: 'STATS query distribution check not requested' };
    }

    const queries = getQueriesFromOutput(output);
    if (queries.length === 0) {
      return { score: null, explanation: 'No queries to check as no queries were generated' };
    }

    const typeCounts = { match: 0, stats: 0 };
    for (const query of queries) {
      const queryType = deriveQueryType(query.esql);
      if (queryType === QUERY_TYPE_STATS) {
        typeCounts.stats++;
      } else {
        typeCounts.match++;
      }
    }

    const hasMatch = typeCounts.match > 0;
    const hasStats = typeCounts.stats > 0;
    const issues: string[] = [];

    if (!hasMatch) {
      issues.push('No MATCH queries generated');
    }
    if (!hasStats) {
      issues.push('No STATS queries generated');
    }

    const score = hasMatch && hasStats ? 1 : hasMatch || hasStats ? 0.5 : 0;

    return {
      score,
      explanation:
        issues.length > 0
          ? `${issues.join('; ')} (${typeCounts.match} match, ${typeCounts.stats} stats)`
          : `Both query types present: ${typeCounts.match} match, ${typeCounts.stats} stats`,
      details: typeCounts,
    };
  },
};
