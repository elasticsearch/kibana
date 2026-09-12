/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { documentsRestoredEvaluator, timestampsReplayedEvaluator } from './evaluators';
import type { SeedDataSummary } from './task';

const DATA_STREAM = 'logs-nightshift.synthetic-default';
const MAXIMUM_AGE_MS = 30 * 60_000;

const isoAgo = (milliseconds: number) => new Date(Date.now() - milliseconds).toISOString();

const scoreWith = (
  evaluator: typeof documentsRestoredEvaluator,
  output: SeedDataSummary,
  expected: { minimum_document_count: number; maximum_document_age_ms: number }
) =>
  evaluator.evaluate({
    input: { dataset_id: 'synthetic-smoke' },
    output,
    expected,
    metadata: null,
  });

describe('documentsRestoredEvaluator', () => {
  const score = (documentCount: number, minimumDocumentCount: number) =>
    scoreWith(
      documentsRestoredEvaluator,
      { indices: [DATA_STREAM], documentCount, latestTimestamp: isoAgo(0) },
      {
        minimum_document_count: minimumDocumentCount,
        maximum_document_age_ms: MAXIMUM_AGE_MS,
      }
    );

  it('scores 1 when the document count meets the minimum exactly', async () => {
    await expect(score(500, 500)).resolves.toMatchObject({ score: 1 });
  });

  it('scores 1 when more documents than expected were restored', async () => {
    await expect(score(750, 500)).resolves.toMatchObject({ score: 1 });
  });

  it('scores 0 when fewer documents than expected were restored', async () => {
    await expect(score(499, 500)).resolves.toMatchObject({ score: 0 });
  });

  it('scores 0 when nothing was restored', async () => {
    await expect(score(0, 500)).resolves.toMatchObject({ score: 0 });
  });

  it('reports both counts and the searched data streams as metadata', async () => {
    await expect(score(500, 400)).resolves.toMatchObject({
      metadata: { documentCount: 500, minimumDocumentCount: 400, indices: [DATA_STREAM] },
    });
  });

  it('explains an empty result without naming a data stream', async () => {
    const result = await scoreWith(
      documentsRestoredEvaluator,
      { indices: [], documentCount: 0, latestTimestamp: null },
      { minimum_document_count: 500, maximum_document_age_ms: MAXIMUM_AGE_MS }
    );

    expect(result).toMatchObject({ score: 0 });
    expect(result.explanation).toContain('no data streams');
  });
});

describe('timestampsReplayedEvaluator', () => {
  const score = (latestTimestamp: string | null) =>
    scoreWith(
      timestampsReplayedEvaluator,
      { indices: [DATA_STREAM], documentCount: 500, latestTimestamp },
      { minimum_document_count: 500, maximum_document_age_ms: MAXIMUM_AGE_MS }
    );

  it('scores 1 when the newest document sits inside the allowance', async () => {
    await expect(score(isoAgo(5_000))).resolves.toMatchObject({ score: 1 });
  });

  it('scores 1 when the newest document is slightly in the future', async () => {
    // Replay pins the newest document to "now", so clock skew can push it marginally ahead.
    await expect(score(isoAgo(-2_000))).resolves.toMatchObject({ score: 1 });
  });

  it('describes a future timestamp as such rather than as a negative age', async () => {
    const result = await score(isoAgo(-2_000));

    expect(result.explanation).toContain('in the future');
    expect(result.explanation).not.toContain('-');
  });

  it('scores 0 when the newest document still carries its capture-time timestamp', async () => {
    await expect(score(isoAgo(14 * 24 * 60 * 60_000))).resolves.toMatchObject({ score: 0 });
  });

  it('scores 0 when no documents were seeded', async () => {
    await expect(score(null)).resolves.toMatchObject({ score: 0 });
  });

  it('scores 0 when the timestamp cannot be parsed', async () => {
    const result = await score('not-a-timestamp');

    expect(result).toMatchObject({ score: 0 });
    expect(result.explanation).toContain('unparseable');
  });

  it('reports the age it measured as metadata', async () => {
    const result = await score(isoAgo(10_000));

    expect(result.metadata).toEqual(
      expect.objectContaining({ ageMs: expect.any(Number), maximumAgeMs: MAXIMUM_AGE_MS })
    );
  });
});
