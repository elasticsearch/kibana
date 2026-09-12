/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SmokeEvaluator } from './types';

const toSeconds = (milliseconds: number): string => `${Math.round(milliseconds / 1000)}s`;

/** Replay can land the newest document marginally ahead of the clock, so age can be negative. */
const describeAge = (ageMs: number): string =>
  ageMs < 0 ? `${toSeconds(-ageMs)} in the future` : `${toSeconds(ageMs)} old`;

/**
 * Scores whether seeding landed at least as many documents in the eval cluster as the eval
 * dataset declares its seed snapshot holds.
 */
export const documentsRestoredEvaluator: SmokeEvaluator = {
  name: 'documents_restored',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output, expected }) => {
    const { documentCount, indices } = output;
    const { minimum_document_count: minimumDocumentCount } = expected;

    const searched = indices.length > 0 ? indices.join(', ') : 'no data streams';

    return {
      score: documentCount >= minimumDocumentCount ? 1 : 0,
      explanation:
        `Found ${documentCount} document(s) in ${searched}, ` +
        `expected at least ${minimumDocumentCount}.`,
      metadata: { documentCount, minimumDocumentCount, indices: [...indices] },
    };
  },
};

/**
 * Scores whether the newest seeded document is recent.
 *
 * `replaySnapshot` shifts every `@timestamp` so the newest document lands at "now". Data still
 * carrying its capture-time timestamps scores 0, which is how a skipped or failed reindex
 * through the timestamp pipeline shows up.
 */
export const timestampsReplayedEvaluator: SmokeEvaluator = {
  name: 'timestamps_replayed',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output, expected }) => {
    const { latestTimestamp } = output;
    const { maximum_document_age_ms: maximumAgeMs } = expected;

    if (!latestTimestamp) {
      return {
        score: 0,
        explanation: 'No documents were seeded, so no timestamp could be checked.',
        metadata: { maximumAgeMs },
      };
    }

    const newestAt = Date.parse(latestTimestamp);

    if (Number.isNaN(newestAt)) {
      return {
        score: 0,
        explanation: `Newest document has an unparseable @timestamp: "${latestTimestamp}".`,
        metadata: { latestTimestamp, maximumAgeMs },
      };
    }

    const ageMs = Date.now() - newestAt;

    return {
      score: ageMs <= maximumAgeMs ? 1 : 0,
      explanation: `Newest document is ${describeAge(ageMs)}, limit is ${toSeconds(maximumAgeMs)}.`,
      metadata: { latestTimestamp, ageMs, maximumAgeMs },
    };
  },
};

/**
 * Two scores rather than one, so a regression says whether the data failed to arrive at all or
 * arrived with its original timestamps.
 */
export const smokeEvaluators: SmokeEvaluator[] = [
  documentsRestoredEvaluator,
  timestampsReplayedEvaluator,
];
