/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { EntityType } from '@kbn/entity-store/common';
import type { EntityStoreCRUDClient } from '@kbn/entity-store/server';
import type { HapiReadableStream } from '../../../../../types';

export interface CsvUploadOpts {
  entityStoreClient: EntityStoreCRUDClient;
  esClient: ElasticsearchClient;
  fileStream: HapiReadableStream;
  logger: Logger;
  watchlist: { name: string; id: string };
  namespace: string;
  batchSize?: number;
}

export interface MatchedEntity {
  euid: string;
  type: EntityType;
  currentWatchlists?: string[];
  rowIndex: number;
}

export interface Watchlist {
  name: string;
  id: string;
  index: string;
}
