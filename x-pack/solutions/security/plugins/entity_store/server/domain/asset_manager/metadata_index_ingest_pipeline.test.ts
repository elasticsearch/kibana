/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';

import {
  getMetadataIndexIngestPipelineId,
  getMetadataIndexIngestPipelineBody,
  installMetadataIndexIngestPipeline,
} from './metadata_index_ingest_pipeline';

describe('metadata index ingest pipeline', () => {
  const namespace = 'default';
  let logger: Logger;

  beforeEach(() => {
    logger = loggerMock.create();
  });

  describe('getMetadataIndexIngestPipelineId', () => {
    it('returns a namespace-scoped pipeline id', () => {
      const id = getMetadataIndexIngestPipelineId(namespace);
      expect(typeof id).toBe('string');
      expect(id).toContain('metadata');
      expect(id).toContain(namespace);
    });
  });

  describe('getMetadataIndexIngestPipelineBody', () => {
    const body = getMetadataIndexIngestPipelineBody(namespace);

    it('uses the metadata ingest pipeline id', () => {
      expect(body.id).toBe(getMetadataIndexIngestPipelineId(namespace));
    });

    it('includes a `set` processor that copies _ingest.timestamp into event.ingested', () => {
      const setProcessor = body.processors?.find((p) => p?.set?.field === 'event.ingested');
      expect(setProcessor).toBeDefined();
      expect(setProcessor?.set?.value).toBe('{{_ingest.timestamp}}');
    });

    it('does NOT include a `dot_expander` processor (callers send pre-nested JSON)', () => {
      const dotExpander = body.processors?.find((p) => p?.dot_expander !== undefined);
      expect(dotExpander).toBeUndefined();
    });
  });

  describe('installMetadataIndexIngestPipeline', () => {
    it('puts the pipeline through esClient.ingest.putPipeline with the expected id', async () => {
      const putPipeline = jest.fn().mockResolvedValue(undefined);
      const esClient = {
        ingest: { putPipeline },
      } as unknown as ElasticsearchClient;

      await installMetadataIndexIngestPipeline(esClient, namespace, logger);

      expect(putPipeline).toHaveBeenCalledTimes(1);
      const arg = putPipeline.mock.calls[0][0] as { id: string };
      expect(arg.id).toBe(getMetadataIndexIngestPipelineId(namespace));
    });
  });
});
