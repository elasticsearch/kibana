/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS,
  OBSERVABILITY_STREAMS_ENABLE_WIRED_STREAM_VIEWS,
} from '@kbn/management-settings-ids';
import type { KbnClient, EsClient, ApiServicesFixture, ScoutLogger } from '@kbn/scout';

const ROOT_STREAMS = ['logs.ecs', 'logs.otel'];

export const createRootStreamViews = async (esClient: EsClient) => {
  for (const stream of ROOT_STREAMS) {
    await esClient.transport.request({
      method: 'PUT',
      path: `/_query/view/${encodeURIComponent(`$.${stream}`)}`,
      body: { query: `FROM ${stream}` },
    });
  }
};

export const deleteRootStreamViews = async (esClient: EsClient) => {
  for (const stream of ROOT_STREAMS) {
    try {
      await esClient.transport.request({
        method: 'DELETE',
        path: `/_query/view/${encodeURIComponent(`$.${stream}`)}`,
      });
    } catch {
      // View may not exist
    }
  }
};

export const enableQueryStreams = async (kbnClient: KbnClient) => {
  await kbnClient.uiSettings.update({
    [OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS]: true,
  });
  await kbnClient.uiSettings.update({
    [OBSERVABILITY_STREAMS_ENABLE_WIRED_STREAM_VIEWS]: true,
  });
  await kbnClient.uiSettings.waitForEventualCacheRefresh();
};

export const disableQueryStreams = async (kbnClient: KbnClient) => {
  await kbnClient.uiSettings.update({
    [OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS]: false,
  });
  await kbnClient.uiSettings.update({
    [OBSERVABILITY_STREAMS_ENABLE_WIRED_STREAM_VIEWS]: false,
  });
  await kbnClient.uiSettings.waitForEventualCacheRefresh();
};

export const createQueryStream = async (
  esClient: EsClient,
  kbnClient: KbnClient,
  queryStreamName: string,
  esqlViewName: string,
  query: string
) => {
  // Create the ES|QL view via the Elasticsearch REST API
  await esClient.transport.request({
    method: 'PUT',
    path: `/_query/view/${encodeURIComponent(esqlViewName)}`,
    body: { query },
  });

  // Create the query stream definition via the Kibana API so it appears in the streams list
  await kbnClient.request({
    method: 'PUT',
    path: `/api/streams/${queryStreamName}/_query`,
    headers: {
      'kbn-xsrf': 'true',
      'elastic-api-version': '2023-10-31',
    },
    body: { query: { esql: query } },
  });
};

export const deleteQueryStream = async (
  apiServices: ApiServicesFixture,
  esClient: EsClient,
  queryStreamName: string,
  esqlViewName: string,
  log: ScoutLogger
) => {
  try {
    await apiServices.streams.deleteStream(queryStreamName);
  } catch (e) {
    log.warning(`Failed to delete stream "${queryStreamName}": ${(e as Error).message}`);
  }
  try {
    await esClient.transport.request({
      method: 'DELETE',
      path: `/_query/view/${encodeURIComponent(esqlViewName)}`,
    });
  } catch (e) {
    log.warning(`Failed to delete view "${esqlViewName}": ${(e as Error).message}`);
  }
};
