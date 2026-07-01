/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';

import type { ScopeableRequest } from '@kbn/core/server';
import { elasticsearchServiceMock, httpServerMock } from '@kbn/core/server/mocks';

import type { MockAuthenticationProviderOptions } from './base.mock';
import { mockAuthenticationProviderOptions } from './base.mock';
import { HTTPAuthenticationProvider } from './http';
import { ES_CLIENT_AUTHENTICATION_HEADER } from '../../../common/constants';
import { mockAuthenticatedUser } from '../../../common/model/authenticated_user.mock';
import { securityMock } from '../../mocks';
import { ROUTE_TAG_ACCEPT_JWT, ROUTE_TAG_ACCEPT_UIAM_OAUTH } from '../../routes/tags';
import { AuthenticationResult } from '../authentication_result';
import { DeauthenticationResult } from '../deauthentication_result';

function expectAuthenticateCall(
  mockClusterClient: ReturnType<typeof elasticsearchServiceMock.createClusterClient>,
  scopeableRequest: ScopeableRequest
) {
  expect(mockClusterClient.asScoped).toHaveBeenCalledTimes(1);
  expect(mockClusterClient.asScoped).toHaveBeenCalledWith(scopeableRequest);

  const mockScopedClusterClient = mockClusterClient.asScoped.mock.results[0].value;
  expect(mockScopedClusterClient.asCurrentUser.security.authenticate).toHaveBeenCalledTimes(1);
}

