/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { IngestPutPipelineRequest } from '@elastic/elasticsearch/lib/api/types';
import {
  ENTITY_BASE_PREFIX,
  ENTITY_SCHEMA_VERSION_V2,
  ENTITY_METADATA,
} from '../../../common/domain/entity_index';

export const getMetadataIndexIngestPipelineId = (namespace: string): string =>
  `.${ENTITY_BASE_PREFIX}.${ENTITY_SCHEMA_VERSION_V2}.${ENTITY_METADATA}.security_${namespace}_ingest_pipeline`;

export const getMetadataIndexIngestPipelineBody = (
  namespace: string
): IngestPutPipelineRequest => ({
  id: getMetadataIndexIngestPipelineId(namespace),
  description: 'Sets event.ingested from the ingest timestamp for the entity metadata data stream.',
  _meta: {
    managed_by: 'security_context_core_analysis',
    managed: true,
  },
  processors: [
    {
      set: {
        field: 'event.ingested',
        value: '{{_ingest.timestamp}}',
      },
    },
  ],
});

export const installMetadataIndexIngestPipeline = async (
  esClient: ElasticsearchClient,
  namespace: string,
  logger: Logger
): Promise<void> => {
  const pipeline = getMetadataIndexIngestPipelineBody(namespace);
  await esClient.ingest.putPipeline(pipeline);
  logger.debug(`Installed metadata index ingest pipeline: ${pipeline.id}`);
};

export const deleteMetadataIndexIngestPipeline = async (
  esClient: ElasticsearchClient,
  namespace: string,
  logger: Logger
): Promise<void> => {
  const id = getMetadataIndexIngestPipelineId(namespace);
  await esClient.ingest.deletePipeline({ id }, { ignore: [404] });
  logger.debug(`Deleted metadata index ingest pipeline: ${id}`);
};
