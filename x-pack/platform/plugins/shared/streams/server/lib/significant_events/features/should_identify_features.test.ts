/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KnowledgeIndicatorClient } from '../../streams/ki';
import { shouldIdentifyFeatures } from './should_identify_features';

const createMockKiClient = (response: { '@timestamp': string } | null = null) =>
  ({
    getLatestRevisionTimestamp: jest.fn().mockResolvedValue(response),
  } as unknown as KnowledgeIndicatorClient);

describe('shouldIdentifyFeatures', () => {
  const streamName = 'test-stream';
  const thresholdHours = 12;

  it('returns shouldIdentify: true when no inferred features exist', async () => {
    const kiClient = createMockKiClient(null);

    const result = await shouldIdentifyFeatures({
      kiClient,
      streamName,
      thresholdHours,
    });

    expect(result).toEqual({ shouldIdentify: true });
  });

  it('passes INFERRED_FEATURE_TYPES as types filter', async () => {
    const kiClient = createMockKiClient(null);

    await shouldIdentifyFeatures({
      kiClient,
      streamName,
      thresholdHours,
    });

    expect(kiClient.getLatestRevisionTimestamp).toHaveBeenCalledWith(
      streamName,
      expect.objectContaining({ types: expect.any(Array) })
    );
  });

  it('returns shouldIdentify: false when newest inferred feature is within threshold', async () => {
    const recentDate = new Date(Date.now() - 1 * 3_600_000).toISOString();
    const kiClient = createMockKiClient({ '@timestamp': recentDate });

    const result = await shouldIdentifyFeatures({
      kiClient,
      streamName,
      thresholdHours,
    });

    expect(result).toEqual({ shouldIdentify: false });
  });

  it('returns shouldIdentify: true when newest inferred feature exceeds threshold', async () => {
    const oldDate = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const kiClient = createMockKiClient({ '@timestamp': oldDate });

    const result = await shouldIdentifyFeatures({
      kiClient,
      streamName,
      thresholdHours,
    });

    expect(result).toEqual({ shouldIdentify: true });
  });

  it('returns shouldIdentify: true for invalid timestamps', async () => {
    const kiClient = createMockKiClient({ '@timestamp': 'not-a-date' });

    const result = await shouldIdentifyFeatures({
      kiClient,
      streamName,
      thresholdHours,
    });

    expect(result).toEqual({ shouldIdentify: true });
  });

  it('returns shouldIdentify: false at the threshold boundary', async () => {
    const justWithinThreshold = new Date(
      Date.now() - thresholdHours * 3_600_000 + 1000
    ).toISOString();
    const kiClient = createMockKiClient({ '@timestamp': justWithinThreshold });

    const result = await shouldIdentifyFeatures({
      kiClient,
      streamName,
      thresholdHours,
    });

    expect(result).toEqual({ shouldIdentify: false });
  });
});
