/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  IndicesDataStream,
  IndicesDataStreamsStatsDataStreamsStatsItem,
} from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core/server';
import { processAsyncInChunks } from '../utils/process_async_in_chunks';

class DataStreamService {
  public async getMatchingDataStreams(
    esClient: ElasticsearchClient,
    datasetName: string | string[]
  ): Promise<IndicesDataStream[]> {
    try {
      const { data_streams: dataStreamsInfo } = await esClient.indices.getDataStream({
        name: datasetName,
        verbose: true,
      });

      return dataStreamsInfo;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 403) {
        return [];
      }
      throw e;
    }
  }

  public async getStreamsStats(
    esClient: ElasticsearchClient,
    dataStreams: string[]
  ): Promise<IndicesDataStreamsStatsDataStreamsStatsItem[]> {
    try {
      const { data_streams: dataStreamsStats } = await processAsyncInChunks(
        dataStreams,
        (dataStreamsChunk) =>
          esClient.indices.dataStreamsStats({ name: dataStreamsChunk.join(','), human: true })
      );

      return dataStreamsStats;
    } catch (e) {
      if (e.statusCode === 404) {
        return [];
      }
      throw e;
    }
  }

  public async getDataStreamIndexSettings(
    esClient: ElasticsearchClient,
    dataStream: string
  ): Promise<Awaited<ReturnType<ElasticsearchClient['indices']['getSettings']>>> {
    try {
      const settings = await esClient.indices.getSettings({
        index: dataStream,
      });

      return settings;
    } catch (e) {
      if (e.statusCode === 404) {
        return {};
      }
      throw e;
    }
  }
}

export const dataStreamService = new DataStreamService();
