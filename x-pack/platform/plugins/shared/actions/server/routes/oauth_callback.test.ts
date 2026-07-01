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
jest.mock('../lib/user_connector_token_client');
jest.mock('../lib/request_oauth_authorization_code_token');
jest.mock('../lib/ears/request_ears_token');

import { httpServiceMock, httpServerMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { licenseStateMock } from '../lib/license_state.mock';
import { actionsConfigMock } from '../actions_config.mock';
import { verifyAccessAndContext } from './verify_access_and_context';
import { oauthCallbackRoute } from './oauth_callback';
import { OAuthStateClient } from '../lib/oauth_state_client';
import { UserConnectorTokenClient } from '../lib/user_connector_token_client';
import { requestOAuthAuthorizationCodeToken } from '../lib/request_oauth_authorization_code_token';
import { requestEarsToken } from '../lib/ears/request_ears_token';

const KIBANA_URL = 'https://kibana.example.com';

const MockOAuthStateClient = OAuthStateClient as jest.MockedClass<typeof OAuthStateClient>;
const MockUserConnectorTokenClient = UserConnectorTokenClient as jest.MockedClass<
  typeof UserConnectorTokenClient
>;
const mockRequestOAuthAuthorizationCodeToken =
  requestOAuthAuthorizationCodeToken as jest.MockedFunction<
    typeof requestOAuthAuthorizationCodeToken
  >;
const mockRequestEarsToken = requestEarsToken as jest.MockedFunction<typeof requestEarsToken>;

const configurationUtilities = actionsConfigMock.create();
const mockLogger = loggingSystemMock.create().get();

const mockOAuthStateClientInstance = {
  get: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  cleanupExpiredStates: jest.fn(),
};

const mockConnectorTokenClientInstance = {
  deleteConnectorTokens: jest.fn(),
  createWithRefreshToken: jest.fn(),
};

const mockEncryptedSavedObjectsClient = {
  getClient: jest.fn().mockReturnValue({
    getDecryptedAsInternalUser: jest.fn(),
  }),
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

const createMockCoreSetup = () => ({
  getStartServices: jest.fn().mockResolvedValue([
    {
      http: {
        basePath: {
          publicBaseUrl: KIBANA_URL,
        },
      },
    },
    {
      encryptedSavedObjects: mockEncryptedSavedObjectsClient,
      spaces: { spacesService: mockSpacesService },
    },
  ]),
});

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
    getActionsClient: jest.fn(),
  }),
});

