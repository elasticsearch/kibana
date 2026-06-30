/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

jest.mock('./verify_access_and_context', () => ({
  verifyAccessAndContext: jest.fn(),
}));
jest.mock('../lib/oauth_state_client');
jest.mock('../lib/oauth_authorization_service');

import Boom from '@hapi/boom';
import { httpServiceMock, httpServerMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { licenseStateMock } from '../lib/license_state.mock';
import { verifyAccessAndContext } from './verify_access_and_context';
import { oauthAuthorizeRoute } from './oauth_authorize';
import { OAuthStateClient } from '../lib/oauth_state_client';
import { OAuthAuthorizationService } from '../lib/oauth_authorization_service';
import { actionsConfigMock } from '../actions_config.mock';
import { OAUTH_API_TAG } from '../feature';

const MockOAuthStateClient = OAuthStateClient as jest.MockedClass<typeof OAuthStateClient>;
const MockOAuthAuthorizationService = OAuthAuthorizationService as jest.MockedClass<
  typeof OAuthAuthorizationService
>;

const mockLogger = loggingSystemMock.create().get();
const mockConfigurationUtilities = actionsConfigMock.create();

const mockOAuthStateClientInstance = {
  create: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
  cleanupExpiredStates: jest.fn(),
};

const mockOAuthServiceInstance = {
  getOAuthConfig: jest.fn(),
  buildAuthorizationUrl: jest.fn(),
  buildEarsAuthorizationUrl: jest.fn(),
};

const mockEncryptedSavedObjectsClient = {
  getClient: jest.fn().mockReturnValue({}),
};

const mockSpacesService = {
  getSpaceId: jest.fn().mockReturnValue('default'),
  spaceIdToNamespace: jest.fn().mockReturnValue(undefined),
};

const mockRateLimiter = {
  log: jest.fn(),
  isRateLimited: jest.fn().mockReturnValue(false),
  getLogs: jest.fn(),
};

const KIBANA_URL = 'https://kibana.example.com';

const createMockCoreSetup = (publicBaseUrl: string | undefined = KIBANA_URL) => ({
  getStartServices: jest.fn().mockResolvedValue([
    {
      http: {
        basePath: {
          publicBaseUrl,
        },
      },
    },
    {
      encryptedSavedObjects: mockEncryptedSavedObjectsClient,
      spaces: { spacesService: mockSpacesService },
    },
  ]),
});

const mockActionsClient = {
  get: jest.fn().mockResolvedValue({}),
};

const createMockContext = (
  currentUser: { username: string; profile_uid?: string } | null = {
    username: 'testuser',
    profile_uid: 'test-profile-uid',
  }
) => ({
  core: Promise.resolve({
    security: {
      authc: {
        getCurrentUser: jest.fn().mockReturnValue(currentUser),
      },
    },
    savedObjects: {
      getClient: jest.fn().mockReturnValue({}),
    },
  }),
  actions: Promise.resolve({
    getActionsClient: jest.fn().mockReturnValue(mockActionsClient),
  }),
});

describe('oauthAuthorizeRoute', () => {
  let router: ReturnType<typeof httpServiceMock.createRouter>;

  beforeEach(() => {
    jest.resetAllMocks();
    router = httpServiceMock.createRouter();
    (verifyAccessAndContext as jest.Mock).mockImplementation((_license, handler) => handler);

    // Restore mock implementations cleared by resetAllMocks
    (mockLogger.get as jest.Mock).mockReturnValue(mockLogger);
    mockActionsClient.get.mockResolvedValue({});
    mockRateLimiter.isRateLimited.mockReturnValue(false);
    mockSpacesService.getSpaceId.mockReturnValue('default');
    mockSpacesService.spaceIdToNamespace.mockReturnValue(undefined);
    mockEncryptedSavedObjectsClient.getClient.mockReturnValue({});

    MockOAuthStateClient.mockImplementation(() => mockOAuthStateClientInstance as never);
    MockOAuthAuthorizationService.mockImplementation(() => mockOAuthServiceInstance as never);
    (OAuthAuthorizationService.getRedirectUri as jest.Mock).mockReturnValue(
      'https://kibana.example.com/api/actions/connector/_oauth_callback'
    );
  });

  const registerRoute = (
    coreSetup = createMockCoreSetup(),
    configUtils = mockConfigurationUtilities
  ) => {
    const licenseState = licenseStateMock.create();
    oauthAuthorizeRoute(
      router,
      licenseState,
      mockLogger,
      coreSetup as never,
      mockRateLimiter as never,
      configUtils
    );
    return router.post.mock.calls[0]!;
  };

  it('registers a POST route at the correct path', () => {
    const [postConfig] = registerRoute();

    expect(postConfig.path).toBe('/internal/actions/connector/{connectorId}/_start_oauth_flow');
  });

  it('registers a GET route for browser OAuth start redirect', () => {
    registerRoute();
    const [getConfig] = router.get.mock.calls[0]!;

    expect(getConfig.path).toBe('/api/actions/connector/{connectorId}/oauth/start');
  });

  it('POST route requires OAUTH_API_TAG privilege', () => {
    const [postConfig] = registerRoute();

    expect(postConfig.security).toEqual({
      authz: {
        requiredPrivileges: [OAUTH_API_TAG],
      },
    });
  });

  it('GET route requires OAUTH_API_TAG privilege', () => {
    registerRoute();
    const [getConfig] = router.get.mock.calls[0]!;

    expect(getConfig.security).toEqual({
      authz: {
        requiredPrivileges: [OAUTH_API_TAG],
      },
    });
  });

  it('returns unauthorized when no current user', async () => {
    const [, handler] = registerRoute();
    const context = createMockContext(null);
    const req = httpServerMock.createKibanaRequest({
      params: { connectorId: 'connector-1' },
      body: {},
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.unauthorized).toHaveBeenCalledWith({
      body: {
        message: 'User should be authenticated to initiate OAuth authorization.',
      },
    });
  });

  it('returns error when profile UID is missing', async () => {
    const [, handler] = registerRoute();
    const context = createMockContext({ username: 'testuser' });
    const req = httpServerMock.createKibanaRequest({
      params: { connectorId: 'connector-1' },
      body: {},
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.customError).toHaveBeenCalledWith({
      statusCode: 500,
      body: {
        message: 'Unable to retrieve Kibana user profile ID.',
      },
    });
    expect(mockRateLimiter.log).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimiter.isRateLimited.mockReturnValue(true);

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      params: { connectorId: 'connector-1' },
      body: {},
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(mockRateLimiter.log).toHaveBeenCalledWith('test-profile-uid', 'authorize');
    expect(res.customError).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        body: {
          message: 'Too many authorization attempts. Please try again later.',
        },
      })
    );
  });

  it('returns bad request when public base URL is not configured', async () => {
    // Pass null and cast - passing undefined would trigger the default parameter value
    const coreSetup = createMockCoreSetup(null as unknown as undefined);

    const [, handler] = registerRoute(coreSetup);
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      params: { connectorId: 'connector-1' },
      body: {},
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.badRequest).toHaveBeenCalledWith({
      body: {
        message: 'Kibana public URL not configured. Please set server.publicBaseUrl in kibana.yml',
      },
    });
  });

  it('returns bad request for cross-origin returnUrl', async () => {
    mockOAuthServiceInstance.getOAuthConfig.mockResolvedValue({
      authTypeId: 'oauth_authorization_code',
      authorizationUrl: 'https://provider.example.com/authorize',
      tokenUrl: 'https://provider.example.com/token',
      clientId: 'client-id',
    });

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      params: { connectorId: 'connector-1' },
      body: { returnUrl: 'https://evil.example.com/phish' },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.badRequest).toHaveBeenCalledWith({
      body: {
        message: expect.stringContaining('returnUrl must be same origin as Kibana'),
      },
    });
  });

  it('returns error when authorizationUrl host is not in allowedHosts', async () => {
    mockOAuthServiceInstance.getOAuthConfig.mockResolvedValue({
      authTypeId: 'oauth_authorization_code',
      authorizationUrl: 'https://not-allowed.example.com/authorize',
      tokenUrl: 'https://provider.example.com/token',
      clientId: 'client-id',
    });
    mockConfigurationUtilities.ensureUriAllowed.mockImplementation(() => {
      throw new Error(
        'target url "https://not-allowed.example.com/authorize" is not added to the Kibana config xpack.actions.allowedHosts'
      );
    });

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      params: { connectorId: 'connector-1' },
      body: {},
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(mockConfigurationUtilities.ensureUriAllowed).toHaveBeenCalledWith(
      'https://not-allowed.example.com/authorize'
    );
    expect(res.badRequest).toHaveBeenCalledWith({
      body: {
        message:
          'target url "https://not-allowed.example.com/authorize" is not added to the Kibana config xpack.actions.allowedHosts',
      },
    });
  });

  it('returns error when tokenUrl host is not in allowedHosts', async () => {
    mockOAuthServiceInstance.getOAuthConfig.mockResolvedValue({
      authTypeId: 'oauth_authorization_code',
      authorizationUrl: 'https://provider.example.com/authorize',
      tokenUrl: 'https://not-allowed.example.com/token',
      clientId: 'client-id',
    });
    mockConfigurationUtilities.ensureUriAllowed
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error(
          'target url "https://not-allowed.example.com/token" is not added to the Kibana config xpack.actions.allowedHosts'
        );
      });

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      params: { connectorId: 'connector-1' },
      body: {},
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(mockConfigurationUtilities.ensureUriAllowed).toHaveBeenNthCalledWith(
      1,
      'https://provider.example.com/authorize'
    );
    expect(mockConfigurationUtilities.ensureUriAllowed).toHaveBeenNthCalledWith(
      2,
      'https://not-allowed.example.com/token'
    );
    expect(res.badRequest).toHaveBeenCalledWith({
      body: {
        message:
          'target url "https://not-allowed.example.com/token" is not added to the Kibana config xpack.actions.allowedHosts',
      },
    });
  });

  it('returns authorization URL on success', async () => {
    mockOAuthServiceInstance.getOAuthConfig.mockResolvedValue({
      authTypeId: 'oauth_authorization_code',
      authorizationUrl: 'https://provider.example.com/authorize',
      tokenUrl: 'https://provider.example.com/token',
      clientId: 'client-id',
      scope: 'openid',
    });

    mockOAuthServiceInstance.buildAuthorizationUrl.mockReturnValue(
      'https://provider.example.com/authorize?client_id=client-id&response_type=code&state=random-state'
    );
    mockOAuthStateClientInstance.create.mockResolvedValue({
      state: {
        id: 'state-id',
        state: 'random-state',
        connectorId: 'connector-1',
      },
      codeChallenge: 'code-challenge-value',
    });

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      params: { connectorId: 'connector-1' },
      body: { returnUrl: 'https://kibana.example.com/app/my-page' },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.ok).toHaveBeenCalledWith({
      body: {
        authorizationUrl:
          'https://provider.example.com/authorize?client_id=client-id&response_type=code&state=random-state',
        state: 'random-state',
      },
    });

    // Verify OAuth state was created with the correct params
    expect(mockOAuthStateClientInstance.create).toHaveBeenCalledWith({
      connectorId: 'connector-1',
      kibanaReturnUrl: 'https://kibana.example.com/app/my-page',
      spaceId: 'default',
      createdBy: 'test-profile-uid',
    });

    // Verify authorization URL was built with correct params
    expect(mockOAuthServiceInstance.buildAuthorizationUrl).toHaveBeenCalledWith({
      baseAuthorizationUrl: 'https://provider.example.com/authorize',
      clientId: 'client-id',
      scope: 'openid',
      redirectUri: 'https://kibana.example.com/api/actions/connector/_oauth_callback',
      state: 'random-state',
      codeChallenge: 'code-challenge-value',
    });
  });

  it('returns EARS authorization URL and checks resolved EARS host against allowedHosts', async () => {
    mockOAuthServiceInstance.getOAuthConfig.mockResolvedValue({
      authTypeId: 'ears',
      provider: 'google',
      scope: 'openid email',
    });
    mockConfigurationUtilities.getEarsUrl.mockReturnValue('https://ears.example.com');
    mockOAuthServiceInstance.buildEarsAuthorizationUrl.mockReturnValue(
      'https://ears.example.com/v1/google/oauth/authorize?state=ears-state'
    );
    mockOAuthStateClientInstance.create.mockResolvedValue({
      state: {
        id: 'state-id',
        state: 'ears-state',
        connectorId: 'connector-ears',
      },
      codeChallenge: 'ears-pkce-challenge',
    });

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      params: { connectorId: 'connector-ears' },
      body: {},
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(mockConfigurationUtilities.ensureUriAllowed).toHaveBeenCalledWith(
      'https://ears.example.com/v1/google/oauth/authorize'
    );
    expect(mockOAuthServiceInstance.buildAuthorizationUrl).not.toHaveBeenCalled();
    expect(mockOAuthServiceInstance.buildEarsAuthorizationUrl).toHaveBeenCalledWith({
      baseAuthorizationUrl: 'https://ears.example.com/v1/google/oauth/authorize',
      scope: 'openid email',
      callbackUri: 'https://kibana.example.com/api/actions/connector/_oauth_callback',
      state: 'ears-state',
      pkceChallenge: 'ears-pkce-challenge',
    });
    expect(res.ok).toHaveBeenCalledWith({
      body: {
        authorizationUrl: 'https://ears.example.com/v1/google/oauth/authorize?state=ears-state',
        state: 'ears-state',
      },
    });
  });

  it('returns error when resolved EARS authorize URL host is not in allowedHosts', async () => {
    mockOAuthServiceInstance.getOAuthConfig.mockResolvedValue({
      authTypeId: 'ears',
      provider: 'google',
      scope: 'openid email',
    });
    mockConfigurationUtilities.getEarsUrl.mockReturnValue('https://ears-not-allowed.example.com');
    mockConfigurationUtilities.ensureUriAllowed.mockImplementation(() => {
      throw new Error(
        'target url "https://ears-not-allowed.example.com/v1/google/oauth/authorize" is not added to the Kibana config xpack.actions.allowedHosts'
      );
    });
    mockOAuthStateClientInstance.create.mockResolvedValue({
      state: {
        id: 'state-id',
        state: 'ears-state',
        connectorId: 'connector-ears',
      },
      codeChallenge: 'ears-pkce-challenge',
    });

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      params: { connectorId: 'connector-ears' },
      body: {},
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(mockConfigurationUtilities.ensureUriAllowed).toHaveBeenCalledWith(
      'https://ears-not-allowed.example.com/v1/google/oauth/authorize'
    );
    expect(mockOAuthServiceInstance.buildEarsAuthorizationUrl).not.toHaveBeenCalled();
    expect(res.badRequest).toHaveBeenCalledWith({
      body: {
        message:
          'target url "https://ears-not-allowed.example.com/v1/google/oauth/authorize" is not added to the Kibana config xpack.actions.allowedHosts',
      },
    });
  });

  it('omits return URL when not provided', async () => {
    mockOAuthServiceInstance.getOAuthConfig.mockResolvedValue({
      authTypeId: 'oauth_authorization_code',
      authorizationUrl: 'https://provider.example.com/authorize',
      tokenUrl: 'https://provider.example.com/token',
      clientId: 'client-id',
    });

    mockOAuthServiceInstance.buildAuthorizationUrl.mockReturnValue(
      'https://provider.example.com/authorize?state=s'
    );
    mockOAuthStateClientInstance.create.mockResolvedValue({
      state: { id: 'state-id', state: 'random-state' },
      codeChallenge: 'challenge',
    });

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      params: { connectorId: 'connector-1' },
      body: {},
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(mockOAuthStateClientInstance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kibanaReturnUrl: undefined,
      })
    );
  });

  it('returns error on OAuth service failure', async () => {
    mockOAuthServiceInstance.getOAuthConfig.mockRejectedValue(
      new Error('Connector does not use OAuth Authorization Code flow')
    );

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      params: { connectorId: 'connector-1' },
      body: {},
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.customError).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        body: {
          message: 'Connector does not use OAuth Authorization Code flow',
        },
      })
    );
  });

  it('returns 404 when actionsClient.get throws a Boom notFound error', async () => {
    mockActionsClient.get.mockRejectedValue(Boom.notFound('Connector not found'));

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      params: { connectorId: 'unknown-connector-id' },
      body: {},
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.customError).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
      })
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('preserves statusCode from errors that have one', async () => {
    const notFoundError = new Error('Connector not found') as Error & { statusCode: number };
    notFoundError.statusCode = 404;
    mockOAuthServiceInstance.getOAuthConfig.mockRejectedValue(notFoundError);

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      params: { connectorId: 'connector-1' },
      body: {},
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.customError).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        body: {
          message: 'Connector not found',
        },
      })
    );
  });

  it('GET redirects to the IdP authorization URL on success', async () => {
    mockOAuthServiceInstance.getOAuthConfig.mockResolvedValue({
      authTypeId: 'oauth_authorization_code',
      authorizationUrl: 'https://provider.example.com/authorize',
      tokenUrl: 'https://provider.example.com/token',
      clientId: 'client-id',
      scope: 'openid',
    });

    mockOAuthServiceInstance.buildAuthorizationUrl.mockReturnValue(
      'https://provider.example.com/authorize?client_id=client-id&response_type=code&state=random-state'
    );
    mockOAuthStateClientInstance.create.mockResolvedValue({
      state: {
        id: 'state-id',
        state: 'random-state',
        connectorId: 'connector-1',
      },
      codeChallenge: 'code-challenge-value',
    });

    registerRoute();
    const [, getHandler] = router.get.mock.calls[0]!;
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      params: { connectorId: 'connector-1' },
      query: {},
    });
    const res = httpServerMock.createResponseFactory();

    await getHandler(context, req, res);

    expect(res.redirected).toHaveBeenCalledWith({
      body: '',
      headers: {
        location:
          'https://provider.example.com/authorize?client_id=client-id&response_type=code&state=random-state',
      },
    });
  });

  it('calls verifyAccessAndContext with the license state', () => {
    const licenseState = licenseStateMock.create();
    oauthAuthorizeRoute(
      router,
      licenseState,
      mockLogger,
      createMockCoreSetup() as never,
      mockRateLimiter as never,
      mockConfigurationUtilities
    );

    expect(verifyAccessAndContext).toHaveBeenCalledWith(licenseState, expect.any(Function));
  });
});
