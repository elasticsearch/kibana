/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { DeeplyMockedApi } from '@kbn/core-elasticsearch-client-server-mocks';
import { createEventLogService } from '../services/event_log_service/event_log_service.mock';
import { ExecutionHistoryClient } from './execution_history_client';

export function createExecutionHistoryClient(): {
  executionHistoryClient: ExecutionHistoryClient;
  mockEsClient: DeeplyMockedApi<ElasticsearchClient>;
} {
  const { eventLogService, mockEsClient } = createEventLogService();

  const executionHistoryClient = new ExecutionHistoryClient(eventLogService, 'default');

  return {
    executionHistoryClient,
    mockEsClient,
  };
}
