/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core/server/mocks';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import type { IUiSettingsClient } from '@kbn/core/server';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import type { ToolHandlerContext } from '@kbn/agent-builder-server/tools/handler';
import { agentBuilderMocks } from '@kbn/agent-builder-plugin/server/mocks';
import { TaskStatus } from '@kbn/streams-schema';
import type { ZodObject } from '@kbn/zod/v4';
import type { z } from '@kbn/zod/v4';
import type { StreamsClient } from '../../lib/streams/client';
import type { KnowledgeIndicatorClient } from '../../lib/streams/ki';
import type { AttachmentClient } from '../../lib/streams/attachments/attachment_client';
import type { RouteHandlerScopedClients, GetScopedClients } from '../../routes/types';
import type { TaskClient } from '../../lib/tasks/task_client';
import type { StreamsTaskType } from '../../lib/tasks/task_definitions';

/**
 * Subset of RouteHandlerScopedClients that tools actually use.
 * Using Pick ensures property names and types stay in sync with the
 * real interface — renames or type changes cause a compile error here.
 */
type ToolScopedClients = Pick<
  RouteHandlerScopedClients,
  | 'streamsClient'
  | 'scopedClusterClient'
  | 'getKnowledgeIndicatorClient'
  | 'uiSettingsClient'
  | 'attachmentClient'
  | 'taskClient'
  | 'uiSettingsClient'
>;

/**
 * Sets a mock resolved value using only the fields the handler actually reads.
 * Use for deeply nested ES response types (IndicesGetDataStreamResponse,
 * IndicesStatsResponse, etc.) where providing every required field is impractical.
 * This is the sole containment point for the partial-mock pattern in these tests;
 * call sites provide correctly-shaped partial data without needing casts.
 */
export function mockEsMethodResolvedValue(
  mock: { mockResolvedValue: Function },
  value: unknown
): void {
  mock.mockResolvedValue(value);
}

export const createMockGetScopedClients = () => {
  const scopedClusterClient = elasticsearchServiceMock.createScopedClusterClient();
  const esClient = scopedClusterClient.asCurrentUser;

  const streamsClient: jest.Mocked<
    Pick<
      StreamsClient,
      | 'getStream'
      | 'listStreamsWithDataStreamExistence'
      | 'getAncestors'
      | 'getDescendants'
      | 'getDataStream'
      | 'upsertStream'
      | 'forkStream'
      | 'deleteStream'
      | 'createQueryStream'
      | 'ensureStream'
    >
  > = {
    getStream: jest.fn(),
    listStreamsWithDataStreamExistence: jest.fn(),
    getAncestors: jest.fn().mockResolvedValue([]),
    getDescendants: jest.fn().mockResolvedValue([]),
    getDataStream: jest.fn(),
    upsertStream: jest.fn().mockResolvedValue({ acknowledged: true, result: 'updated' }),
    forkStream: jest.fn().mockResolvedValue({ acknowledged: true, result: 'created' }),
    deleteStream: jest.fn().mockResolvedValue({ acknowledged: true, result: 'deleted' }),
    createQueryStream: jest.fn().mockResolvedValue({ acknowledged: true, result: 'created' }),
    ensureStream: jest.fn().mockResolvedValue(undefined),
  };

  const uiSettingsClient: jest.Mocked<Pick<IUiSettingsClient, 'get'>> = {
    // Query streams enabled by default; individual tests can override.
    get: jest.fn().mockResolvedValue(true),
  };

  const kiClient: jest.Mocked<Pick<KnowledgeIndicatorClient, 'getStreamToQueryLinksMap'>> = {
    getStreamToQueryLinksMap: jest.fn().mockResolvedValue({}),
  };

  const getKnowledgeIndicatorClient = jest.fn().mockResolvedValue(kiClient);

  const attachmentClient: jest.Mocked<Pick<AttachmentClient, 'getAttachments'>> = {
    getAttachments: jest.fn().mockResolvedValue([]),
  };

  const taskClient: jest.Mocked<
    Pick<TaskClient<StreamsTaskType>, 'schedule' | 'getStatus' | 'cancel'>
  > = {
    schedule: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn().mockResolvedValue({ status: TaskStatus.NotStarted }),
    cancel: jest.fn().mockResolvedValue(undefined),
  };

  // Satisfies ensures property names stay in sync with RouteHandlerScopedClients.
  // If a property is renamed or removed from the interface, this will fail.
  const scopedClients: {
    [K in keyof ToolScopedClients]: unknown;
  } = {
    streamsClient,
    scopedClusterClient,
    getKnowledgeIndicatorClient,
    uiSettingsClient,
    attachmentClient,
    taskClient,
  };

  const getScopedClients = jest
    .fn()
    .mockResolvedValue(scopedClients) as jest.MockedFunction<GetScopedClients>;

  return {
    getScopedClients,
    streamsClient,
    esClient,
    scopedClusterClient,
    getKnowledgeIndicatorClient,
    attachmentClient,
    taskClient,
    uiSettingsClient,
  };
};

export const createMockRequest = () => httpServerMock.createKibanaRequest();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const invokeHandler = async <TSchema extends ZodObject<any>>(
  tool: BuiltinToolDefinition<TSchema>,
  input: z.infer<TSchema>,
  context: ToolHandlerContext
) => {
  return tool.handler(input, context);
};

export const createMockToolContext = (): ToolHandlerContext => {
  const inferenceClient = {
    chatComplete: jest.fn(),
    output: jest.fn(),
  };

  const modelProvider = agentBuilderMocks.createModelProvider();
  modelProvider.getDefaultModel.mockResolvedValue({ inferenceClient } as never);
  const toolHandlerContext = agentBuilderMocks.tools.createHandlerContext();

  toolHandlerContext.modelProvider = modelProvider;
  return toolHandlerContext;
};