describe('oauthCallbackRoute', () => {
  let router: ReturnType<typeof httpServiceMock.createRouter>;

  beforeEach(() => {
    jest.resetAllMocks();
    router = httpServiceMock.createRouter();
    (verifyAccessAndContext as jest.Mock).mockImplementation((_license, handler) => handler);

    // Restore mock implementations cleared by resetAllMocks
    (mockLogger.get as jest.Mock).mockReturnValue(mockLogger);
    mockRateLimiter.isRateLimited.mockReturnValue(false);
    mockSpacesService.spaceIdToNamespace.mockReturnValue(undefined);
    mockEncryptedSavedObjectsClient.getClient.mockReturnValue({
      getDecryptedAsInternalUser: jest.fn(),
    });

    MockOAuthStateClient.mockImplementation(() => mockOAuthStateClientInstance as never);
    MockUserConnectorTokenClient.mockImplementation(
      () => mockConnectorTokenClientInstance as never
    );
  });

  const registerRoute = (coreSetup = createMockCoreSetup()) => {
    const licenseState = licenseStateMock.create();
    oauthCallbackRoute(
      router,
      licenseState,
      configurationUtilities,
      mockLogger,
      coreSetup as never,
      mockRateLimiter as never
    );
    return router.get.mock.calls[0];
  };

  it('registers a GET route at the correct path', () => {
    registerRoute();

    const [config] = router.get.mock.calls[0];
    expect(config.path).toBe('/api/actions/connector/_oauth_callback');
  });

  it('returns unauthorized when no current user', async () => {
    const [, handler] = registerRoute();
    const context = createMockContext(null);
    const req = httpServerMock.createKibanaRequest({ query: { code: 'abc', state: 'xyz' } });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.unauthorized).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'content-type': 'text/html' },
      })
    );
  });

  it('returns error page when profile UID is missing', async () => {
    const [, handler] = registerRoute();
    const context = createMockContext({ username: 'testuser' });
    const req = httpServerMock.createKibanaRequest({ query: { code: 'abc', state: 'xyz' } });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.ok).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'content-type': 'text/html' },
        body: expect.stringContaining('Unable to retrieve Kibana user profile ID'),
      })
    );
    expect(mockRateLimiter.log).not.toHaveBeenCalled();
  });

  it('returns rate limit page when rate limited', async () => {
    mockRateLimiter.isRateLimited.mockReturnValue(true);

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({ query: { code: 'abc', state: 'xyz' } });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(mockRateLimiter.log).toHaveBeenCalledWith('test-profile-uid', 'callback');
    expect(res.ok).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'content-type': 'text/html' },
        body: expect.stringContaining('Too many authorization attempts'),
      })
    );
  });

  it('returns error page when OAuth error parameter is present', async () => {
    mockOAuthStateClientInstance.get.mockResolvedValue({
      id: 'state-id',
      state: 'valid-state',
      codeVerifier: 'test-verifier',
      connectorId: 'connector-1',
      spaceId: 'default',
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:10:00.000Z',
      createdBy: 'test-profile-uid',
    });

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      query: { error: 'access_denied', error_description: 'User cancelled', state: 'valid-state' },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.ok).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'content-type': 'text/html' },
        body: expect.stringContaining('access_denied'),
      })
    );
  });

  it('returns error page when code is missing', async () => {
    mockOAuthStateClientInstance.get.mockResolvedValue({
      id: 'state-id',
      state: 'some-state',
      codeVerifier: 'test-verifier',
      connectorId: 'connector-1',
      spaceId: 'default',
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:10:00.000Z',
      createdBy: 'test-profile-uid',
    });

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      query: { state: 'some-state' },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.ok).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'content-type': 'text/html' },
        body: expect.stringContaining('Missing required OAuth authorization code'),
      })
    );
  });

  it('returns error page when state is missing', async () => {
    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      query: { code: 'auth-code' },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.ok).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'content-type': 'text/html' },
        body: expect.stringContaining('Authorization Failed'),
      })
    );
  });

  it('returns error page for invalid/not found state', async () => {
    mockOAuthStateClientInstance.get.mockResolvedValue(null);

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      query: { code: 'auth-code', state: 'invalid-state' },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.ok).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Invalid or expired state parameter'),
      })
    );
  });

  it('exchanges code for tokens and redirects on success', async () => {
    const mockOAuthState = {
      id: 'state-id',
      state: 'valid-state',
      codeVerifier: 'test-verifier',
      connectorId: 'connector-1',
      kibanaReturnUrl: 'https://kibana.example.com/app/connectors',
      spaceId: 'default',
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:10:00.000Z',
      createdBy: 'test-profile-uid',
    };
    mockOAuthStateClientInstance.get.mockResolvedValue(mockOAuthState);

    const connectorEncryptedClient = {
      getDecryptedAsInternalUser: jest.fn().mockResolvedValue({
        attributes: {
          config: { tokenUrl: 'https://provider.example.com/token' },
          secrets: {
            clientId: 'client-id',
            clientSecret: 'client-secret',
            tokenUrl: 'https://provider.example.com/token',
          },
        },
      }),
    };
    mockEncryptedSavedObjectsClient.getClient.mockReturnValue(connectorEncryptedClient);

    mockRequestOAuthAuthorizationCodeToken.mockResolvedValue({
      tokenType: 'Bearer',
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
    });

    mockConnectorTokenClientInstance.deleteConnectorTokens.mockResolvedValue(undefined);
    mockConnectorTokenClientInstance.createWithRefreshToken.mockResolvedValue(undefined);

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      query: {
        code: 'auth-code',
        state: 'valid-state',
        scope: 'profile email https://www.googleapis.com/auth/drive.readonly',
      },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    // Verify token exchange
    expect(mockRequestOAuthAuthorizationCodeToken).toHaveBeenCalledWith(
      'https://provider.example.com/token',
      mockLogger,
      expect.objectContaining({
        code: 'auth-code',
        redirectUri: `${KIBANA_URL}/api/actions/connector/_oauth_callback`,
        codeVerifier: mockOAuthState.codeVerifier,
        clientId: 'client-id',
        clientSecret: 'client-secret',
      }),
      configurationUtilities,
      true,
      undefined
    );

    // Verify token storage
    expect(mockConnectorTokenClientInstance.deleteConnectorTokens).toHaveBeenCalledWith({
      connectorId: 'connector-1',
      tokenType: 'access_token',
      profileUid: 'test-profile-uid',
    });
    expect(mockConnectorTokenClientInstance.createWithRefreshToken).toHaveBeenCalledWith({
      connectorId: 'connector-1',
      accessToken: 'Bearer new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
      refreshTokenExpiresIn: undefined,
      tokenType: 'access_token',
      profileUid: 'test-profile-uid',
    });

    // Verify state cleanup
    expect(mockOAuthStateClientInstance.delete).toHaveBeenCalledWith('state-id');

    // Verify redirect
    expect(res.redirected).toHaveBeenCalledWith({
      headers: {
        location:
          'https://kibana.example.com/app/connectors?oauth_authorization=success&connector_id=connector-1&status_code=200',
      },
    });
  });

  it('uses EARS token exchange when authType is set in config (not secrets)', async () => {
    mockOAuthStateClientInstance.get.mockResolvedValue({
      id: 'state-id',
      state: 'valid-state',
      codeVerifier: 'test-verifier',
      connectorId: 'connector-1',
      kibanaReturnUrl: 'https://kibana.example.com/app/connectors',
      spaceId: 'default',
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:10:00.000Z',
      createdBy: 'test-profile-uid',
    });
    mockEncryptedSavedObjectsClient.getClient.mockReturnValue({
      getDecryptedAsInternalUser: jest.fn().mockResolvedValue({
        attributes: {
          config: { authType: 'ears' },
          secrets: { provider: 'test-provider' },
        },
      }),
    });
    mockRequestEarsToken.mockResolvedValue({
      tokenType: 'Bearer',
      accessToken: 'ears-token',
      refreshToken: 'ears-refresh',
      expiresIn: 3600,
      refreshTokenExpiresIn: 7200,
    });

    const [, handler] = registerRoute();
    const req = httpServerMock.createKibanaRequest({
      query: { code: 'auth-code', state: 'valid-state' },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(createMockContext(), req, res);

    expect(mockRequestEarsToken).toHaveBeenCalledWith(
      'test-provider',
      mockLogger,
      expect.objectContaining({ code: 'auth-code', pkceVerifier: 'test-verifier' }),
      configurationUtilities
    );
    expect(mockRequestOAuthAuthorizationCodeToken).not.toHaveBeenCalled();
    expect(res.redirected).toHaveBeenCalledWith({
      headers: {
        location: expect.stringContaining(
          'oauth_authorization=success&connector_id=connector-1&status_code=200'
        ),
      },
    });
  });

  it('redirects with error on token exchange failure', async () => {
    const mockOAuthState = {
      id: 'state-id',
      state: 'valid-state',
      codeVerifier: 'test-verifier',
      connectorId: 'connector-1',
      kibanaReturnUrl: 'https://kibana.example.com/app/connectors',
      spaceId: 'default',
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:10:00.000Z',
      createdBy: 'test-profile-uid',
    };
    mockOAuthStateClientInstance.get.mockResolvedValue(mockOAuthState);

    const connectorEncryptedClient = {
      getDecryptedAsInternalUser: jest.fn().mockResolvedValue({
        attributes: {
          config: {},
          secrets: {
            clientId: 'client-id',
            clientSecret: 'client-secret',
            tokenUrl: 'https://provider.example.com/token',
          },
        },
      }),
    };
    mockEncryptedSavedObjectsClient.getClient.mockReturnValue(connectorEncryptedClient);

    mockRequestOAuthAuthorizationCodeToken.mockRejectedValue(new Error('Token exchange failed'));

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      query: { code: 'auth-code', state: 'valid-state' },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.redirected).toHaveBeenCalledWith({
      headers: {
        location:
          'https://kibana.example.com/app/connectors?oauth_authorization=error&connector_id=connector-1&status_code=500&error=Token+exchange+failed',
      },
    });
  });

  it('redirects with error when connector is missing required OAuth config', async () => {
    const mockOAuthState = {
      id: 'state-id',
      state: 'valid-state',
      codeVerifier: 'test-verifier',
      connectorId: 'connector-1',
      kibanaReturnUrl: 'https://kibana.example.com/app/connectors',
      spaceId: 'default',
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:10:00.000Z',
      createdBy: 'test-profile-uid',
    };
    mockOAuthStateClientInstance.get.mockResolvedValue(mockOAuthState);

    const connectorEncryptedClient = {
      getDecryptedAsInternalUser: jest.fn().mockResolvedValue({
        attributes: {
          config: {},
          secrets: { clientId: 'client-id' }, // missing clientSecret and tokenUrl
        },
      }),
    };
    mockEncryptedSavedObjectsClient.getClient.mockReturnValue(connectorEncryptedClient);

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      query: { code: 'auth-code', state: 'valid-state' },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(res.redirected).toHaveBeenCalledWith({
      headers: {
        location:
          'https://kibana.example.com/app/connectors?oauth_authorization=error&connector_id=connector-1&status_code=500&error=Connector+missing+required+OAuth+configuration+%28clientId%2C+clientSecret%2C+tokenUrl%29',
      },
    });
  });

  it('rejects callback when createdBy does not match the current user', async () => {
    mockOAuthStateClientInstance.get.mockResolvedValue({
      id: 'state-id',
      state: 'valid-state',
      codeVerifier: 'test-verifier',
      connectorId: 'connector-1',
      kibanaReturnUrl: 'https://kibana.example.com/app/connectors',
      spaceId: 'default',
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:10:00.000Z',
      createdBy: 'different-profile-uid',
    });

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      query: { code: 'auth-code', state: 'valid-state' },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(mockRequestOAuthAuthorizationCodeToken).not.toHaveBeenCalled();
    expect(mockConnectorTokenClientInstance.createWithRefreshToken).not.toHaveBeenCalled();
    expect(res.redirected).toHaveBeenCalledWith({
      headers: {
        location: expect.stringContaining(
          'oauth_authorization=error&connector_id=connector-1&status_code=403'
        ),
      },
    });
  });

  it('rejects callback when oauth_state has no createdBy', async () => {
    mockOAuthStateClientInstance.get.mockResolvedValue({
      id: 'state-id',
      state: 'valid-state',
      codeVerifier: 'test-verifier',
      connectorId: 'connector-1',
      kibanaReturnUrl: 'https://kibana.example.com/app/connectors',
      spaceId: 'default',
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:10:00.000Z',
    });

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      query: { code: 'auth-code', state: 'valid-state' },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(mockRequestOAuthAuthorizationCodeToken).not.toHaveBeenCalled();
    expect(mockConnectorTokenClientInstance.createWithRefreshToken).not.toHaveBeenCalled();
    expect(res.redirected).toHaveBeenCalledWith({
      headers: {
        location: expect.stringContaining(
          'oauth_authorization=error&connector_id=connector-1&status_code=403'
        ),
      },
    });
  });

  it('redirects with Boom error status code when token storage throws a Boom error', async () => {
    const Boom = await import('@hapi/boom');

    mockOAuthStateClientInstance.get.mockResolvedValue({
      id: 'state-id',
      state: 'valid-state',
      codeVerifier: 'test-verifier',
      connectorId: 'connector-1',
      kibanaReturnUrl: 'https://kibana.example.com/app/connectors',
      spaceId: 'default',
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:10:00.000Z',
      createdBy: 'test-profile-uid',
    });
    mockEncryptedSavedObjectsClient.getClient.mockReturnValue({
      getDecryptedAsInternalUser: jest.fn().mockResolvedValue({
        attributes: {
          config: {},
          secrets: {
            clientId: 'client-id',
            clientSecret: 'client-secret',
            tokenUrl: 'https://provider.example.com/token',
          },
        },
      }),
    });
    mockRequestOAuthAuthorizationCodeToken.mockResolvedValue({
      tokenType: 'Bearer',
      accessToken: 'token',
      expiresIn: 3600,
    });
    mockConnectorTokenClientInstance.deleteConnectorTokens.mockRejectedValue(
      Boom.forbidden('Unable to create user_connector_token')
    );

    const [, handler] = registerRoute();
    const req = httpServerMock.createKibanaRequest({
      query: { code: 'auth-code', state: 'valid-state' },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(createMockContext(), req, res);

    expect(res.redirected).toHaveBeenCalledWith({
      headers: {
        location: expect.stringContaining('status_code=403'),
      },
    });
    expect(res.redirected).toHaveBeenCalledWith({
      headers: {
        location: expect.stringContaining('oauth_authorization=error'),
      },
    });
  });

  it('builds and passes tokenResponseOptions when secrets contain custom token paths', async () => {
    const mockOAuthState = {
      id: 'state-id',
      state: 'valid-state',
      codeVerifier: 'test-verifier',
      connectorId: 'connector-1',
      kibanaReturnUrl: 'https://kibana.example.com/app/connectors',
      spaceId: 'default',
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:10:00.000Z',
      createdBy: 'test-profile-uid',
    };
    mockOAuthStateClientInstance.get.mockResolvedValue(mockOAuthState);

    const connectorEncryptedClient = {
      getDecryptedAsInternalUser: jest.fn().mockResolvedValue({
        attributes: {
          config: { tokenUrl: 'https://slack.com/api/oauth.v2.access' },
          secrets: {
            clientId: 'slack-client-id',
            clientSecret: 'slack-client-secret',
            tokenUrl: 'https://slack.com/api/oauth.v2.access',
            accessTokenPath: 'authed_user.access_token',
            tokenType: 'bearer',
          },
        },
      }),
    };
    mockEncryptedSavedObjectsClient.getClient.mockReturnValue(connectorEncryptedClient);

    mockRequestOAuthAuthorizationCodeToken.mockResolvedValue({
      tokenType: 'bearer',
      accessToken: 'xoxp-slack-user-token',
      refreshToken: undefined,
      expiresIn: undefined,
    });

    mockConnectorTokenClientInstance.deleteConnectorTokens.mockResolvedValue(undefined);
    mockConnectorTokenClientInstance.createWithRefreshToken.mockResolvedValue(undefined);

    const [, handler] = registerRoute();
    const context = createMockContext();
    const req = httpServerMock.createKibanaRequest({
      query: { code: 'slack-auth-code', state: 'valid-state' },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(context, req, res);

    expect(mockRequestOAuthAuthorizationCodeToken).toHaveBeenCalledWith(
      'https://slack.com/api/oauth.v2.access',
      mockLogger,
      expect.objectContaining({
        code: 'slack-auth-code',
        clientId: 'slack-client-id',
        clientSecret: 'slack-client-secret',
      }),
      configurationUtilities,
      true,
      {
        accessTokenPath: 'authed_user.access_token',
        tokenTypePath: undefined,
        tokenType: 'bearer',
      }
    );

    expect(mockConnectorTokenClientInstance.createWithRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'bearer xoxp-slack-user-token',
      })
    );

    expect(res.redirected).toHaveBeenCalledWith({
      headers: {
        location: expect.stringContaining('oauth_authorization=success'),
      },
    });
  });

  it('redirects with SavedObjectsClient error status code when token storage throws an SO error', async () => {
    const { SavedObjectsErrorHelpers } = await import('@kbn/core/server');

    mockOAuthStateClientInstance.get.mockResolvedValue({
      id: 'state-id',
      state: 'valid-state',
      codeVerifier: 'test-verifier',
      connectorId: 'connector-1',
      kibanaReturnUrl: 'https://kibana.example.com/app/connectors',
      spaceId: 'default',
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:10:00.000Z',
      createdBy: 'test-profile-uid',
    });
    mockEncryptedSavedObjectsClient.getClient.mockReturnValue({
      getDecryptedAsInternalUser: jest.fn().mockResolvedValue({
        attributes: {
          config: {},
          secrets: {
            clientId: 'client-id',
            clientSecret: 'client-secret',
            tokenUrl: 'https://provider.example.com/token',
          },
        },
      }),
    });
    mockRequestOAuthAuthorizationCodeToken.mockResolvedValue({
      tokenType: 'Bearer',
      accessToken: 'token',
      expiresIn: 3600,
    });
    mockConnectorTokenClientInstance.deleteConnectorTokens.mockRejectedValue(
      SavedObjectsErrorHelpers.decorateForbiddenError(new Error('Forbidden'))
    );

    const [, handler] = registerRoute();
    const req = httpServerMock.createKibanaRequest({
      query: { code: 'auth-code', state: 'valid-state' },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(createMockContext(), req, res);

    expect(res.redirected).toHaveBeenCalledWith({
      headers: {
        location: expect.stringContaining('status_code=403'),
      },
    });
    expect(res.redirected).toHaveBeenCalledWith({
      headers: {
        location: expect.stringContaining('oauth_authorization=error'),
      },
    });
  });

  it('defaults to status_code=500 when the error is a plain Error', async () => {
    mockOAuthStateClientInstance.get.mockResolvedValue({
      id: 'state-id',
      state: 'valid-state',
      codeVerifier: 'test-verifier',
      connectorId: 'connector-1',
      kibanaReturnUrl: 'https://kibana.example.com/app/connectors',
      spaceId: 'default',
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:10:00.000Z',
      createdBy: 'test-profile-uid',
    });
    mockEncryptedSavedObjectsClient.getClient.mockReturnValue({
      getDecryptedAsInternalUser: jest.fn().mockResolvedValue({
        attributes: {
          config: {},
          secrets: {
            clientId: 'client-id',
            clientSecret: 'client-secret',
            tokenUrl: 'https://provider.example.com/token',
          },
        },
      }),
    });
    mockRequestOAuthAuthorizationCodeToken.mockResolvedValue({
      tokenType: 'Bearer',
      accessToken: 'token',
      expiresIn: 3600,
    });
    mockConnectorTokenClientInstance.deleteConnectorTokens.mockRejectedValue(
      new Error('Something went wrong')
    );

    const [, handler] = registerRoute();
    const req = httpServerMock.createKibanaRequest({
      query: { code: 'auth-code', state: 'valid-state' },
    });
    const res = httpServerMock.createResponseFactory();

    await handler(createMockContext(), req, res);

    expect(res.redirected).toHaveBeenCalledWith({
      headers: {
        location: expect.stringContaining('status_code=500'),
      },
    });
  });

  it('calls verifyAccessAndContext with the license state', () => {
    const licenseState = licenseStateMock.create();
    oauthCallbackRoute(
      router,
      licenseState,
      configurationUtilities,
      mockLogger,
      createMockCoreSetup() as never,
      mockRateLimiter as never
    );

    expect(verifyAccessAndContext).toHaveBeenCalledWith(licenseState, expect.any(Function));
  });
});
