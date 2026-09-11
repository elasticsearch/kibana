/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';

import type { ScopeableRequest } from '@kbn/core/server';
import { elasticsearchServiceMock, httpServerMock } from '@kbn/core/server/mocks';
import {
  deriveInternalCallerAttestation,
  HTTPAuthorizationHeader,
  UIAM_INTERNAL_CALLER_ATTESTATION_HEADER,
} from '@kbn/core-security-server';

import type { MockAuthenticationProviderOptions } from './base.mock';
import { mockAuthenticationProviderOptions } from './base.mock';
import { HTTPAuthenticationProvider } from './http';
import { ES_CLIENT_AUTHENTICATION_HEADER } from '../../../common/constants';
import { mockAuthenticatedUser } from '../../../common/model/authenticated_user.mock';
import { securityMock } from '../../mocks';
import { ROUTE_TAG_ACCEPT_JWT, ROUTE_TAG_ACCEPT_UIAM_OAUTH } from '../../routes/tags';
import { ServiceAccountFakeRequests } from '../../service_accounts/fake_requests';
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

    expect(() => new HTTPAuthenticationProvider(providerOptions, undefined as any)).toThrow(
      'Supported schemes should be specified'
    );
    expect(() => new HTTPAuthenticationProvider(providerOptions, {} as any)).toThrow(
      'Supported schemes should be specified'
    );
    expect(
      () => new HTTPAuthenticationProvider(providerOptions, { supportedSchemes: new Set() })
    ).toThrow('Supported schemes should be specified');
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

        // Headers above are passed in as-is and lowercased here because the provider only ever
        // emits a lowercase http_authentication_scheme; Core's xsrf handler (lifecycle_handlers.ts)
        // doesn't implement its own case normalization and relies on that contract.
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

    it.each([undefined, 'valid-attestation', 'forged-attestation'])(
      'does not warn or verify attestations on ordinary routes: %s',
      async (attestation) => {
        const { uiam, client, logger } = mockOptionsWithUiam;
        if (!uiam) throw new Error('Expected UIAM');
        const request = httpServerMock.createKibanaRequest({
          headers: {
            authorization: 'Bearer essu_service_account_token',
            ...(attestation === undefined
              ? {}
              : { [UIAM_INTERNAL_CALLER_ATTESTATION_HEADER]: attestation }),
          },
        });
        const scopedClient = elasticsearchServiceMock.createScopedClusterClient();
        scopedClient.asCurrentUser.security.authenticate.mockResponse(mockAuthenticatedUser());
        client.asScoped.mockReturnValue(scopedClient);
        const provider = new HTTPAuthenticationProvider(mockOptionsWithUiam, {
          supportedSchemes: new Set(['bearer']),
        });
        expect((await provider.authenticate(request)).succeeded()).toBe(true);
        expect(logger.warn).not.toHaveBeenCalled();
        expect(uiam.getInternalCallerAttestationHeaders).not.toHaveBeenCalled();
        expect(uiam.exchangeOAuthToken).not.toHaveBeenCalled();
        expectAuthenticateCall(client, request);
      }
    );

    it('authenticates a verified service-account caller directly on an OAuth-tagged route', async () => {
      const { uiam, client } = mockOptionsWithUiam;
      if (!uiam) throw new Error('Expected UIAM');
      const header = 'Bearer essu_service_account_token';
      uiam.getInternalCallerAttestationHeaders.mockReturnValue({
        [UIAM_INTERNAL_CALLER_ATTESTATION_HEADER]: 'valid-attestation',
      });
      const request = httpServerMock.createKibanaRequest({
        headers: {
          authorization: header,
          [UIAM_INTERNAL_CALLER_ATTESTATION_HEADER]: 'valid-attestation',
        },
        routeTags: [ROUTE_TAG_ACCEPT_UIAM_OAUTH],
      });
      const scopedClient = elasticsearchServiceMock.createScopedClusterClient();
      scopedClient.asCurrentUser.security.authenticate.mockResponse(mockAuthenticatedUser());
      client.asScoped.mockReturnValue(scopedClient);
      const provider = new HTTPAuthenticationProvider(mockOptionsWithUiam, {
        supportedSchemes: new Set(['bearer']),
      });
      const result = await provider.authenticate(request);
      expect(result.succeeded()).toBe(true);
      expect(result.authHeaders).toEqual({ authorization: header });
      expect(uiam.exchangeOAuthToken).not.toHaveBeenCalled();
      expect(uiam.getInternalCallerAttestationHeaders).toHaveBeenCalledWith(
        expect.objectContaining({ credentials: 'essu_service_account_token' })
      );
      expectAuthenticateCall(client, request);
    });

    it('authenticates service-account loopback credentials before and after refresh', async () => {
      const { uiam, client, logger } = mockOptionsWithUiam;
      if (!uiam) throw new Error('Expected UIAM');
      uiam.getInternalCallerAttestationHeaders.mockImplementation((credential) => ({
        [UIAM_INTERNAL_CALLER_ATTESTATION_HEADER]: deriveInternalCallerAttestation(
          'shared-secret',
          credential
        ),
      }));
      const mintToken = jest
        .fn()
        .mockResolvedValueOnce('essu_service_account_initial')
        .mockResolvedValueOnce('essu_service_account_replacement');
      const registry = new ServiceAccountFakeRequests(logger, mintToken, 600_000);
      const fakeRequest = await registry.create({ serviceAccountId: 'service-account' });
      const scopedClient = elasticsearchServiceMock.createScopedClusterClient();
      scopedClient.asCurrentUser.security.authenticate.mockResponse(mockAuthenticatedUser());
      client.asScoped.mockReturnValue(scopedClient);
      const provider = new HTTPAuthenticationProvider(mockOptionsWithUiam, {
        supportedSchemes: new Set(['bearer']),
      });
      const attestations: string[] = [];

      for (const token of ['essu_service_account_initial', 'essu_service_account_replacement']) {
        const credential = HTTPAuthorizationHeader.parseFromRequest(fakeRequest);
        if (!credential) throw new Error('Expected service-account credential');
        expect(credential.credentials).toBe(token);
        // Loopback consumers derive these headers at send time, separately from authorization.
        const headers = uiam.getInternalCallerAttestationHeaders(credential);
        attestations.push(headers[UIAM_INTERNAL_CALLER_ATTESTATION_HEADER]);
        const { authorization } = fakeRequest.headers;
        if (typeof authorization !== 'string') throw new Error('Expected authorization header');
        const request = httpServerMock.createKibanaRequest({
          headers: { authorization, ...headers },
          routeTags: [ROUTE_TAG_ACCEPT_UIAM_OAUTH],
        });
        const result = await provider.authenticate(request);
        expect(result.succeeded()).toBe(true);
        expect(result.authHeaders).toEqual({ authorization: `Bearer ${token}` });
        expect(client.asScoped).toHaveBeenLastCalledWith(request);
        if (token === 'essu_service_account_initial') {
          await registry.ensureFreshToken(fakeRequest, 0);
        }
      }

      expect(attestations[0]).not.toBe(attestations[1]);
      expect(mintToken).toHaveBeenCalledTimes(2);
      expect(uiam.exchangeOAuthToken).not.toHaveBeenCalled();
      expect(scopedClient.asCurrentUser.security.authenticate).toHaveBeenCalledTimes(2);
    });

    it.each([undefined, '', 'short', 'false-attestation', ['valid-attestation']])(
      'keeps OAuth exchange for missing or invalid attestation on tagged routes: %j',
      async (attestation) => {
        const { uiam, client } = mockOptionsWithUiam;
        if (!uiam) throw new Error('Expected UIAM');
        uiam.getInternalCallerAttestationHeaders.mockReturnValue({
          [UIAM_INTERNAL_CALLER_ATTESTATION_HEADER]: 'valid-attestation',
        });
        uiam.exchangeOAuthToken.mockResolvedValue('essu_ephemeral_token');
        const request = httpServerMock.createKibanaRequest({
          routeTags: [ROUTE_TAG_ACCEPT_UIAM_OAUTH],
        });
        Object.defineProperty(request, 'headers', {
          value: {
            authorization: 'Bearer essu_oauth_token',
            ...(attestation === undefined
              ? {}
              : { [UIAM_INTERNAL_CALLER_ATTESTATION_HEADER]: attestation }),
          },
        });
        const scopedClient = elasticsearchServiceMock.createScopedClusterClient();
        scopedClient.asCurrentUser.security.authenticate.mockResponse(mockAuthenticatedUser());
        client.asScoped.mockReturnValue(scopedClient);
        const provider = new HTTPAuthenticationProvider(mockOptionsWithUiam, {
          supportedSchemes: new Set(['bearer']),
        });
        expect((await provider.authenticate(request)).succeeded()).toBe(true);
        expect(uiam.exchangeOAuthToken).toHaveBeenCalledWith('essu_oauth_token');
      }
    );

    it('does not bypass OAuth exchange with an attestation bound to another credential', async () => {
      const { uiam, client } = mockOptionsWithUiam;
      if (!uiam) throw new Error('Expected UIAM');
      uiam.getInternalCallerAttestationHeaders.mockImplementation((credential) => ({
        [UIAM_INTERNAL_CALLER_ATTESTATION_HEADER]: deriveInternalCallerAttestation(
          'shared-secret',
          credential
        ),
      }));
      uiam.exchangeOAuthToken.mockResolvedValue('essu_ephemeral_token');
      const request = httpServerMock.createKibanaRequest({
        headers: {
          authorization: 'Bearer essu_oauth_token',
          [UIAM_INTERNAL_CALLER_ATTESTATION_HEADER]: deriveInternalCallerAttestation(
            'shared-secret',
            new HTTPAuthorizationHeader('Bearer', 'essu_other_token')
          ),
        },
        routeTags: [ROUTE_TAG_ACCEPT_UIAM_OAUTH],
      });
      const scopedClient = elasticsearchServiceMock.createScopedClusterClient();
      scopedClient.asCurrentUser.security.authenticate.mockResponse(mockAuthenticatedUser());
      client.asScoped.mockReturnValue(scopedClient);
      const provider = new HTTPAuthenticationProvider(mockOptionsWithUiam, {
        supportedSchemes: new Set(['bearer']),
      });
      expect((await provider.authenticate(request)).succeeded()).toBe(true);
      expect(uiam.exchangeOAuthToken).toHaveBeenCalledWith('essu_oauth_token');
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
