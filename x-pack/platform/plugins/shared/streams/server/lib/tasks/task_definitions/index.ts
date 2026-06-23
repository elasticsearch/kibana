/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, KibanaRequest, Logger } from '@kbn/core/server';
import type { TaskDefinitionRegistry } from '@kbn/task-manager-plugin/server';
import type { ReadOnlyConversationClient } from '@kbn/agent-builder-server';
import type { GetScopedClients } from '../../../routes/types';
import type { StreamsServer } from '../../../types';
import { createStreamsDescriptionGenerationTask } from './description_generation';
import { createStreamsSignificantEventsQueriesGenerationTask } from '../../sig_events/tasks/significant_events_queries_generation';
import type { EbtTelemetryClient } from '../../telemetry';
import { createStreamsFeaturesIdentificationTask } from './features_identification';
import { createStreamsOnboardingTask } from './onboarding';

export interface TaskContext {
  logger: Logger;
  getScopedClients: GetScopedClients;
  telemetry: EbtTelemetryClient;
  getInternalEsClient: () => ElasticsearchClient;
  getConversationsClient: (
    request: KibanaRequest
  ) => Promise<ReadOnlyConversationClient | undefined>;
  server: StreamsServer;
}

export function createTaskDefinitions(taskContext: TaskContext) {
  return {
    ...createStreamsDescriptionGenerationTask(taskContext),
    ...createStreamsSignificantEventsQueriesGenerationTask(taskContext),
    ...createStreamsFeaturesIdentificationTask(taskContext),
    ...createStreamsOnboardingTask(taskContext),
  } satisfies TaskDefinitionRegistry;
}

export type StreamsTaskType = keyof ReturnType<typeof createTaskDefinitions>;
