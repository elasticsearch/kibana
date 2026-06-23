/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * @deprecated Queries generation is now handled via the onboarding workflow (streams_ki/onboarding.yaml).
 * This task definition is kept for reference and will be removed in a follow-up.
 */

import type { TaskDefinitionRegistry } from '@kbn/task-manager-plugin/server';
import type { SignificantEventsQueriesGenerationResult } from '@kbn/streams-schema';
import { getDeleteTaskRunResult } from '@kbn/task-manager-plugin/server/task';
import { parseError } from '../../streams/errors/parse_error';
import type { TaskContext } from '../../tasks/task_definitions';
import type { TaskParams } from '../../tasks/types';
import { cancellableTask } from '../../tasks/cancellable_task';
import { isDefinitionNotFoundError } from '../../streams/errors/definition_not_found_error';
import { generateKIQueries } from '../ki_queries_generation_service';

export interface SignificantEventsQueriesGenerationTaskParams {
  start: number;
  end: number;
  sampleDocsSize?: number;
  streamName: string;
  connectorId?: string;
}

export const SIGNIFICANT_EVENTS_QUERIES_GENERATION_TASK_TYPE =
  'streams_significant_events_queries_generation';

export function getSignificantEventsQueriesGenerationTaskId(streamName: string) {
  return `${SIGNIFICANT_EVENTS_QUERIES_GENERATION_TASK_TYPE}_${streamName}`;
}

export function createStreamsSignificantEventsQueriesGenerationTask(taskContext: TaskContext) {
  return {
    [SIGNIFICANT_EVENTS_QUERIES_GENERATION_TASK_TYPE]: {
      createTaskRunner: (runContext) => {
        return {
          run: cancellableTask(
            async () => {
              if (!runContext.fakeRequest) {
                throw new Error('Request is required to run this task');
              }
              const { fakeRequest } = runContext;

              const {
                start,
                end,
                sampleDocsSize,
                streamName,
                connectorId: connectorIdOverride,
                _task,
              } = runContext.taskInstance
                .params as TaskParams<SignificantEventsQueriesGenerationTaskParams>;

              const {
                taskClient,
                streamsClient,
                inferenceClient,
                soClient,
                getKnowledgeIndicatorClient,
                scopedClusterClient,
              } = await taskContext.getScopedClients({
                request: fakeRequest,
              });

              const taskLogger = taskContext.logger.get('significant_events_queries_generation');

              try {
                const kiClient = await getKnowledgeIndicatorClient();

                const result = await generateKIQueries(
                  { streamName, connectorId: connectorIdOverride },
                  {
                    streamsClient,
                    inferenceClient,
                    soClient,
                    kiClient,
                    esClient: scopedClusterClient.asCurrentUser,
                    featureFlags: taskContext.server.core.featureFlags,
                    searchInferenceEndpoints: taskContext.server.searchInferenceEndpoints,
                    request: fakeRequest,
                    logger: taskLogger,
                    signal: runContext.abortController.signal,
                    telemetry: taskContext.telemetry,
                    agentBuilderTools: taskContext.server.agentBuilder?.tools,
                  }
                );

                await taskClient.complete<
                  SignificantEventsQueriesGenerationTaskParams,
                  SignificantEventsQueriesGenerationResult
                >(
                  _task,
                  { start, end, sampleDocsSize, streamName, connectorId: connectorIdOverride },
                  { queries: result.queries, tokensUsed: result.tokensUsed }
                );
              } catch (error) {
                if (isDefinitionNotFoundError(error)) {
                  taskContext.logger.debug(
                    `Stream ${streamName} was deleted before significant events queries generation task started, skipping`
                  );
                  return getDeleteTaskRunResult();
                }

                const errorMessage = parseError(error).message;

                if (
                  errorMessage.includes('ERR_CANCELED') ||
                  errorMessage.includes('Request was aborted')
                ) {
                  return getDeleteTaskRunResult();
                }

                taskContext.logger.error(
                  `Task ${runContext.taskInstance.id} failed: ${errorMessage}`
                );

                await taskClient.fail<SignificantEventsQueriesGenerationTaskParams>(
                  _task,
                  {
                    start,
                    end,
                    sampleDocsSize,
                    streamName,
                    connectorId: connectorIdOverride,
                  },
                  errorMessage
                );

                return getDeleteTaskRunResult();
              }
            },
            runContext,
            taskContext
          ),
        };
      },
    },
  } satisfies TaskDefinitionRegistry;
}
