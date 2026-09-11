/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface IngestOutcome {
  ingested: number;
  rejected: number;
  firstFailure: string;
}

export type IngestVerdict =
  | { kind: 'ok' }
  | { kind: 'partial'; message: string }
  | { kind: 'total-failure'; message: string };

export const createIngestOutcome = (): IngestOutcome => ({
  ingested: 0,
  rejected: 0,
  firstFailure: '',
});

export const recordIngestFailure = (outcome: IngestOutcome, reason: string): void => {
  outcome.rejected += 1;
  if (!outcome.firstFailure) {
    outcome.firstFailure = reason;
  }
};

/**
 * Classifies a run's score-export result.
 *
 * Score ingest is best-effort per example so one bad document cannot abort a long
 * sweep. That tolerance hides total failure: an expired or unprivileged export key
 * makes every document fail while the run still exits 0, which has silently
 * destroyed whole sweeps. Rejections with zero successes are therefore fatal —
 * the run produced nothing durable and must not be reported as a pass.
 */
export const classifyIngestOutcome = (outcome: IngestOutcome): IngestVerdict => {
  if (outcome.rejected === 0) {
    return { kind: 'ok' };
  }

  const summary =
    `Score export: ${outcome.ingested} ingested, ${outcome.rejected} rejected. ` +
    `First failure: ${outcome.firstFailure}`;

  if (outcome.ingested === 0) {
    return {
      kind: 'total-failure',
      message: `No evaluation scores could be exported — this run produced no durable results. ${summary}`,
    };
  }

  return { kind: 'partial', message: summary };
};
