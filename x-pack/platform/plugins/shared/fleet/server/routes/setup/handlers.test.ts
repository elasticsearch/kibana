/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AwaitedProperties } from '@kbn/utility-types';
import { httpServerMock, savedObjectsClientMock, coreMock } from '@kbn/core/server/mocks';

import type { PostFleetSetupResponse } from '../../../common/types';
import { API_VERSIONS } from '../../../common/constants';
import { RegistryError } from '../../errors';
import {
  createAppContextStartContractMock,
  createPackagePolicyServiceMock,
  createUninstallTokenServiceMock,
  xpackMocks,
} from '../../mocks';
import { agentServiceMock } from '../../services/agents/agent_service.mock';
import { appContextService } from '../../services/app_context';
import { setupFleet } from '../../services/setup';
import type { FleetRequestHandlerContext } from '../../types';
import { hasFleetServers } from '../../services/fleet_server';
import { createFleetAuthzMock } from '../../../common/mocks';
import { withDefaultErrorHandler } from '../../services/security/fleet_router';

import { fleetSetupHandler, getFleetStatusHandler } from './handlers';
import { FleetSetupResponseSchema, GetAgentsSetupResponseSchema } from '.';

const fleetSetupWithErrorHandler = withDefaultErrorHandler(fleetSetupHandler);
const getFleetStatusWithErrorHandler = withDefaultErrorHandler(getFleetStatusHandler);

jest.mock('../../services/setup', () => {
  return {
    ...jest.requireActual('../../services/setup'),
    setupFleet: jest.fn(),
  };
});

jest.mock('../../services/fleet_server');
jest.mock('../../services/secrets', () => ({
  isSecretStorageEnabled: jest.fn().mockResolvedValue(true),
  isSSLSecretStorageEnabled: jest.fn().mockResolvedValue(true),
  isActionSecretStorageEnabled: jest.fn().mockResolvedValue(true),
}));

const mockSetupFleet = setupFleet as jest.MockedFunction<typeof setupFleet>;

describe('FleetSetupHandler', () => {
  let context: AwaitedProperties<
    Omit<FleetRequestHandlerContext, 'resolve' | 'loadPluginContract'>
  >;
  let response: ReturnType<typeof httpServerMock.createResponseFactory>;
  let request: ReturnType<typeof httpServerMock.createKibanaRequest>;

  beforeEach(async () => {
    context = {
      ...xpackMocks.createRequestHandlerContext(),
      fleet: {
        uninstallTokenService: {
          asCurrentUser: createUninstallTokenServiceMock(),
        },
        getAllSpaces: jest.fn(),
        agentClient: {
          asCurrentUser: agentServiceMock.createClient(),
          asInternalUser: agentServiceMock.createClient(),
        },
        authz: createFleetAuthzMock(),
        packagePolicyService: {
          asCurrentUser: createPackagePolicyServiceMock(),
          asInternalUser: createPackagePolicyServiceMock(),
        },
        internalSoClient: savedObjectsClientMock.create(),
        spaceId: 'default',
        limitedToPackages: undefined,
      },
    };
    response = httpServerMock.createResponseFactory();
    request = httpServerMock.createKibanaRequest({
      method: 'post',
      path: '/api/fleet/setup',
      headers: { 'Elastic-Api-Version': `${API_VERSIONS.public.v1}` },
    });
    // prevents `Logger not set.` and other appContext errors
    appContextService.start(createAppContextStartContractMock());
  });

  afterEach(async () => {
    jest.clearAllMocks();
    appContextService.stop();
  });

  it('POST /setup succeeds w/200 and body of resolved value', async () => {
    mockSetupFleet.mockImplementation(() =>
      Promise.resolve({
        isInitialized: true,
        nonFatalErrors: [],
      })
    );
    await fleetSetupWithErrorHandler(
      coreMock.createCustomRequestHandlerContext(context),
      request,
      response
    );

    const expectedBody: PostFleetSetupResponse = {
      isInitialized: true,
      nonFatalErrors: [],
    };
    expect(response.customError).toHaveBeenCalledTimes(0);
    expect(response.ok).toHaveBeenCalledWith({ body: expectedBody });
    const validationResp = FleetSetupResponseSchema.validate(expectedBody);
    expect(validationResp).toEqual(expectedBody);
  });

  it('POST /setup fails w/500 on custom error', async () => {
    mockSetupFleet.mockImplementation(() => Promise.reject(new Error('SO method mocked to throw')));
    await fleetSetupWithErrorHandler(
      coreMock.createCustomRequestHandlerContext(context),
      request,
      response
    );

    expect(response.customError).toHaveBeenCalledTimes(1);
    expect(response.customError).toHaveBeenCalledWith({
      statusCode: 500,
      body: {
        message: 'SO method mocked to throw',
      },
    });
  });

  it('POST /setup fails w/502 on RegistryError', async () => {
    mockSetupFleet.mockImplementation(() =>
      Promise.reject(new RegistryError('Registry method mocked to throw'))
    );

    await fleetSetupWithErrorHandler(
      coreMock.createCustomRequestHandlerContext(context),
      request,
      response
    );
    expect(response.customError).toHaveBeenCalledTimes(1);
    expect(response.customError).toHaveBeenCalledWith({
      statusCode: 502,
      body: {
        message: 'Registry method mocked to throw',
      },
    });
  });
});