describe('HTTPAuthenticationProvider', () => {
  let mockOptions: MockAuthenticationProviderOptions;
  beforeEach(() => {
    mockOptions = mockAuthenticationProviderOptions({ name: 'http' });
  });

  it('throws if `schemes` are not specified', () => {
    const providerOptions = mockAuthenticationProviderOptions();

    expect(() => new HTTPAuthenticationProvider(providerOptions, undefined as any)).toThrowError(
      'Supported schemes should be specified'
    );
    expect(() => new HTTPAuthenticationProvider(providerOptions, {} as any)).toThrowError(
      'Supported schemes should be specified'
    );
    expect(
      () => new HTTPAuthenticationProvider(providerOptions, { supportedSchemes: new Set() })
    ).toThrowError('Supported schemes should be specified');
  });

  describe('`login` method', () => {
    it('does not handle login', async () => {
      const provider = new HTTPAuthenticationProvider(mockOptions, {
        supportedSchemes: new Set(['apikey']),
      });

      await expect(provider.login()).resolves.toEqual(AuthenticationResult.notHandled());

      expect(mockOptions.client.asScoped).not.toHaveBeenCalled();
    });
  });

  describe('`authenticate` method', () => {
    it('does not handle authentication for requests without `authorization` header.', async () => {
      const provider = new HTTPAuthenticationProvider(mockOptions, {
        supportedSchemes: new Set(['apikey']),
      });

      await expect(provider.authenticate(httpServerMock.createKibanaRequest())).resolves.toEqual(
        AuthenticationResult.notHandled()
      );

      expect(mockOptions.client.asScoped).not.toHaveBeenCalled();
    });

    it('does not handle authentication for requests with empty scheme in `authorization` header.', async () => {
      const provider = new HTTPAuthenticationProvider(mockOptions, {
        supportedSchemes: new Set(['apikey']),
      });

      await expect(
        provider.authenticate(
          httpServerMock.createKibanaRequest({ headers: { authorization: '' } })
        )
      ).resolves.toEqual(AuthenticationResult.notHandled());

      expect(mockOptions.client.asScoped).not.toHaveBeenCalled();
    });

    it('does not handle authentication via `authorization` header if scheme is not supported.', async () => {
      for (const { schemes, header } of [
        { schemes: ['basic'], header: 'Bearer xxx' },
        { schemes: ['bearer'], header: 'Basic xxx' },
        { schemes: ['basic', 'apikey'], header: 'Bearer xxx' },
        { schemes: ['basic', 'bearer'], header: 'ApiKey xxx' },
      ]) {
        const request = httpServerMock.createKibanaRequest({ headers: { authorization: header } });

        const provider = new HTTPAuthenticationProvider(mockOptions, {
          supportedSchemes: new Set(schemes),
        });

        await expect(provider.authenticate(request)).resolves.toEqual(
          AuthenticationResult.notHandled()
        );

        expect(request.headers.authorization).toBe(header);
      }

      expect(mockOptions.client.asScoped).not.toHaveBeenCalled();
    });

    it('succeeds if authentication via `authorization` header with supported scheme succeeds.', async () => {
      const user = mockAuthenticatedUser();
      for (const { schemes, header } of [
        { schemes: ['basic'], header: 'Basic xxx' },
        { schemes: ['bearer'], header: 'Bearer xxx' },
        { schemes: ['basic', 'apikey'], header: 'ApiKey xxx' },
        { schemes: ['some-weird-scheme'], header: 'some-weird-scheme xxx' },
        { schemes: ['apikey', 'bearer'], header: 'Bearer xxx' },
      ]) {
        const request = httpServerMock.createKibanaRequest({ headers: { authorization: header } });

        const mockScopedClusterClient = elasticsearchServiceMock.createScopedClusterClient();
        mockScopedClusterClient.asCurrentUser.security.authenticate.mockResponse(user);
        mockOptions.client.asScoped.mockReturnValue(mockScopedClusterClient);
        mockOptions.client.asScoped.mockClear();

        const provider = new HTTPAuthenticationProvider(mockOptions, {
          supportedSchemes: new Set(schemes),
        });

        const scheme = header.split(' ')[0].toLowerCase();
        await expect(provider.authenticate(request)).resolves.toEqual(
          AuthenticationResult.succeeded(
            {
              ...user,
              authentication_provider: { type: 'http', name: 'http' },
              http_authentication_scheme: scheme,
            },
            { authHeaders: { authorization: header } }
          )
        );

        expectAuthenticateCall(mockOptions.client, request);

        expect(request.headers.authorization).toBe(header);
      }
    });

    it('succeeds for JWT authentication if not restricted to tagged routes.', async () => {
      const header = 'Bearer header.body.signature';
      const user = mockAuthenticatedUser({ authentication_realm: { name: 'jwt1', type: 'jwt' } });
      const request = httpServerMock.createKibanaRequest({ headers: { authorization: header } });

      const mockScopedClusterClient = elasticsearchServiceMock.createScopedClusterClient();
      mockScopedClusterClient.asCurrentUser.security.authenticate.mockResponse(user);
      mockOptions.client.asScoped.mockReturnValue(mockScopedClusterClient);
      mockOptions.client.asScoped.mockClear();

      const provider = new HTTPAuthenticationProvider(mockOptions, {
        supportedSchemes: new Set(['bearer']),
      });

      await expect(provider.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(
          {
            ...user,
            authentication_provider: { type: 'http', name: 'http' },
            http_authentication_scheme: 'bearer',
          },
          { authHeaders: { authorization: header } }
        )
      );

      expectAuthenticateCall(mockOptions.client, request);

      expect(request.headers.authorization).toBe(header);
    });

    it('succeeds for non-JWT authentication if JWT restricted to tagged routes.', async () => {
      const header = 'Basic xxx';
      const user = mockAuthenticatedUser();
      const request = httpServerMock.createKibanaRequest({ headers: { authorization: header } });

      const mockScopedClusterClient = elasticsearchServiceMock.createScopedClusterClient();
      mockScopedClusterClient.asCurrentUser.security.authenticate.mockResponse(user);
      mockOptions.client.asScoped.mockReturnValue(mockScopedClusterClient);
      mockOptions.client.asScoped.mockClear();

      const provider = new HTTPAuthenticationProvider(mockOptions, {
        supportedSchemes: new Set(['bearer', 'basic']),
        jwt: { taggedRoutesOnly: true },
      });

      await expect(provider.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(
          {
            ...user,
            authentication_provider: { type: 'http', name: 'http' },
            http_authentication_scheme: 'basic',
          },
          { authHeaders: { authorization: header } }
        )
      );

      expectAuthenticateCall(mockOptions.client, request);

      expect(request.headers.authorization).toBe(header);
    });

    it('succeeds for JWT authentication if restricted to tagged routes and route is tagged.', async () => {
      const header = 'Bearer header.body.signature';
      const user = mockAuthenticatedUser({ authentication_realm: { name: 'jwt1', type: 'jwt' } });
      const request = httpServerMock.createKibanaRequest({
        headers: { authorization: header },
        routeTags: [ROUTE_TAG_ACCEPT_JWT],
      });

      const mockScopedClusterClient = elasticsearchServiceMock.createScopedClusterClient();
      mockScopedClusterClient.asCurrentUser.security.authenticate.mockResponse(user);
      mockOptions.client.asScoped.mockReturnValue(mockScopedClusterClient);
      mockOptions.client.asScoped.mockClear();

      const provider = new HTTPAuthenticationProvider(mockOptions, {
        supportedSchemes: new Set(['bearer']),
        jwt: { taggedRoutesOnly: true },
      });

      await expect(provider.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(
          {
            ...user,
            authentication_provider: { type: 'http', name: 'http' },
            http_authentication_scheme: 'bearer',
          },
          { authHeaders: { authorization: header } }
        )
      );

      expectAuthenticateCall(mockOptions.client, request);

      expect(request.headers.authorization).toBe(header);
    });

    it('fails for JWT authentication if restricted to tagged routes and route is NOT tagged.', async () => {
      const header = 'Bearer header.body.signature';
      const user = mockAuthenticatedUser({ authentication_realm: { name: 'jwt1', type: 'jwt' } });
      const request = httpServerMock.createKibanaRequest({ headers: { authorization: header } });

      const mockScopedClusterClient = elasticsearchServiceMock.createScopedClusterClient();
      mockScopedClusterClient.asCurrentUser.security.authenticate.mockResponse(user);
      mockOptions.client.asScoped.mockReturnValue(mockScopedClusterClient);
      mockOptions.client.asScoped.mockClear();

      const provider = new HTTPAuthenticationProvider(mockOptions, {
        supportedSchemes: new Set(['bearer']),
        jwt: { taggedRoutesOnly: true },
      });

      await expect(provider.authenticate(request)).resolves.toEqual(
        AuthenticationResult.notHandled()
      );

      expectAuthenticateCall(mockOptions.client, request);

      expect(request.headers.authorization).toBe(header);
    });

    it('fails if authentication via `authorization` header with supported scheme fails.', async () => {
      const failureReason = new errors.ResponseError(securityMock.createApiResponse({ body: {} }));
      for (const { schemes, header } of [
        { schemes: ['basic'], header: 'Basic xxx' },
        { schemes: ['bearer'], header: 'Bearer xxx' },
        { schemes: ['basic', 'apikey'], header: 'ApiKey xxx' },
        { schemes: ['some-weird-scheme'], header: 'some-weird-scheme xxx' },
        { schemes: ['apikey', 'bearer'], header: 'Bearer xxx' },
      ]) {
        const request = httpServerMock.createKibanaRequest({ headers: { authorization: header } });

        const mockScopedClusterClient = elasticsearchServiceMock.createScopedClusterClient();
        mockScopedClusterClient.asCurrentUser.security.authenticate.mockRejectedValue(
          failureReason
        );
        mockOptions.client.asScoped.mockReturnValue(mockScopedClusterClient);
        mockOptions.client.asScoped.mockClear();

        const provider = new HTTPAuthenticationProvider(mockOptions, {
          supportedSchemes: new Set(schemes),
        });

        await expect(provider.authenticate(request)).resolves.toEqual(
          AuthenticationResult.failed(failureReason)
        );

        expectAuthenticateCall(mockOptions.client, request);

        expect(request.headers.authorization).toBe(header);
      }
    });
  });

  describe('UIAM OAuth authentication', () => {
    let mockOptionsWithUiam: MockAuthenticationProviderOptions;

    beforeEach(() => {
      mockOptionsWithUiam = mockAuthenticationProviderOptions({ name: 'http', uiam: true });
    });

    it('exchanges UIAM OAuth token and authenticates successfully on tagged route.', async () => {
      const header = 'Bearer essu_oauth_access_token';
      const user = mockAuthenticatedUser();

      mockOptionsWithUiam.uiam!.exchangeOAuthToken.mockResolvedValue('essu_ephemeral_token');

      const request = httpServerMock.createKibanaRequest({
        headers: { authorization: header },
        routeTags: [ROUTE_TAG_ACCEPT_UIAM_OAUTH],
      });

      const mockScopedClusterClient = elasticsearchServiceMock.createScopedClusterClient();
      mockScopedClusterClient.asCurrentUser.security.authenticate.mockResponse(user);
      mockOptionsWithUiam.client.asScoped.mockReturnValue(mockScopedClusterClient);

      const provider = new HTTPAuthenticationProvider(mockOptionsWithUiam, {
        supportedSchemes: new Set(['bearer']),
      });

      await expect(provider.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(
          {
            ...user,
            authentication_provider: { type: 'http', name: 'http' },
            http_authentication_scheme: 'bearer',
          },
          {
            authHeaders: {
              authorization: 'Bearer essu_ephemeral_token',
              [ES_CLIENT_AUTHENTICATION_HEADER]: 'some-shared-secret',
            },
          }
        )
      );

      expect(mockOptionsWithUiam.uiam!.exchangeOAuthToken).toHaveBeenCalledWith(
        'essu_oauth_access_token'
      );

      expect(mockOptionsWithUiam.client.asScoped).toHaveBeenCalledWith({
        headers: {
          ...request.headers,
          authorization: 'Bearer essu_ephemeral_token',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'some-shared-secret',
        },
      });
    });

    it('fails authentication when UIAM token exchange fails.', async () => {
      const header = 'Bearer essu_oauth_access_token';
      const exchangeError = new Error('UIAM service unavailable');

      mockOptionsWithUiam.uiam!.exchangeOAuthToken.mockRejectedValue(exchangeError);

      const request = httpServerMock.createKibanaRequest({
        headers: { authorization: header },
        routeTags: [ROUTE_TAG_ACCEPT_UIAM_OAUTH],
      });

      const provider = new HTTPAuthenticationProvider(mockOptionsWithUiam, {
        supportedSchemes: new Set(['bearer']),
      });

      await expect(provider.authenticate(request)).resolves.toEqual(
        AuthenticationResult.failed(exchangeError)
      );
    });

    it('does not intercept essu_ tokens on non-tagged routes (falls through to ES).', async () => {
      const header = 'Bearer essu_some_token';
      const user = mockAuthenticatedUser();

      const request = httpServerMock.createKibanaRequest({
        headers: { authorization: header },
      });

      const mockScopedClusterClient = elasticsearchServiceMock.createScopedClusterClient();
      mockScopedClusterClient.asCurrentUser.security.authenticate.mockResponse(user);
      mockOptionsWithUiam.client.asScoped.mockReturnValue(mockScopedClusterClient);

      const provider = new HTTPAuthenticationProvider(mockOptionsWithUiam, {
        supportedSchemes: new Set(['bearer']),
      });

      await expect(provider.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(
          {
            ...user,
            authentication_provider: { type: 'http', name: 'http' },
            http_authentication_scheme: 'bearer',
          },
          { authHeaders: { authorization: header } }
        )
      );

      expect(mockOptionsWithUiam.uiam!.exchangeOAuthToken).not.toHaveBeenCalled();
    });

    it('logs a warning when essu_ token is used on a non-tagged route.', async () => {
      const header = 'Bearer essu_some_token';
      const user = mockAuthenticatedUser();

      const request = httpServerMock.createKibanaRequest({
        headers: { authorization: header },
      });

      const mockScopedClusterClient = elasticsearchServiceMock.createScopedClusterClient();
      mockScopedClusterClient.asCurrentUser.security.authenticate.mockResponse(user);
      mockOptionsWithUiam.client.asScoped.mockReturnValue(mockScopedClusterClient);

      const provider = new HTTPAuthenticationProvider(mockOptionsWithUiam, {
        supportedSchemes: new Set(['bearer']),
      });

      await provider.authenticate(request);

      expect(mockOptionsWithUiam.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Detected UIAM OAuth token on a non-MCP endpoint')
      );
    });

    it('does not intercept essu_ tokens when UIAM is not enabled.', async () => {
      const header = 'Bearer essu_some_token';
      const user = mockAuthenticatedUser();

      const request = httpServerMock.createKibanaRequest({
        headers: { authorization: header },
        routeTags: [ROUTE_TAG_ACCEPT_UIAM_OAUTH],
      });

      const mockScopedClusterClient = elasticsearchServiceMock.createScopedClusterClient();
      mockScopedClusterClient.asCurrentUser.security.authenticate.mockResponse(user);

      const optionsWithoutUiam = mockAuthenticationProviderOptions({ name: 'http' });
      optionsWithoutUiam.client.asScoped.mockReturnValue(mockScopedClusterClient);

      const provider = new HTTPAuthenticationProvider(optionsWithoutUiam, {
        supportedSchemes: new Set(['bearer']),
      });

      await expect(provider.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(
          {
            ...user,
            authentication_provider: { type: 'http', name: 'http' },
            http_authentication_scheme: 'bearer',
          },
          { authHeaders: { authorization: header } }
        )
      );

      expect(optionsWithoutUiam.client.asScoped).toHaveBeenCalledWith(request);
    });

    it('does not intercept non-essu_ Bearer tokens on tagged routes.', async () => {
      const header = 'Bearer regular_jwt_token';
      const user = mockAuthenticatedUser();

      const request = httpServerMock.createKibanaRequest({
        headers: { authorization: header },
        routeTags: [ROUTE_TAG_ACCEPT_UIAM_OAUTH],
      });

      const mockScopedClusterClient = elasticsearchServiceMock.createScopedClusterClient();
      mockScopedClusterClient.asCurrentUser.security.authenticate.mockResponse(user);
      mockOptionsWithUiam.client.asScoped.mockReturnValue(mockScopedClusterClient);

      const provider = new HTTPAuthenticationProvider(mockOptionsWithUiam, {
        supportedSchemes: new Set(['bearer']),
      });

      await expect(provider.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(
          {
            ...user,
            authentication_provider: { type: 'http', name: 'http' },
            http_authentication_scheme: 'bearer',
          },
          { authHeaders: { authorization: header } }
        )
      );

      expect(mockOptionsWithUiam.uiam!.exchangeOAuthToken).not.toHaveBeenCalled();
    });
  });

  describe('`logout` method', () => {
    it('does not handle logout', async () => {
      const provider = new HTTPAuthenticationProvider(mockOptions, {
        supportedSchemes: new Set(['apikey']),
      });

      await expect(provider.logout()).resolves.toEqual(DeauthenticationResult.notHandled());

      expect(mockOptions.client.asScoped).not.toHaveBeenCalled();
    });
  });

  it('`getHTTPAuthenticationScheme` method', () => {
    const provider = new HTTPAuthenticationProvider(mockOptions, {
      supportedSchemes: new Set(['apikey']),
    });
    expect(provider.getHTTPAuthenticationScheme()).toBeNull();
  });
});
