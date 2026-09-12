/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createIndexWithMappings, createOrUpdateIndex } from './create_index';

const createEsClientMock = () => ({
  indices: {
    exists: jest.fn(),
    create: jest.fn(),
    putMapping: jest.fn(),
    putSettings: jest.fn(),
  },
});

const createLoggerMock = () => ({
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
});

describe('createIndexWithMappings', () => {
  it('creates the index when it does not exist', async () => {
    const esClient = createEsClientMock();
    esClient.indices.exists.mockResolvedValue(false);
    esClient.indices.create.mockResolvedValue({});
    const logger = createLoggerMock();

    await createIndexWithMappings({
      esClient: esClient as any,
      indexName: '.test-index',
      mappings: { properties: {} },
      logger: logger as any,
    });

    expect(esClient.indices.create).toHaveBeenCalledWith({
      index: '.test-index',
      mappings: { properties: {} },
      settings: { index: { hidden: true } },
    });
  });

  it('skips creation when index already exists', async () => {
    const esClient = createEsClientMock();
    esClient.indices.exists.mockResolvedValue(true);
    const logger = createLoggerMock();

    await createIndexWithMappings({
      esClient: esClient as any,
      indexName: '.test-index',
      mappings: { properties: {} },
      logger: logger as any,
    });

    expect(esClient.indices.create).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('already exists'));
  });

  it('handles resource_already_exists_exception gracefully', async () => {
    const esClient = createEsClientMock();
    esClient.indices.exists.mockResolvedValue(false);
    esClient.indices.create.mockRejectedValue({
      meta: { body: { error: { type: 'resource_already_exists_exception' } } },
    });
    const logger = createLoggerMock();

    await expect(
      createIndexWithMappings({
        esClient: esClient as any,
        indexName: '.test-index',
        mappings: { properties: {} },
        logger: logger as any,
      })
    ).resolves.toBeUndefined();
  });

  it('rethrows non-resource-exists errors', async () => {
    const esClient = createEsClientMock();
    esClient.indices.exists.mockResolvedValue(false);
    const err = new Error('es down');
    esClient.indices.create.mockRejectedValue(err);
    const logger = createLoggerMock();

    await expect(
      createIndexWithMappings({
        esClient: esClient as any,
        indexName: '.test-index',
        mappings: { properties: {} },
        logger: logger as any,
      })
    ).rejects.toThrow('es down');
  });
});

describe('createOrUpdateIndex', () => {
  it('creates index when it does not exist', async () => {
    const esClient = createEsClientMock();
    esClient.indices.exists.mockResolvedValue(false);
    esClient.indices.create.mockResolvedValue({});
    const logger = createLoggerMock();

    await createOrUpdateIndex({
      esClient: esClient as any,
      indexName: '.test-index',
      mappings: { properties: {} },
      logger: logger as any,
    });

    expect(esClient.indices.create).toHaveBeenCalled();
  });

  it('updates mappings and applies hidden setting when index already exists', async () => {
    const esClient = createEsClientMock();
    esClient.indices.exists.mockResolvedValue(true);
    esClient.indices.putMapping.mockResolvedValue({});
    esClient.indices.putSettings.mockResolvedValue({});
    const logger = createLoggerMock();

    await createOrUpdateIndex({
      esClient: esClient as any,
      indexName: '.test-index',
      mappings: { properties: { id: { type: 'keyword' } } },
      logger: logger as any,
    });

    expect(esClient.indices.putMapping).toHaveBeenCalledWith({
      index: '.test-index',
      properties: { id: { type: 'keyword' } },
    });
    expect(esClient.indices.putSettings).toHaveBeenCalledWith({
      index: '.test-index',
      settings: { index: { hidden: true } },
    });
    expect(esClient.indices.create).not.toHaveBeenCalled();
  });

  it('rethrows if putMapping fails', async () => {
    const esClient = createEsClientMock();
    esClient.indices.exists.mockResolvedValue(true);
    esClient.indices.putMapping.mockRejectedValue(new Error('mapping conflict'));
    esClient.indices.putSettings.mockResolvedValue({});
    const logger = createLoggerMock();

    await expect(
      createOrUpdateIndex({
        esClient: esClient as any,
        indexName: '.test-index',
        mappings: { properties: {} },
        logger: logger as any,
      })
    ).rejects.toThrow('mapping conflict');
    expect(esClient.indices.putSettings).not.toHaveBeenCalled();
  });

  it('rethrows if putSettings fails', async () => {
    const esClient = createEsClientMock();
    esClient.indices.exists.mockResolvedValue(true);
    esClient.indices.putMapping.mockResolvedValue({});
    esClient.indices.putSettings.mockRejectedValue(new Error('settings error'));
    const logger = createLoggerMock();

    await expect(
      createOrUpdateIndex({
        esClient: esClient as any,
        indexName: '.test-index',
        mappings: { properties: {} },
        logger: logger as any,
      })
    ).rejects.toThrow('settings error');
  });

  it('rethrows errors from index existence check', async () => {
    const esClient = createEsClientMock();
    esClient.indices.exists.mockRejectedValue(new Error('network error'));
    const logger = createLoggerMock();

    await expect(
      createOrUpdateIndex({
        esClient: esClient as any,
        indexName: '.test-index',
        mappings: { properties: {} },
        logger: logger as any,
      })
    ).rejects.toThrow('network error');
  });
});