describe('FleetStatusHandler', () => {
  let context: AwaitedProperties<
    Omit<FleetRequestHandlerContext, 'resolve' | 'loadPluginContract'>
  >;
  let response: ReturnType<typeof httpServerMock.createResponseFactory>;
  let request: ReturnType<typeof httpServerMock.createKibanaRequest>;

  beforeEach(async () => {
    context = {
      ...xpackMocks.createRequestHandlerContext(),
      fleet: {
        uninstallTokenService: {
          asCurrentUser: createUninstallTokenServiceMock(),
        },
        getAllSpaces: jest.fn(),
        agentClient: {
          asCurrentUser: agentServiceMock.createClient(),
          asInternalUser: agentServiceMock.createClient(),
        },
        authz: createFleetAuthzMock(),
        packagePolicyService: {
          asCurrentUser: createPackagePolicyServiceMock(),
          asInternalUser: createPackagePolicyServiceMock(),
        },
        internalSoClient: savedObjectsClientMock.create(),
        spaceId: 'default',
        limitedToPackages: undefined,
      },
    };
    response = httpServerMock.createResponseFactory();
    request = httpServerMock.createKibanaRequest({
      method: 'post',
      path: '/api/fleet/status',
      headers: { 'Elastic-Api-Version': `${API_VERSIONS.public.v1}` },
    });
    // prevents `Logger not set.` and other appContext errors
    appContextService.start(createAppContextStartContractMock());
  });

  afterEach(async () => {
    jest.clearAllMocks();
    appContextService.stop();
  });

  it('POST /status w/200 and body without missing requirements', async () => {
    jest
      .mocked(appContextService.getSecurity().authc.apiKeys.areAPIKeysEnabled)
      .mockResolvedValue(true);
    jest.mocked(hasFleetServers).mockResolvedValue(true);
    await getFleetStatusWithErrorHandler(
      coreMock.createCustomRequestHandlerContext(context),
      request,
      response
    );

    const expectedBody = {
      isReady: true,
      is_secrets_storage_enabled: true,
      is_space_awareness_enabled: false,
      is_ssl_secrets_storage_enabled: true,
      missing_optional_features: [],
      missing_requirements: [],
      is_action_secrets_storage_enabled: true,
    };
    expect(response.customError).toHaveBeenCalledTimes(0);
    expect(response.ok).toHaveBeenCalledWith({ body: expectedBody });
  });

  it('POST /status w/200 and body with missing requirements', async () => {
    jest
      .mocked(appContextService.getSecurity().authc.apiKeys.areAPIKeysEnabled)
      .mockResolvedValue(false);
    jest.mocked(hasFleetServers).mockResolvedValue(false);
    await getFleetStatusWithErrorHandler(
      coreMock.createCustomRequestHandlerContext(context),
      request,
      response
    );

    const expectedBody = {
      isReady: false,
      is_secrets_storage_enabled: true,
      is_space_awareness_enabled: false,
      is_ssl_secrets_storage_enabled: true,
      missing_optional_features: [],
      missing_requirements: ['api_keys', 'fleet_server'],
      is_action_secrets_storage_enabled: true,
    };
    expect(response.customError).toHaveBeenCalledTimes(0);
    expect(response.ok).toHaveBeenCalledWith({ body: expectedBody });
    const validationResp = GetAgentsSetupResponseSchema.validate(expectedBody);
    expect(validationResp).toEqual(expectedBody);
  });

  it('POST /status  w/200 with fleet server standalone', async () => {
    jest.mocked(hasFleetServers).mockResolvedValue(false);
    appContextService.start(
      createAppContextStartContractMock({
        internal: {
          fleetServerStandalone: true,
        },
      } as any)
    );
    jest
      .mocked(appContextService.getSecurity().authc.apiKeys.areAPIKeysEnabled)
      .mockResolvedValue(true);
    await getFleetStatusWithErrorHandler(
      coreMock.createCustomRequestHandlerContext(context),
      request,
      response
    );

    const expectedBody = {
      isReady: true,
      is_secrets_storage_enabled: true,
      is_space_awareness_enabled: false,
      is_ssl_secrets_storage_enabled: true,
      missing_optional_features: [],
      missing_requirements: [],
      is_action_secrets_storage_enabled: true,
    };
    expect(response.customError).toHaveBeenCalledTimes(0);
    expect(response.ok).toHaveBeenCalledWith({ body: expectedBody });
  });
});
