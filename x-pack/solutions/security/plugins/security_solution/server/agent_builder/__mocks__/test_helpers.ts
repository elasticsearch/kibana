/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import { coreMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { uiSettingsServiceMock } from '@kbn/core-ui-settings-server-mocks';
import type { ToolHandlerContext, ToolAvailabilityContext } from '@kbn/agent-builder-server/tools';
import { agentBuilderMocks } from '@kbn/agent-builder-plugin/server/mocks';

/**
 * Creates common mocks for tool tests
 */
export const createToolTestMocks = () => {
  const mockCore = coreMock.createSetup();
  const mockLogger = loggingSystemMock.createLogger();
  const mockEsClient = elasticsearchClientMock.createScopedClusterClient();
  const mockRequest = httpServerMock.createKibanaRequest({
    path: '/s/default/app/security',
  });

  return {
    mockCore,
    mockLogger,
    mockEsClient,
    mockRequest,
  };
};

/**
 * Sets up mock core start services for tools that need it
 */
export const setupMockCoreStartServices = (
  mockCore: ReturnType<typeof coreMock.createSetup>,
  mockEsClient: ReturnType<typeof elasticsearchClientMock.createScopedClusterClient>
) => {
  const mockCoreStart = coreMock.createStart();
  Object.assign(mockCoreStart.elasticsearch.client, {
    asInternalUser: mockEsClient.asInternalUser,
    asCurrentUser: mockEsClient.asCurrentUser,
  });
  mockCore.getStartServices.mockResolvedValue([
    mockCoreStart,
    {
      entityStore: {
        createCRUDClient: jest.fn().mockReturnValue({}),
        createResolutionClient: undefined,
      },
    },
    {},
  ]);
  return mockCoreStart;
};

/**
 * Creates a tool handler context object
 */
export const createToolHandlerContext = (
  mockRequest: ReturnType<typeof httpServerMock.createKibanaRequest>,
  mockEsClient: ReturnType<typeof elasticsearchClientMock.createScopedClusterClient>,
  mockLogger: ReturnType<typeof loggingSystemMock.createLogger>,
  additionalContext: Partial<Omit<ToolHandlerContext, 'request' | 'esClient' | 'logger'>> = {}
): ToolHandlerContext => {
  const baseMock = agentBuilderMocks.tools.createHandlerContext();
  return {
    ...baseMock,
    request: mockRequest,
    esClient: mockEsClient,
    logger: mockLogger,
    spaceId: 'default',
    ...additionalContext,
  };
};

/**
 * Creates a tool availability context object
 */
export const createToolAvailabilityContext = (
  mockRequest: ReturnType<typeof httpServerMock.createKibanaRequest>,
  spaceId: string,
  uiSettings?: ToolAvailabilityContext['uiSettings']
): ToolAvailabilityContext => {
  return {
    request: mockRequest,
    spaceId,
    uiSettings: uiSettings ?? uiSettingsServiceMock.createClient(),
  };
};
