/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import type { EsClient } from '@kbn/scout';

// Creates a data stream and the index template it needs, both named `name`.
export const createDataStream = async (esClient: EsClient, name: string, indexMode?: string) => {
  await esClient.indices.putIndexTemplate({
    name,
    index_patterns: [`${name}*`],
    template: {
      mappings: { properties: { '@timestamp': { type: 'date' } } },
      // Pin replicas to 0 so the single backing shard is always allocated (green) regardless of node count.
      settings: { index: { mode: indexMode, number_of_replicas: 0 } },
      lifecycle: { enabled: true },
    },
    data_stream: {},
  });

  await esClient.indices.createDataStream({ name });
};

export const updateIndexTemplateMappings = async (
  esClient: EsClient,
  name: string,
  mappings: MappingTypeMapping
) => {
  await esClient.indices.putIndexTemplate({
    name,
    index_patterns: [`${name}*`],
    template: { mappings },
    data_stream: {},
  });
};

export const getDataStream = async (esClient: EsClient, name: string) => {
  const {
    data_streams: [dataStream],
  } = await esClient.indices.getDataStream({ name });
  return dataStream;
};

export const getDataStreamMappings = async (esClient: EsClient, name: string) => {
  const mappings = await esClient.indices.getMapping({ index: name });
  return Object.values(mappings)[0].mappings;
};

// Storage size is not deterministic, so it is described instead of compared.
export const describeStorage = (storageSize: unknown, storageSizeBytes: unknown) => ({
  storageSize: `${typeof storageSize}${storageSize ? ' (populated)' : ''}`,
  storageSizeBytes: `${typeof storageSizeBytes}${storageSizeBytes ? ' (populated)' : ''}`,
});

// Values Elasticsearch decides (backing index name, uuid) are echoed back, not asserted.
export const expectedDataStream = ({
  name,
  indexName,
  uuid,
  health,
  lifecycle,
  indexMode = 'standard',
}: {
  name: string;
  indexName: string;
  uuid: string;
  health: string;
  lifecycle: object;
  indexMode?: string;
}) => ({
  name,
  lifecycle,
  privileges: {
    delete_index: true,
    manage_data_stream_lifecycle: true,
    read_failure_store: true,
    manage: true,
  },
  timeStampField: { name: '@timestamp' },
  indices: [
    { name: indexName, uuid, preferILM: true, managedBy: 'Data stream lifecycle', indexMode },
  ],
  nextGenerationManagedBy: 'Data stream lifecycle',
  generation: 1,
  health,
  indexTemplateName: name,
  hidden: false,
  failureStoreEnabled: false,
  matchesFailureStoreClusterPattern: false,
  failureStoreRetention: { defaultRetentionPeriod: '30d', retentionDisabled: false },
  indexMode,
});

// The delete route only removes the data stream, so the template goes separately.
export const deleteDataStream = async (esClient: EsClient, name: string) => {
  await esClient.indices.deleteDataStream({ name }, { ignore: [404] });
  await esClient.indices.deleteIndexTemplate({ name }, { ignore: [404] });
};
