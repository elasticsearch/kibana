/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { Streams } from '@kbn/streams-schema';
import type { LockManagerService } from '@kbn/lock-manager';
import type { KnowledgeIndicatorClientContract } from '@kbn/significant-events-schema';
import type { StreamsClient } from '../client';
import type { StreamsStorageClient } from '../storage/streams_storage_client';
import type { AttachmentClient } from '../attachments/attachment_client';

interface StreamUpsertChange {
  type: 'upsert';
  definition: Streams.all.Definition;
}

interface StreamDeleteChange {
  name: string;
  type: 'delete';
}

export type StreamChange = StreamUpsertChange | StreamDeleteChange;

export interface StateDependencies {
  logger: Logger;
  lockManager: LockManagerService;
  streamsClient: StreamsClient;
  storageClient: StreamsStorageClient;
  esClient: ElasticsearchClient;
  attachmentClient: AttachmentClient;
  getKnowledgeIndicatorClient?: () => Promise<KnowledgeIndicatorClientContract>;
  isServerless: boolean;
  isSecurityEnabled: boolean;
  isWiredStreamViewsEnabled: boolean;
  isDev: boolean;
  deferRootDataStreamMaterialization?: boolean;
}
