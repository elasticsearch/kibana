/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { DataStreamClient } from '@kbn/data-streams';
import { DetectionClient } from './detection_client';
import { detectionsDataStream, type StoredDetection, type detectionsMappings } from './data_stream';

export class DetectionService {
  getClient({
    esClient,
    space,
  }: {
    esClient: ElasticsearchClient;
    space: string;
  }): DetectionClient {
    const dataStreamClient = DataStreamClient.fromDefinition<
      typeof detectionsMappings,
      StoredDetection
    >({
      dataStream: detectionsDataStream,
      elasticsearchClient: esClient,
    });

    return new DetectionClient({
      dataStreamClient,
      esClient,
      space,
    });
  }
}
