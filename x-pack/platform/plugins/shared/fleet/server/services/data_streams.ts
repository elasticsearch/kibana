/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IndicesDataStream, IndicesIndexTemplate } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core/server';

const DATA_STREAM_INDEX_PATTERN =
  'logs-*-*,metrics-*-*,traces-*-*,synthetics-*-*,profiling-*,profiles-*';

export interface MeteringStatsResponse {
  datastreams: MeteringStats[];
}
export interface MeteringStats {
  name: string;
  num_docs: number;
  size_in_bytes: number;
}

export interface DataStreamNamesResponse {
  data_streams: Array<{
    name: string;
  }>;
}

class DataStreamService {
  public async getAllFleetDataStreams(esClient: ElasticsearchClient) {
    const { data_streams: dataStreamsInfo } = await esClient.indices.getDataStream({
      name: DATA_STREAM_INDEX_PATTERN,
    });

    return dataStreamsInfo;
  }

  public async getAllFleetMeteringStats(esClient: ElasticsearchClient) {
    const res = await esClient.transport.request<MeteringStatsResponse>({
      path: `/_metering/stats`,
      method: 'GET',
      querystring: {
        human: true,
      },
    });

    return res.datastreams ?? [];
  }

  public async getAllFleetDataStreamNames(esClient: ElasticsearchClient): Promise<string[]> {
    const res = await esClient.transport.request<DataStreamNamesResponse>({
      path: `/_data_stream/${DATA_STREAM_INDEX_PATTERN}`,
      method: 'GET',
      querystring: { filter_path: 'data_streams.name' },
    });
    return (res.data_streams ?? []).map(({ name }) => name);
  }

  public async getAllFleetDataStreamsStats(esClient: ElasticsearchClient) {
    const { data_streams: dataStreamStats } = await esClient.indices.dataStreamsStats({
      name: DATA_STREAM_INDEX_PATTERN,
      human: true,
    });

    return dataStreamStats;
  }

  public streamPartsToIndexPattern({ type, dataset }: { dataset: string; type: string }) {
    return `${type}-${dataset}-*`;
  }

  public async getMatchingDataStreams(
    esClient: ElasticsearchClient,
    dataStreamParts: {
      dataset: string;
      type: string;
    }
  ): Promise<IndicesDataStream[]> {
    try {
      const { data_streams: dataStreamsInfo } = await esClient.indices.getDataStream({
        name: this.streamPartsToIndexPattern(dataStreamParts),
      });

      return dataStreamsInfo;
    } catch (e) {
      if (e.statusCode === 404) {
        return [];
      }
      throw e;
    }
  }

  public async getMatchingIndexTemplate(
    esClient: ElasticsearchClient,
    dataStreamParts: {
      dataset: string;
      type: string;
    }
  ): Promise<IndicesIndexTemplate | null> {
    try {
      const { index_templates: indexTemplates } = await esClient.indices.getIndexTemplate({
        name: `${dataStreamParts.type}-${dataStreamParts.dataset}`,
      });

      return indexTemplates[0]?.index_template;
    } catch (e) {
      if (e.statusCode === 404) {
        return null;
      }
      throw e;
    }
  }
}

export const dataStreamService = new DataStreamService();
