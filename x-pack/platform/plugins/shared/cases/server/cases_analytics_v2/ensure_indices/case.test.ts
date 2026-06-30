/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { CASE_INDEX_NAME } from '../constants';
import { ensureCaseIndex } from './case';

const buildDeps = () => ({
  esClient: elasticsearchServiceMock.createElasticsearchClient(),
  logger: loggerMock.create(),
});

describe('ensureCaseIndex', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates the index with the correct settings when it does not exist', async () => {
    const { esClient, logger } = buildDeps();
    (esClient.indices.exists as unknown as jest.Mock).mockResolvedValue(false);
    (esClient.indices.create as unknown as jest.Mock).mockResolvedValue({});

    await ensureCaseIndex({ esClient, logger });

    expect(esClient.indices.create).toHaveBeenCalledTimes(1);
    const call = (esClient.indices.create as unknown as jest.Mock).mock.calls[0][0];
    expect(call.index).toBe(CASE_INDEX_NAME);
    expect(call.settings).toMatchObject({
      'index.hidden': true,
      'index.mode': 'lookup',
    });
  });

  /**
   * Without `auto_expand_replicas`, ES defaults to `number_of_replicas: 1`,
   * costing 2 shards (1 primary + 1 replica) even on a single-node cluster.
   * Environments already near the 1000-shard default hit a
   * `validation_exception` and the bootstrap fails before the feature starts.
   * `auto_expand_replicas: '0-1'` keeps the cost at 1 shard on single-node
   * clusters (dev/CI) and automatically adds the replica on multi-node
   * clusters (production) — no manual configuration required.
   */
  it('sets auto_expand_replicas to prevent max_shards_open failures on single-node clusters', async () => {
    const { esClient, logger } = buildDeps();
    (esClient.indices.exists as unknown as jest.Mock).mockResolvedValue(false);
    (esClient.indices.create as unknown as jest.Mock).mockResolvedValue({});

    await ensureCaseIndex({ esClient, logger });

    const call = (esClient.indices.create as unknown as jest.Mock).mock.calls[0][0];
    expect(call.settings['index.auto_expand_replicas']).toBe('0-1');
  });

  it('skips creation and logs debug when the index already exists', async () => {
    const { esClient, logger } = buildDeps();
    (esClient.indices.exists as unknown as jest.Mock).mockResolvedValue(true);

    await ensureCaseIndex({ esClient, logger });

    expect(esClient.indices.create).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('already exists; skipping bootstrap')
    );
  });

  it('swallows resource_already_exists_exception from a concurrent bootstrap race', async () => {
    const { esClient, logger } = buildDeps();
    (esClient.indices.exists as unknown as jest.Mock).mockResolvedValue(false);
    const err = Object.assign(new Error('already exists'), {
      meta: { body: { error: { type: 'resource_already_exists_exception' } } },
    });
    (esClient.indices.create as unknown as jest.Mock).mockRejectedValue(err);

    await expect(ensureCaseIndex({ esClient, logger })).resolves.toBeUndefined();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs error and does not throw on unexpected ES failure', async () => {
    const { esClient, logger } = buildDeps();
    (esClient.indices.exists as unknown as jest.Mock).mockResolvedValue(false);
    (esClient.indices.create as unknown as jest.Mock).mockRejectedValue(
      new Error('cluster_block_exception')
    );

    await expect(ensureCaseIndex({ esClient, logger })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to bootstrap'),
      expect.anything()
    );
  });
});
