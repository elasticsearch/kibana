/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';
import { resolveClosedIndexAdjustments } from './resolve_closed_indices';

const makeEsClient = (resolveIndexImpl: jest.Mock) =>
  ({
    indices: { resolveIndex: resolveIndexImpl },
  } as unknown as ElasticsearchClient);

const emptyResolve = { indices: [], aliases: [], data_streams: [] };

describe('resolveClosedIndexAdjustments', () => {
  const logger = loggerMock.create();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty result when includePatterns is empty', async () => {
    const resolveIndex = jest.fn();
    const result = await resolveClosedIndexAdjustments(makeEsClient(resolveIndex), [], logger);

    expect(result).toEqual({ openBackingIndices: [], negations: [] });
    expect(resolveIndex).not.toHaveBeenCalled();
  });

  it('returns empty result when all patterns are negations', async () => {
    const resolveIndex = jest.fn();
    const result = await resolveClosedIndexAdjustments(
      makeEsClient(resolveIndex),
      ['-logs-proxy-*', '-metrics-debug'],
      logger
    );

    expect(result).toEqual({ openBackingIndices: [], negations: [] });
    expect(resolveIndex).not.toHaveBeenCalled();
  });

  it('filters out negations before calling resolveIndex', async () => {
    const resolveIndex = jest.fn().mockResolvedValue(emptyResolve);

    await resolveClosedIndexAdjustments(
      makeEsClient(resolveIndex),
      ['logs-*', '-logs-proxy-*', 'metrics-*'],
      logger
    );

    expect(resolveIndex).toHaveBeenCalledWith(
      expect.objectContaining({ name: ['logs-*', 'metrics-*'] })
    );
  });

  it('returns negation for a closed standalone index', async () => {
    const resolveIndex = jest.fn().mockResolvedValue({
      indices: [
        { name: 'standalone-closed-index', attributes: ['closed'] },
        { name: 'standalone-open-index', attributes: ['open'] },
      ],
      aliases: [],
      data_streams: [],
    });

    const result = await resolveClosedIndexAdjustments(
      makeEsClient(resolveIndex),
      ['standalone-*'],
      logger
    );

    expect(result.negations).toContain('-standalone-closed-index');
    expect(result.negations).not.toContain('-standalone-open-index');
    expect(result.openBackingIndices).toEqual([]);
  });

  it('negates the data stream name (not backing index) and adds open backing indices back', async () => {
    const resolveIndex = jest
      .fn()
      // First call: pattern resolves to a data stream
      .mockResolvedValueOnce({
        indices: [],
        aliases: [],
        data_streams: [
          {
            name: 'logs-simulate-close-test',
            backing_indices: [
              '.ds-logs-simulate-close-test-000001',
              '.ds-logs-simulate-close-test-000002',
            ],
            timestamp_field: '@timestamp',
          },
        ],
      })
      // Second call: concrete backing index names — first is closed, second is open
      .mockResolvedValueOnce({
        indices: [
          { name: '.ds-logs-simulate-close-test-000001', attributes: ['closed'] },
          { name: '.ds-logs-simulate-close-test-000002', attributes: ['open'] },
        ],
        aliases: [],
        data_streams: [],
      });

    const result = await resolveClosedIndexAdjustments(
      makeEsClient(resolveIndex),
      ['logs-simulate-close-test'],
      logger
    );

    // Data stream name negated — not the individual backing index name
    expect(result.negations).toContain('-logs-simulate-close-test');
    expect(result.negations).not.toContain('-.ds-logs-simulate-close-test-000001');
    // Open backing index added back as a positive inclusion
    expect(result.openBackingIndices).toContain('.ds-logs-simulate-close-test-000002');
    // Closed backing index NOT added to openBackingIndices
    expect(result.openBackingIndices).not.toContain('.ds-logs-simulate-close-test-000001');
  });

  it('does not add negation for data stream with no closed backing indices', async () => {
    const resolveIndex = jest
      .fn()
      .mockResolvedValueOnce({
        indices: [],
        aliases: [],
        data_streams: [
          {
            name: 'logs-healthy',
            backing_indices: ['.ds-logs-healthy-000001', '.ds-logs-healthy-000002'],
            timestamp_field: '@timestamp',
          },
        ],
      })
      .mockResolvedValueOnce({
        indices: [
          { name: '.ds-logs-healthy-000001', attributes: ['open'] },
          { name: '.ds-logs-healthy-000002', attributes: ['open'] },
        ],
        aliases: [],
        data_streams: [],
      });

    const result = await resolveClosedIndexAdjustments(
      makeEsClient(resolveIndex),
      ['logs-healthy'],
      logger
    );

    expect(result).toEqual({ openBackingIndices: [], negations: [] });
  });

  it('does not make a second resolveIndex call when data_streams is empty', async () => {
    const resolveIndex = jest.fn().mockResolvedValue(emptyResolve);

    await resolveClosedIndexAdjustments(makeEsClient(resolveIndex), ['logs-*'], logger);

    expect(resolveIndex).toHaveBeenCalledTimes(1);
  });

  it('second resolveIndex call uses the concrete backing index names', async () => {
    const resolveIndex = jest
      .fn()
      .mockResolvedValueOnce({
        indices: [],
        aliases: [],
        data_streams: [
          {
            name: 'logs-foo',
            backing_indices: ['.ds-logs-foo-000001', '.ds-logs-foo-000002'],
            timestamp_field: '@timestamp',
          },
        ],
      })
      .mockResolvedValueOnce(emptyResolve);

    await resolveClosedIndexAdjustments(makeEsClient(resolveIndex), ['logs-*'], logger);

    expect(resolveIndex).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: ['.ds-logs-foo-000001', '.ds-logs-foo-000002'],
      })
    );
  });

  it('calls resolveIndex with correct expand_wildcards and ignore options', async () => {
    const resolveIndex = jest.fn().mockResolvedValue(emptyResolve);

    await resolveClosedIndexAdjustments(makeEsClient(resolveIndex), ['logs-*'], logger);

    expect(resolveIndex).toHaveBeenCalledWith({
      name: ['logs-*'],
      expand_wildcards: ['open', 'closed', 'hidden'],
      ignore_unavailable: true,
      allow_no_indices: true,
    });
  });

  it('returns empty result and logs a warning on resolveIndex failure', async () => {
    const resolveIndex = jest.fn().mockRejectedValue(new Error('connection refused'));

    const result = await resolveClosedIndexAdjustments(
      makeEsClient(resolveIndex),
      ['logs-*'],
      logger
    );

    expect(result).toEqual({ openBackingIndices: [], negations: [] });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to resolve closed indices')
    );
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('connection refused'));
  });

  it('logs a warning when closed indices are detected', async () => {
    const resolveIndex = jest
      .fn()
      .mockResolvedValueOnce({
        indices: [],
        aliases: [],
        data_streams: [
          {
            name: 'logs-closed-ds',
            backing_indices: ['.ds-logs-closed-ds-000001'],
            timestamp_field: '@timestamp',
          },
        ],
      })
      .mockResolvedValueOnce({
        indices: [{ name: '.ds-logs-closed-ds-000001', attributes: ['closed'] }],
        aliases: [],
        data_streams: [],
      });

    await resolveClosedIndexAdjustments(makeEsClient(resolveIndex), ['logs-*'], logger);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('-logs-closed-ds'));
  });
});
