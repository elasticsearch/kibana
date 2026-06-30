/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core/server/mocks';

import { ElasticsearchAssetType } from '../../../types';
import type { EsAssetReference } from '../../../types';

import { verifyEsAssetsExist } from './verify_es_assets';

function makeRef(type: ElasticsearchAssetType, id: string): EsAssetReference {
  return { type, id };
}

function makeLogger() {
  return { warn: jest.fn() };
}

describe('verifyEsAssetsExist', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;

  beforeEach(() => {
    esClient = elasticsearchServiceMock.createElasticsearchClient();
  });

  it('returns empty array when all assets exist', async () => {
    esClient.ingest.getPipeline.mockResolvedValue({ statusCode: 200, body: {} } as any);
    esClient.indices.existsIndexTemplate.mockResolvedValue(true as any);
    esClient.cluster.existsComponentTemplate.mockResolvedValue(true as any);

    const refs: EsAssetReference[] = [
      makeRef(ElasticsearchAssetType.ingestPipeline, 'pipe-1'),
      makeRef(ElasticsearchAssetType.indexTemplate, 'tmpl-1'),
      makeRef(ElasticsearchAssetType.componentTemplate, 'comp-1'),
    ];

    const missing = await verifyEsAssetsExist(esClient, refs, makeLogger());
    expect(missing).toEqual([]);
  });

  it('returns missing refs when assets are absent (404)', async () => {
    esClient.ingest.getPipeline.mockResolvedValue({ statusCode: 404, body: {} } as any);
    esClient.indices.existsIndexTemplate.mockResolvedValue(true as any);

    const refs: EsAssetReference[] = [
      makeRef(ElasticsearchAssetType.ingestPipeline, 'missing-pipe'),
      makeRef(ElasticsearchAssetType.indexTemplate, 'present-tmpl'),
    ];

    const missing = await verifyEsAssetsExist(esClient, refs, makeLogger());
    expect(missing).toEqual([makeRef(ElasticsearchAssetType.ingestPipeline, 'missing-pipe')]);
  });

  it('treats index, esqlView, and knowledgeBase as always present', async () => {
    const refs: EsAssetReference[] = [
      makeRef(ElasticsearchAssetType.index, 'my-index'),
      makeRef(ElasticsearchAssetType.esqlView, 'my-view'),
      makeRef(ElasticsearchAssetType.knowledgeBase, 'my-kb'),
    ];

    const missing = await verifyEsAssetsExist(esClient, refs, makeLogger());
    expect(missing).toEqual([]);
    // No ES calls should be made for these types
    expect(esClient.ingest.getPipeline).not.toHaveBeenCalled();
    expect(esClient.indices.existsIndexTemplate).not.toHaveBeenCalled();
  });

  it('treats unexpected errors as present and warns', async () => {
    const logger = makeLogger();
    esClient.ingest.getPipeline.mockRejectedValue(new Error('network failure'));

    const refs: EsAssetReference[] = [makeRef(ElasticsearchAssetType.ingestPipeline, 'pipe-err')];

    const missing = await verifyEsAssetsExist(esClient, refs, logger);
    expect(missing).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('treating as present')
    );
  });

  it('returns empty array for an empty refs list', async () => {
    const missing = await verifyEsAssetsExist(esClient, [], makeLogger());
    expect(missing).toEqual([]);
  });

  it('checks ilmPolicy and dataStreamIlmPolicy via ilm.getLifecycle', async () => {
    esClient.ilm.getLifecycle.mockResolvedValue({ statusCode: 404, body: {} } as any);

    const refs: EsAssetReference[] = [
      makeRef(ElasticsearchAssetType.ilmPolicy, 'my-ilm'),
      makeRef(ElasticsearchAssetType.dataStreamIlmPolicy, 'ds-ilm'),
    ];

    const missing = await verifyEsAssetsExist(esClient, refs, makeLogger());
    expect(missing).toEqual(refs);
    expect(esClient.ilm.getLifecycle).toHaveBeenCalledTimes(2);
  });

  it('checks mlModel via ml.getTrainedModels', async () => {
    esClient.ml.getTrainedModels.mockResolvedValue({ statusCode: 200, body: {} } as any);

    const refs: EsAssetReference[] = [makeRef(ElasticsearchAssetType.mlModel, 'my-model')];

    const missing = await verifyEsAssetsExist(esClient, refs, makeLogger());
    expect(missing).toEqual([]);
    expect(esClient.ml.getTrainedModels).toHaveBeenCalledWith(
      { model_id: 'my-model' },
      { ignore: [404], meta: true }
    );
  });

  it('checks transform via transform.getTransform', async () => {
    esClient.transform.getTransform.mockResolvedValue({ statusCode: 404, body: {} } as any);

    const refs: EsAssetReference[] = [makeRef(ElasticsearchAssetType.transform, 'my-transform')];

    const missing = await verifyEsAssetsExist(esClient, refs, makeLogger());
    expect(missing).toEqual(refs);
    expect(esClient.transform.getTransform).toHaveBeenCalledWith(
      { transform_id: 'my-transform' },
      { ignore: [404], meta: true }
    );
  });

  it('checks componentTemplate via cluster.existsComponentTemplate', async () => {
    esClient.cluster.existsComponentTemplate.mockResolvedValue(false as any);

    const refs: EsAssetReference[] = [
      makeRef(ElasticsearchAssetType.componentTemplate, 'missing-comp'),
    ];

    const missing = await verifyEsAssetsExist(esClient, refs, makeLogger());
    expect(missing).toEqual(refs);
    expect(esClient.cluster.existsComponentTemplate).toHaveBeenCalledWith({
      name: 'missing-comp',
    });
  });
});
