/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import type { ElasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { reconcileSmlIndex, smlIndexName } from './sml_storage';

const TEMPLATE_VERSION = 3;
const TEMPLATE_PROPERTIES = { id: { type: 'keyword' } } as const;

const responseError = (statusCode: number, type: string) =>
  new errors.ResponseError({
    statusCode,
    body: { error: { type } },
    headers: {},
    warnings: null,
    meta: {} as never,
  });

const createDeps = () => {
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  const logger = loggerMock.create();

  esClient.indices.getIndexTemplate.mockResolvedValue({
    index_templates: [
      {
        name: 'ai-index-idx-managed',
        index_template: {
          index_patterns: ['.ai-index-idx-*'],
          composed_of: ['ai-index@mappings', 'ai-index-managed@mappings'],
          version: TEMPLATE_VERSION,
        },
      },
    ],
  });
  esClient.indices.simulateIndexTemplate.mockResolvedValue({
    template: {
      aliases: {},
      settings: {},
      mappings: { dynamic: 'strict', properties: TEMPLATE_PROPERTIES },
    },
  });

  return { esClient, logger };
};

/** Make the live index report which template version its mappings were built from. */
const mockAppliedVersion = (esClient: ElasticsearchClientMock, version?: number) => {
  esClient.indices.exists.mockResolvedValue(true);
  esClient.indices.getMapping.mockResolvedValue({
    [smlIndexName]: {
      mappings: version === undefined ? {} : { _meta: { ai_index_template_version: version } },
    },
  });
};

describe('smlIndexName', () => {
  it('is the dot-prefixed AI index the Elasticsearch template pattern matches', () => {
    expect(smlIndexName).toBe('.ai-index-idx-elastic-index');
  });
});

describe('reconcileSmlIndex', () => {
  it('creates the index bare so the Elasticsearch template supplies the mappings', async () => {
    const { esClient, logger } = createDeps();
    esClient.indices.exists.mockResolvedValue(false);

    await reconcileSmlIndex({ esClient, logger });

    expect(esClient.indices.create).toHaveBeenCalledWith({ index: smlIndexName });
    // Kibana contributes no mappings of its own — only the template version marker.
    expect(esClient.indices.putMapping).toHaveBeenCalledWith({
      index: smlIndexName,
      _meta: { ai_index_template_version: TEMPLATE_VERSION },
    });
  });

  it('tolerates another Kibana node creating the index concurrently', async () => {
    const { esClient, logger } = createDeps();
    esClient.indices.exists.mockResolvedValue(false);
    esClient.indices.create.mockRejectedValue(
      responseError(400, 'resource_already_exists_exception')
    );

    await reconcileSmlIndex({ esClient, logger });

    expect(esClient.indices.putMapping).toHaveBeenCalled();
  });

  it('is a no-op when the live mappings already carry the current template version', async () => {
    const { esClient, logger } = createDeps();
    mockAppliedVersion(esClient, TEMPLATE_VERSION);

    await reconcileSmlIndex({ esClient, logger });

    expect(esClient.indices.putMapping).not.toHaveBeenCalled();
    expect(esClient.indices.create).not.toHaveBeenCalled();
  });

  it('pushes the template mappings onto the live index after a version bump', async () => {
    const { esClient, logger } = createDeps();
    mockAppliedVersion(esClient, TEMPLATE_VERSION - 1);

    await reconcileSmlIndex({ esClient, logger });

    expect(esClient.indices.putMapping).toHaveBeenCalledWith({
      index: smlIndexName,
      dynamic: 'strict',
      properties: TEMPLATE_PROPERTIES,
      _meta: { ai_index_template_version: TEMPLATE_VERSION },
    });
  });

  it('treats an unstamped index as stale and reconciles it', async () => {
    const { esClient, logger } = createDeps();
    mockAppliedVersion(esClient, undefined);

    await reconcileSmlIndex({ esClient, logger });

    expect(esClient.indices.putMapping).toHaveBeenCalled();
  });

  it('leaves the index intact when the mapping update is rejected', async () => {
    const { esClient, logger } = createDeps();
    mockAppliedVersion(esClient, TEMPLATE_VERSION - 1);
    esClient.indices.putMapping.mockRejectedValueOnce(
      responseError(400, 'illegal_argument_exception')
    );

    await reconcileSmlIndex({ esClient, logger });

    // Dropping the index would take user-curated `ingestion_method: 'manual'` entries with it.
    expect(esClient.indices.delete).not.toHaveBeenCalled();
    expect(esClient.indices.deleteIndexTemplate).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('could not apply template version')
    );
  });

  it('propagates a non-Elasticsearch error instead of swallowing it', async () => {
    const { esClient, logger } = createDeps();
    mockAppliedVersion(esClient, TEMPLATE_VERSION - 1);
    esClient.indices.putMapping.mockRejectedValueOnce(new Error('connection refused'));

    await expect(reconcileSmlIndex({ esClient, logger })).rejects.toThrow('connection refused');
  });
});
