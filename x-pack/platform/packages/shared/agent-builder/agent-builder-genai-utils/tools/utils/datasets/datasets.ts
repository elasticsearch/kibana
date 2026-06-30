/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { MappingField } from '../mappings';
import { executeEsql } from '../esql';

/**
 * An external ES|QL dataset, registered via the `_query/dataset` API. Datasets are only
 * queryable through ES|QL (`FROM <name>`) and are invisible to the `_resolve/index`,
 * `_field_caps` and `_mapping` APIs.
 */
export interface DatasetInfo {
  name: string;
  data_source: string;
  resource: string;
}

interface QueryDatasetResponse {
  datasets?: DatasetInfo[];
}

/**
 * Lists the external ES|QL datasets registered in the cluster via the `_query/dataset` API.
 *
 * There is no typed Elasticsearch client method for this endpoint, so we use a raw transport
 * request. The call is best-effort: clusters/licenses that don't support datasets return an
 * error which we swallow, yielding an empty list so dataset support degrades gracefully.
 */
export const listDatasets = async ({
  esClient,
}: {
  esClient: ElasticsearchClient;
}): Promise<DatasetInfo[]> => {
  try {
    const response = await esClient.transport.request<QueryDatasetResponse>({
      method: 'GET',
      path: '/_query/dataset',
    });
    return response.datasets ?? [];
  } catch (e) {
    return [];
  }
};

/**
 * Resolves the field list of an external ES|QL dataset by introspecting its columns.
 *
 * Datasets have no mappings or field caps, so we run `FROM <name> | LIMIT 0` and map the
 * returned column metadata (name + ES|QL type) to {@link MappingField}.
 */
export const getDatasetFields = async ({
  name,
  esClient,
}: {
  name: string;
  esClient: ElasticsearchClient;
}): Promise<MappingField[]> => {
  const { columns } = await executeEsql({
    query: `FROM ${name} | LIMIT 0`,
    esClient,
  });
  return columns.map((column) => ({
    path: column.name,
    type: column.type,
    meta: {},
  }));
};
