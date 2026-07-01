/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import { savedObjectsServiceMock } from '@kbn/core-saved-objects-server-mocks';
import { uiSettingsServiceMock } from '@kbn/core-ui-settings-server-mocks';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { inferenceMock } from '@kbn/inference-plugin/server/mocks';
import { AgentBuilderErrorCode } from '@kbn/agent-builder-common';
import type { SearchInferenceEndpointsPluginStart } from '@kbn/search-inference-endpoints/server';
import { resolveSelectedConnectorId } from '../../../utils/resolve_selected_connector_id';
import {
  createAgentsServiceStartMock,
  createMockedAgentRegistry,
} from '../../../test_utils/agents';
import { resolveServices } from './resolve_services';

jest.mock('../../../utils/resolve_selected_connector_id');

const resolveSelectedConnectorIdMock = resolveSelectedConnectorId as jest.MockedFn<
  typeof resolveSelectedConnectorId
>;

const createDeps = () => {
  const agentRegistry = createMockedAgentRegistry();
  const agentService = createAgentsServiceStartMock();
  agentService.getRegistry.mockResolvedValue(agentRegistry);

  return {
    agentRegistry,
    deps: {
      agentId: 'private-agent',
      connectorId: 'connector-1',
      telemetryMetadata: undefined,
      request: httpServerMock.createKibanaRequest(),
      logger: loggingSystemMock.createLogger(),
      inference: inferenceMock.createStartContract(),
      conversationService: {} as Parameters<typeof resolveServices>[0]['conversationService'],
      agentService,
      uiSettings: uiSettingsServiceMock.createStartContract(),
      savedObjects: savedObjectsServiceMock.createStartContract(),
      searchInferenceEndpoints: {} as SearchInferenceEndpointsPluginStart,
    },
  };
};

describe('resolveServices', () => {
  beforeEach(() => {
    resolveSelectedConnectorIdMock.mockResolvedValue('connector-1');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns a 404 Agent Builder error when the scoped user cannot access the agent', async () => {
    const { agentRegistry, deps } = createDeps();
    agentRegistry.has.mockResolvedValue(false);

    await expect(resolveServices(deps)).rejects.toMatchObject({
      code: AgentBuilderErrorCode.agentNotFound,
      message: 'Agent "private-agent" not found or not available',
      meta: {
        agentId: 'private-agent',
        statusCode: 404,
      },
    });
  });
});
