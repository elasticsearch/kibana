/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { actionsMock } from '@kbn/actions-plugin/server/mocks';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
// Use a TS import type via a type alias to avoid parser issues with `import type` in some jest transforms
type PostAttackDiscoveryGenerateRequestBody =
  import('@kbn/elastic-assistant-common').PostAttackDiscoveryGenerateRequestBody;
import { OpenAiProviderType } from '@kbn/connector-schemas/openai/constants';

import { performChecks } from '../../../helpers';
import { hasReadWriteAttackDiscoveryAlertsPrivileges } from '../../helpers/index_privileges';
import { requestIsValid } from './helpers/request_is_valid';
import type { AttackDiscoveryDataClient } from '../../../../lib/attack_discovery/persistence';
import { postAttackDiscoveryRequest } from '../../../../__mocks__/request';
import { serverMock } from '../../../../__mocks__/server';
import { requestContextMock } from '../../../../__mocks__/request_context';
import { postAttackDiscoveryGenerateRoute } from './post_attack_discovery_generate';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'static-uuid'),
}));

jest.mock('../../helpers/index_privileges', () => {
  const privilegesOriginal = jest.requireActual('../../helpers/index_privileges');
  return {
    ...privilegesOriginal,
    hasReadWriteAttackDiscoveryAlertsPrivileges: jest.fn(),
  };
});

jest.mock('../../../helpers', () => {
  const helpersModuleOriginal = jest.requireActual('../../../helpers');
  return {
    ...helpersModuleOriginal,
    performChecks: jest.fn(),
  };
});

jest.mock('./helpers/request_is_valid', () => ({
  requestIsValid: jest.fn(),
}));

jest.mock('../../helpers/generate_and_update_discoveries', () => ({
  generateAndUpdateAttackDiscoveries: jest.fn(),
}));

const { clients, context } = requestContextMock.createTools();
const server: ReturnType<typeof serverMock.create> = serverMock.create();
clients.core.elasticsearch.client = elasticsearchServiceMock.createScopedClusterClient();

const mockUser = {
  username: 'elastic',
  authentication_realm: {
    type: 'my_realm_type',
    name: 'my_realm_name',
  },
  lookup_realm: {
    type: 'my_lookup_type',
    name: 'my_lookup_name',
  },
  authentication_provider: { type: 'basic', name: 'basic1' },
  authentication_type: 'realm',
  elastic_cloud_user: false,
  enabled: true,
  roles: ['superuser'],
  full_name: 'Test User',
  email: 'test@example.com',
  http_authentication_scheme: null,
};

const mockApiConfig = {
  connectorId: 'connector-id',
  actionTypeId: '.bedrock',
  model: 'model',
  provider: OpenAiProviderType.OpenAi,
};

const mockDataClient = {
  updateAttackDiscovery: jest.fn(),
  createAttackDiscovery: jest.fn(),
  getAttackDiscovery: jest.fn(),
  refreshEventLogIndex: jest.fn(),
} as unknown as AttackDiscoveryDataClient;

const mockRequestBody: PostAttackDiscoveryGenerateRequestBody = {
  subAction: 'invokeAI',
  apiConfig: mockApiConfig,
  alertsIndexPattern: 'alerts-*',
  anonymizationFields: [],
  replacements: {},
  model: 'gpt-4',
  size: 20,
  langSmithProject: 'langSmithProject',
  langSmithApiKey: 'langSmithApiKey',
};

describe('postAttackDiscoveryGenerateRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    context.elasticAssistant.getCurrentUser.mockResolvedValue(mockUser);
    context.elasticAssistant.getAttackDiscoveryDataClient.mockResolvedValue(mockDataClient);
    context.elasticAssistant.actions = actionsMock.createStart();
    (context.elasticAssistant.inference.getConnectorById as jest.Mock).mockResolvedValue({
      type: mockApiConfig.actionTypeId,
      connectorId: mockApiConfig.connectorId,
      name: 'test connector',
      config: {},
      capabilities: {},
      isInferenceEndpoint: false,
      isPreconfigured: false,
    });
    context.core.featureFlags.getBooleanValue = jest.fn().mockResolvedValue(false);
    postAttackDiscoveryGenerateRoute(server.router);

    // Mock successful defaults
    (performChecks as jest.Mock).mockResolvedValue({ isSuccess: true });
    (requestIsValid as jest.Mock).mockReturnValue(true);
    (hasReadWriteAttackDiscoveryAlertsPrivileges as jest.Mock).mockResolvedValue({
      isSuccess: true,
    });

    // Mock generateAndUpdateAttackDiscoveries to resolve successfully
    const { generateAndUpdateAttackDiscoveries } = jest.requireMock(
      '../../helpers/generate_and_update_discoveries'
    );
    generateAndUpdateAttackDiscoveries.mockResolvedValue({
      anonymizedAlerts: [],
      attackDiscoveries: [],
      replacements: {},
    });

    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('privilege validation', () => {
    it('returns a 403 status when the privilege check returns forbidden', async () => {
      context.core.featureFlags.getBooleanValue = jest.fn().mockResolvedValue(true);
      (hasReadWriteAttackDiscoveryAlertsPrivileges as jest.Mock).mockImplementation(
        ({ response }) => {
          return Promise.resolve({
            isSuccess: false,
            response: response.forbidden({ body: { message: 'forbidden' } }),
          });
        }
      );
      const response = await server.inject(
        postAttackDiscoveryRequest(mockRequestBody),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(403);
    });

    it('returns a 403 status when the user has missing privileges', async () => {
      (hasReadWriteAttackDiscoveryAlertsPrivileges as jest.Mock).mockImplementation(
        ({ response }) => {
          return Promise.resolve({
            isSuccess: false,
            response: response.forbidden({ body: { message: 'no privileges' } }),
          });
        }
      );

      const response = await server.inject(
        postAttackDiscoveryRequest(mockRequestBody),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(403);
    });

    it('returns the correct error message when the user has missing privileges', async () => {
      (hasReadWriteAttackDiscoveryAlertsPrivileges as jest.Mock).mockImplementation(
        ({ response }) => {
          return Promise.resolve({
            isSuccess: false,
            response: response.forbidden({ body: { message: 'no privileges' } }),
          });
        }
      );

      const response = await server.inject(
        postAttackDiscoveryRequest(mockRequestBody),
        requestContextMock.convertContext(context)
      );

      expect(response.body).toEqual({ message: 'no privileges' });
    });
  });

  describe('request validation', () => {
    it('returns a 400 status when request body is missing required fields', async () => {
      (requestIsValid as jest.Mock).mockReturnValue(false);
      const invalidBody: PostAttackDiscoveryGenerateRequestBody = {
        ...mockRequestBody,
        alertsIndexPattern: '',
      };

      const response = await server.inject(
        postAttackDiscoveryRequest(invalidBody),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(400);
    });
  });

  describe('authentication', () => {
    it('returns a 401 status when authenticated user is missing', async () => {
      context.elasticAssistant.getCurrentUser.mockResolvedValueOnce(null);
      const response = await server.inject(
        postAttackDiscoveryRequest(mockRequestBody),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(401);
    });

    it('returns correct error message when authenticated user is missing', async () => {
      context.elasticAssistant.getCurrentUser.mockResolvedValueOnce(null);
      const response = await server.inject(
        postAttackDiscoveryRequest(mockRequestBody),
        requestContextMock.convertContext(context)
      );

      expect(response.body).toEqual({
        message: 'Authenticated user not found',
        status_code: 401,
      });
    });
  });

  describe('data client validation', () => {
    it('returns a 500 status when data client is missing', async () => {
      context.elasticAssistant.getAttackDiscoveryDataClient.mockResolvedValue(null);
      const response = await server.inject(
        postAttackDiscoveryRequest(mockRequestBody),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(500);
    });

    it('returns correct error message when data client is missing', async () => {
      context.elasticAssistant.getAttackDiscoveryDataClient.mockResolvedValue(null);
      const response = await server.inject(
        postAttackDiscoveryRequest(mockRequestBody),
        requestContextMock.convertContext(context)
      );

      expect(response.body).toEqual({
        message: 'Attack discovery data client not initialized',
        status_code: 500,
      });
    });
  });

  describe('successful requests', () => {
    it('returns a 200 status for a successful request', async () => {
      const response = await server.inject(
        postAttackDiscoveryRequest(mockRequestBody),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(200);
    });

    it('returns an execution_uuid in response body for successful request', async () => {
      const response = await server.inject(
        postAttackDiscoveryRequest(mockRequestBody),
        requestContextMock.convertContext(context)
      );

      expect(response.body).toEqual({
        execution_uuid: 'static-uuid',
      });
    });

    it('always calls generateAndUpdateAttackDiscoveries with withReplacements: false for the _generate route', async () => {
      const { generateAndUpdateAttackDiscoveries } = jest.requireMock(
        '../../helpers/generate_and_update_discoveries'
      );

      // Make sure the mock is cleared
      generateAndUpdateAttackDiscoveries.mockClear();

      await server.inject(
        postAttackDiscoveryRequest(mockRequestBody),
        requestContextMock.convertContext(context)
      );

      // The function should be called with withReplacements: false
      expect(generateAndUpdateAttackDiscoveries).toHaveBeenCalledWith(
        expect.objectContaining({
          withReplacements: false,
        })
      );
    });

    it('always calls generateAndUpdateAttackDiscoveries with enableFieldRendering: true for the _generate route', async () => {
      const { generateAndUpdateAttackDiscoveries } = jest.requireMock(
        '../../helpers/generate_and_update_discoveries'
      );

      // Make sure the mock is cleared
      generateAndUpdateAttackDiscoveries.mockClear();

      await server.inject(
        postAttackDiscoveryRequest(mockRequestBody),
        requestContextMock.convertContext(context)
      );

      // The function should be called with enableFieldRendering: true
      expect(generateAndUpdateAttackDiscoveries).toHaveBeenCalledWith(
        expect.objectContaining({
          enableFieldRendering: true,
        })
      );
    });

    it('returns a 200 status', async () => {
      const response = await server.inject(
        postAttackDiscoveryRequest(mockRequestBody),
        requestContextMock.convertContext(context)
      );

      expect(response.status).toEqual(200);
    });

    it('returns an execution_uuid', async () => {
      const response = await server.inject(
        postAttackDiscoveryRequest(mockRequestBody),
        requestContextMock.convertContext(context)
      );

      expect(response.body).toEqual({
        execution_uuid: 'static-uuid',
      });
    });
  });
});
