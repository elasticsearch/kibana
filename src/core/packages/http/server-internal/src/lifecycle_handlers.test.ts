/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  KibanaRequest,
  RouteMethod,
  KibanaRouteOptions,
  OnPreResponseToolkit,
  OnPostAuthToolkit,
  OnPreRoutingToolkit,
  OnPreAuthToolkit,
  OnPostAuthHandler,
  OnPreResponseInfo,
  GetAuthState,
} from '@kbn/core-http-server';
import { AuthStatus } from '@kbn/core-http-server';
import { mockRouter } from '@kbn/core-http-router-server-mocks';
import {
  INTERNAL_API_RESTRICTED_LOGGER_NAME,
  createBuildNrMismatchLoggerPreResponseHandler,
  createCustomHeadersPreResponseHandler,
  createDeprecationWarningHeaderPreResponseHandler,
  createExcludeRoutesPreAuthHandler,
  createRestrictInternalRoutesPostAuthHandler,
  createVersionCheckPostAuthHandler,
  createXsrfPostAuthHandler,
} from './lifecycle_handlers';

import type { HttpConfig } from './http_config';
import { loggerMock } from '@kbn/logging-mocks';
import type { Logger } from '@kbn/logging';
import { KIBANA_BUILD_NR_HEADER } from '@kbn/core-http-common';
import type { AuthenticatedUser } from '@kbn/core-security-common';

const createGetAuthState = (user?: Partial<AuthenticatedUser>): GetAuthState => {
  return jest
    .fn()
    .mockReturnValue(
      user
        ? { status: AuthStatus.authenticated, state: { http_authentication_scheme: null, ...user } }
        : { status: AuthStatus.unauthenticated, state: null }
    );
};

type ToolkitMock = jest.Mocked<OnPreResponseToolkit & OnPostAuthToolkit & OnPreRoutingToolkit>;
type PreAuthToolkitMock = jest.Mocked<OnPreAuthToolkit>;

const createConfig = (partial: Partial<HttpConfig>): HttpConfig => partial as HttpConfig;

const createToolkit = (): ToolkitMock => {
  return {
    render: jest.fn(),
    next: jest.fn(),
    rewriteUrl: jest.fn(),
    authzResultNext: jest.fn(),
  };
};

const createPreAuthToolkit = (): PreAuthToolkitMock => {
  return {
    next: jest.fn(),
  };
};

const forgeRequest = ({
  headers = {},
  query = {},
  path = '/',
  method = 'get',
  kibanaRouteOptions,
  buildNr,
}: Partial<{
  headers: Record<string, string>;
  query: Record<string, string>;
  path: string;
  method: RouteMethod;
  kibanaRouteOptions: KibanaRouteOptions;
  buildNr: undefined | string;
}>): KibanaRequest => {
  if (buildNr) {
    headers[KIBANA_BUILD_NR_HEADER] = buildNr;
  }
  return mockRouter.createKibanaRequest({
    headers,
    path,
    query,
    method,
    kibanaRouteOptions,
  });
};

afterEach(() => {
  jest.clearAllMocks();
});

describe('xsrf post-auth handler', () => {
  let toolkit: ToolkitMock;
  let responseFactory: ReturnType<typeof mockRouter.createResponseFactory>;

  beforeEach(() => {
    toolkit = createToolkit();
    responseFactory = mockRouter.createResponseFactory();
  });

  describe('non destructive methods', () => {
    it('accepts requests without version or xsrf header', () => {
      const config = createConfig({
        xsrf: { allowlist: [], disableProtection: false, allowedSchemes: [] },
      });
      const handler = createXsrfPostAuthHandler(config, createGetAuthState());
      const request = forgeRequest({ method: 'get', headers: {} });

      toolkit.next.mockReturnValue('next' as any);

      const result = handler(request, responseFactory, toolkit);

      expect(responseFactory.badRequest).not.toHaveBeenCalled();
      expect(toolkit.next).toHaveBeenCalledTimes(1);
      expect(result).toEqual('next');
    });
  });

  describe('destructive methods', () => {
    it('accepts requests with xsrf header', () => {
      const config = createConfig({
        xsrf: { allowlist: [], disableProtection: false, allowedSchemes: [] },
      });
      const handler = createXsrfPostAuthHandler(config, createGetAuthState());
      const request = forgeRequest({ method: 'post', headers: { 'kbn-xsrf': 'xsrf' } });

      toolkit.next.mockReturnValue('next' as any);

      const result = handler(request, responseFactory, toolkit);

      expect(responseFactory.badRequest).not.toHaveBeenCalled();
      expect(toolkit.next).toHaveBeenCalledTimes(1);
      expect(result).toEqual('next');
    });

    it('accepts requests with version header', () => {
      const config = createConfig({
        xsrf: { allowlist: [], disableProtection: false, allowedSchemes: [] },
      });
      const handler = createXsrfPostAuthHandler(config, createGetAuthState());
      const request = forgeRequest({ method: 'post', headers: { 'kbn-version': 'some-version' } });

      toolkit.next.mockReturnValue('next' as any);

      const result = handler(request, responseFactory, toolkit);

      expect(responseFactory.badRequest).not.toHaveBeenCalled();
      expect(toolkit.next).toHaveBeenCalledTimes(1);
      expect(result).toEqual('next');
    });

    it('returns a bad request if called without xsrf or version header', () => {
      const config = createConfig({
        xsrf: { allowlist: [], disableProtection: false, allowedSchemes: [] },
      });
      const handler = createXsrfPostAuthHandler(config, createGetAuthState());
      const request = forgeRequest({ method: 'post' });

      responseFactory.badRequest.mockReturnValue('badRequest' as any);

      const result = handler(request, responseFactory, toolkit);

      expect(toolkit.next).not.toHaveBeenCalled();
      expect(responseFactory.badRequest).toHaveBeenCalledTimes(1);
      expect(responseFactory.badRequest.mock.calls[0][0]).toMatchInlineSnapshot(`
        Object {
          "body": "Request must contain a kbn-xsrf header.",
        }
      `);
      expect(result).toEqual('badRequest');
    });

    it('accepts requests if protection is disabled', () => {
      const config = createConfig({
        xsrf: { allowlist: [], disableProtection: true, allowedSchemes: [] },
      });
      const handler = createXsrfPostAuthHandler(config, createGetAuthState());
      const request = forgeRequest({ method: 'post', headers: {} });

      toolkit.next.mockReturnValue('next' as any);

      const result = handler(request, responseFactory, toolkit);

      expect(responseFactory.badRequest).not.toHaveBeenCalled();
      expect(toolkit.next).toHaveBeenCalledTimes(1);
      expect(result).toEqual('next');
    });

    it('accepts requests if path is allowlisted', () => {
      const config = createConfig({
        xsrf: {
          allowlist: ['/some-path'],
          disableProtection: false,
          allowedSchemes: [],
        },
      });
      const handler = createXsrfPostAuthHandler(config, createGetAuthState());
      const request = forgeRequest({ method: 'post', headers: {}, path: '/some-path' });

      toolkit.next.mockReturnValue('next' as any);

      const result = handler(request, responseFactory, toolkit);

      expect(responseFactory.badRequest).not.toHaveBeenCalled();
      expect(toolkit.next).toHaveBeenCalledTimes(1);
      expect(result).toEqual('next');
    });

    it('accepts requests if xsrf protection on a route is disabled', () => {
      const config = createConfig({
        xsrf: { allowlist: [], disableProtection: false, allowedSchemes: [] },
      });
      const handler = createXsrfPostAuthHandler(config, createGetAuthState());
      const request = forgeRequest({
        method: 'post',
        headers: {},
        path: '/some-path',
        kibanaRouteOptions: {
          xsrfRequired: false,
          access: 'internal',
        },
      });

      toolkit.next.mockReturnValue('next' as any);

      const result = handler(request, responseFactory, toolkit);

      expect(responseFactory.badRequest).not.toHaveBeenCalled();
      expect(toolkit.next).toHaveBeenCalledTimes(1);
      expect(result).toEqual('next');
    });
  });

  describe('allowedSchemes', () => {
    const apikeyBearerConfig = createConfig({
      xsrf: { allowlist: [], disableProtection: false, allowedSchemes: ['apikey', 'bearer'] },
    });
    const apikeyOnlyConfig = createConfig({
      xsrf: { allowlist: [], disableProtection: false, allowedSchemes: ['apikey'] },
    });
    const bearerOnlyConfig = createConfig({
      xsrf: { allowlist: [], disableProtection: false, allowedSchemes: ['bearer'] },
    });
    const noSchemesConfig = createConfig({
      xsrf: { allowlist: [], disableProtection: false, allowedSchemes: [] },
    });

    it.each([
      {
        label: 'apikey scheme, POST',
        config: apikeyBearerConfig,
        scheme: 'apikey',
        method: 'post' as RouteMethod,
      },
      {
        label: 'bearer scheme, POST',
        config: apikeyBearerConfig,
        scheme: 'bearer',
        method: 'post' as RouteMethod,
      },
      {
        label: 'apikey scheme, DELETE',
        config: apikeyBearerConfig,
        scheme: 'apikey',
        method: 'delete' as RouteMethod,
      },
      {
        label: 'apikey scheme, POST (kbn-xsrf also present)',
        config: apikeyBearerConfig,
        scheme: 'apikey',
        method: 'post' as RouteMethod,
        extraHeaders: { 'kbn-xsrf': 'xsrf' },
      },
      {
        label: 'mixed-case incoming scheme, POST',
        config: apikeyBearerConfig,
        scheme: 'ApiKey',
        method: 'post' as RouteMethod,
      },
      {
        label: 'apikey scheme when only apikey is allowed',
        config: apikeyOnlyConfig,
        scheme: 'apikey',
        method: 'post' as RouteMethod,
      },
      {
        label: 'bearer scheme when only bearer is allowed',
        config: bearerOnlyConfig,
        scheme: 'bearer',
        method: 'post' as RouteMethod,
      },
    ])('accepts $label', ({ config, scheme, method, extraHeaders }) => {
      const handler = createXsrfPostAuthHandler(
        config,
        createGetAuthState({ http_authentication_scheme: scheme })
      );
      const request = forgeRequest({ method, headers: extraHeaders ?? {} });

      toolkit.next.mockReturnValue('next' as any);

      const result = handler(request, responseFactory, toolkit);

      expect(responseFactory.badRequest).not.toHaveBeenCalled();
      expect(toolkit.next).toHaveBeenCalledTimes(1);
      expect(result).toEqual('next');
    });

    it('exempts a safe (GET) request regardless of the authentication scheme', () => {
      const handler = createXsrfPostAuthHandler(
        apikeyBearerConfig,
        createGetAuthState({ http_authentication_scheme: 'basic' })
      );
      const request = forgeRequest({ method: 'get', headers: {} });

      toolkit.next.mockReturnValue('next' as any);

      const result = handler(request, responseFactory, toolkit);

      expect(responseFactory.badRequest).not.toHaveBeenCalled();
      expect(toolkit.next).toHaveBeenCalledTimes(1);
      expect(result).toEqual('next');
    });

    it.each([
      {
        label: 'basic scheme, apikey and bearer allowed',
        config: apikeyBearerConfig,
        getAuthState: () => createGetAuthState({ http_authentication_scheme: 'basic' }),
      },
      {
        label: 'apikey scheme, no schemes allowed',
        config: noSchemesConfig,
        getAuthState: () => createGetAuthState({ http_authentication_scheme: 'apikey' }),
      },
      {
        label: 'bearer scheme, only apikey allowed',
        config: apikeyOnlyConfig,
        getAuthState: () => createGetAuthState({ http_authentication_scheme: 'bearer' }),
      },
      {
        label: 'apikey scheme, only bearer allowed',
        config: bearerOnlyConfig,
        getAuthState: () => createGetAuthState({ http_authentication_scheme: 'apikey' }),
      },
      {
        label: 'unauthenticated request, apikey and bearer allowed',
        config: apikeyBearerConfig,
        getAuthState: () => createGetAuthState(), // unauthenticated
      },
      {
        label: 'null scheme, apikey and bearer allowed',
        config: apikeyBearerConfig,
        getAuthState: () => createGetAuthState({ http_authentication_scheme: null }),
      },
      {
        label: 'authenticated status but null state object',
        config: apikeyBearerConfig,
        getAuthState: (): GetAuthState =>
          jest.fn().mockReturnValue({ status: AuthStatus.authenticated, state: null }),
      },
      {
        label: 'http_authentication_scheme missing from state',
        config: apikeyBearerConfig,
        getAuthState: (): GetAuthState =>
          jest.fn().mockReturnValue({
            status: AuthStatus.authenticated,
            // Simulates minimal-auth proxy where http_authentication_scheme is not present
            state: { username: 'test' } as any,
          }),
      },
    ])('rejects POST when $label', ({ config, getAuthState }) => {
      const handler = createXsrfPostAuthHandler(config, getAuthState());
      const request = forgeRequest({ method: 'post', headers: {} });

      responseFactory.badRequest.mockReturnValue('badRequest' as any);

      const result = handler(request, responseFactory, toolkit);

      expect(toolkit.next).not.toHaveBeenCalled();
      expect(responseFactory.badRequest).toHaveBeenCalledTimes(1);
      expect(result).toEqual('badRequest');
    });
  });
});

describe('excludeRoutes pre-auth handler', () => {
  let toolkit: PreAuthToolkitMock;
  let responseFactory: ReturnType<typeof mockRouter.createResponseFactory>;
  let logger: jest.Mocked<Logger>;

  beforeEach(() => {
    toolkit = createPreAuthToolkit();
    responseFactory = mockRouter.createResponseFactory();
    logger = loggerMock.create();
  });

  it('forwards when no excluded routes are configured', () => {
    const handler = createExcludeRoutesPreAuthHandler(createConfig({ excludeRoutes: [] }), logger);
    const request = forgeRequest({ path: '/api/status' });

    toolkit.next.mockReturnValue('next' as any);

    const result = handler(request, responseFactory, toolkit);

    expect(toolkit.next).toHaveBeenCalledTimes(1);
    expect(responseFactory.notFound).not.toHaveBeenCalled();
    expect(result).toBe('next');
  });

  it('returns notFound when a route is excluded', () => {
    const handler = createExcludeRoutesPreAuthHandler(
      createConfig({ excludeRoutes: ['/api/status'] }),
      logger
    );
    const request = forgeRequest({ path: '/api/status' });

    responseFactory.notFound.mockReturnValue('notFound' as any);

    const result = handler(request, responseFactory, toolkit);

    expect(toolkit.next).not.toHaveBeenCalled();
    expect(responseFactory.notFound).toHaveBeenCalledTimes(1);
    expect(result).toBe('notFound');
  });
});

describe('versionCheck post-auth handler', () => {
  let toolkit: ToolkitMock;
  let responseFactory: ReturnType<typeof mockRouter.createResponseFactory>;

  beforeEach(() => {
    toolkit = createToolkit();
    responseFactory = mockRouter.createResponseFactory();
  });

  it('forward the request to the next interceptor if header matches', () => {
    const handler = createVersionCheckPostAuthHandler('actual-version');
    const request = forgeRequest({ headers: { 'kbn-version': 'actual-version' } });

    toolkit.next.mockReturnValue('next' as any);

    const result = handler(request, responseFactory, toolkit);

    expect(toolkit.next).toHaveBeenCalledTimes(1);
    expect(responseFactory.badRequest).not.toHaveBeenCalled();
    expect(result).toBe('next');
  });

  it('returns a badRequest error if header does not match', () => {
    const handler = createVersionCheckPostAuthHandler('actual-version');
    const request = forgeRequest({ headers: { 'kbn-version': 'another-version' } });

    responseFactory.badRequest.mockReturnValue('badRequest' as any);

    const result = handler(request, responseFactory, toolkit);

    expect(toolkit.next).not.toHaveBeenCalled();
    expect(responseFactory.badRequest).toHaveBeenCalledTimes(1);
    expect(responseFactory.badRequest.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "body": Object {
          "attributes": Object {
            "expected": "actual-version",
            "got": "another-version",
          },
          "message": "Browser client is out of date, please refresh the page (\\"kbn-version\\" header was \\"another-version\\" but should be \\"actual-version\\")",
        },
      }
    `);
    expect(result).toBe('badRequest');
  });

  it('forward the request to the next interceptor if header is not present', () => {
    const handler = createVersionCheckPostAuthHandler('actual-version');
    const request = forgeRequest({ headers: {} });

    toolkit.next.mockReturnValue('next' as any);

    const result = handler(request, responseFactory, toolkit);

    expect(toolkit.next).toHaveBeenCalledTimes(1);
    expect(responseFactory.badRequest).not.toHaveBeenCalled();
    expect(result).toBe('next');
  });
});

describe('restrictInternal post-auth handler', () => {
  let toolkit: ToolkitMock;
  let responseFactory: ReturnType<typeof mockRouter.createResponseFactory>;
  let logger: jest.Mocked<Logger>;
  let config: HttpConfig;

  beforeEach(() => {
    toolkit = createToolkit();
    responseFactory = mockRouter.createResponseFactory();
    logger = loggerMock.create();
    config = createConfig({
      name: 'my-server-name',
      restrictInternalApis: true,
    });
  });

  const createForgeRequest = (
    access: 'internal' | 'public',
    headers: Record<string, string> | undefined = {},
    query: Record<string, string> | undefined = {}
  ) => {
    return forgeRequest({
      method: 'get',
      headers,
      query,
      path: `/${access}/some-path`,
      kibanaRouteOptions: {
        xsrfRequired: false,
        access,
      },
    });
  };

  const createForwardSuccess = (handler: OnPostAuthHandler, request: KibanaRequest) => {
    toolkit.next.mockReturnValue('next' as any);
    const result = handler(request, responseFactory, toolkit);

    expect(toolkit.next).toHaveBeenCalledTimes(1);
    expect(responseFactory.badRequest).not.toHaveBeenCalled();
    expect(result).toBe('next');
  };

  it('injects a logger prefix', () => {
    createRestrictInternalRoutesPostAuthHandler(config, logger);
    expect(logger.get).toHaveBeenCalledTimes(1);
    expect(logger.get).toHaveBeenCalledWith(`server`, INTERNAL_API_RESTRICTED_LOGGER_NAME);
  });

  it('when enabled, does not log deprecation warning for internal API access restriction', () => {
    createRestrictInternalRoutesPostAuthHandler(config, logger);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('when enabled, returns a bad request if called without internal origin header for internal API', () => {
    const handler = createRestrictInternalRoutesPostAuthHandler(config, logger);
    const request = createForgeRequest('internal');

    responseFactory.badRequest.mockReturnValue('badRequest' as any);

    const result = handler(request, responseFactory, toolkit);

    expect(toolkit.next).not.toHaveBeenCalled();
    expect(responseFactory.badRequest.mock.calls[0][0]?.body).toMatchInlineSnapshot(
      `"uri [/internal/some-path] with method [get] exists but is not available with the current configuration"`
    );
    expect(result).toBe('badRequest');
  });

  it('when enabled, forward the request to the next interceptor if called with internal origin header for internal API', () => {
    const handler = createRestrictInternalRoutesPostAuthHandler(config, logger);
    const request = createForgeRequest('internal', { 'x-elastic-internal-origin': 'Kibana' });
    createForwardSuccess(handler, request);
  });

  it('when enabled, forward the request to the next interceptor if called with internal origin header for public APIs', () => {
    const handler = createRestrictInternalRoutesPostAuthHandler(config, logger);
    const request = createForgeRequest('public', { 'x-elastic-internal-origin': 'Kibana' });
    createForwardSuccess(handler, request);
  });

  it('when enabled, forward the request to the next interceptor if called without internal origin header for public APIs', () => {
    const handler = createRestrictInternalRoutesPostAuthHandler(config, logger);
    const request = createForgeRequest('public');
    createForwardSuccess(handler, request);
  });

  it('when enabled, forward the request to the next interceptor if called with internal origin query param for internal API', () => {
    const handler = createRestrictInternalRoutesPostAuthHandler(config, logger);
    const request = createForgeRequest('internal', undefined, { elasticInternalOrigin: 'true' });
    createForwardSuccess(handler, request);
  });

  it('when enabled, forward the request to the next interceptor if called with internal origin query param for public APIs', () => {
    const handler = createRestrictInternalRoutesPostAuthHandler(config, logger);
    const request = createForgeRequest('internal', undefined, { elasticInternalOrigin: 'true' });
    createForwardSuccess(handler, request);
  });

  it('when enabled, forward the request to the next interceptor if called without internal origin query param for public APIs', () => {
    const handler = createRestrictInternalRoutesPostAuthHandler(config, logger);
    const request = createForgeRequest('public');
    createForwardSuccess(handler, request);
  });

  it('when not enabled, logs deprecation warning for internal API access restriction', () => {
    const handler = createRestrictInternalRoutesPostAuthHandler(
      { ...config, restrictInternalApis: false },
      logger
    );
    const request = createForgeRequest('internal');
    createForwardSuccess(handler, request);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      `Access to uri [/internal/some-path] with method [get] is deprecated`
    );
  });

  it('when not enabled, forward the request to the next interceptor if called without internal origin header for internal APIs', () => {
    const handler = createRestrictInternalRoutesPostAuthHandler(
      { ...config, restrictInternalApis: false },
      logger
    );
    const request = createForgeRequest('internal');
    createForwardSuccess(handler, request);
  });

  it('when not enabled, forward the request to the next interceptor if called with internal origin header for internal API', () => {
    const handler = createRestrictInternalRoutesPostAuthHandler(
      { ...config, restrictInternalApis: false },
      logger
    );
    const request = createForgeRequest('internal', { 'x-elastic-internal-origin': 'Kibana' });
    createForwardSuccess(handler, request);
  });

  it('when not enabled, forward the request to the next interceptor if called without internal origin header for public APIs', () => {
    const handler = createRestrictInternalRoutesPostAuthHandler(
      { ...config, restrictInternalApis: false },
      logger
    );
    const request = createForgeRequest('public');
    createForwardSuccess(handler, request);
  });

  it('when not enabled, forward the request to the next interceptor if called with internal origin header for public APIs', () => {
    const handler = createRestrictInternalRoutesPostAuthHandler(
      { ...config, restrictInternalApis: false },
      logger
    );
    const request = createForgeRequest('public', { 'x-elastic-internal-origin': 'Kibana' });
    createForwardSuccess(handler, request);
  });

  it('overrides internal api when elasticInternalOrigin=false is set explicitly', () => {
    const handler = createRestrictInternalRoutesPostAuthHandler(
      { ...config, restrictInternalApis: true },
      logger
    );

    // Will be treated as external
    const request = createForgeRequest(
      'internal',
      { 'x-elastic-internal-origin': 'Kibana' },
      { elasticInternalOrigin: 'false' }
    );

    responseFactory.badRequest.mockReturnValue('badRequest' as any);

    const result = handler(request, responseFactory, toolkit);

    expect(toolkit.next).not.toHaveBeenCalled();
    expect(responseFactory.badRequest).toHaveBeenCalledTimes(1);
    expect(responseFactory.badRequest.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "body": "uri [/internal/some-path] with method [get] exists but is not available with the current configuration",
      }
    `);
    expect(result).toEqual('badRequest');
  });
});

describe('customHeaders pre-response handler', () => {
  let toolkit: ToolkitMock;

  beforeEach(() => {
    toolkit = createToolkit();
  });

  it('adds the kbn-name and Content-Security-Policy headers to the response', () => {
    const config = createConfig({
      name: 'my-server-name',
      csp: {
        strict: true,
        warnLegacyBrowsers: true,
        disableEmbedding: true,
        header: 'foo',
        reportOnlyHeader: 'bar',
      },
    });
    const handler = createCustomHeadersPreResponseHandler(config as HttpConfig);

    handler({} as any, {} as any, toolkit);

    expect(toolkit.next).toHaveBeenCalledTimes(1);
    expect(toolkit.next).toHaveBeenCalledWith({
      headers: {
        'Content-Security-Policy': 'foo',
        'Content-Security-Policy-Report-Only': 'bar',
        'kbn-name': 'my-server-name',
      },
    });
  });

  it('adds the security headers and custom headers defined in the configuration', () => {
    const config = createConfig({
      name: 'my-server-name',
      csp: {
        strict: true,
        warnLegacyBrowsers: true,
        disableEmbedding: true,
        header: 'foo',
        reportOnlyHeader: 'bar',
      },
      securityResponseHeaders: {
        headerA: 'value-A',
        headerB: 'value-B', // will be overridden by the custom response header below
      },
      customResponseHeaders: {
        headerB: 'x',
      },
    });
    const handler = createCustomHeadersPreResponseHandler(config as HttpConfig);

    handler({} as any, {} as any, toolkit);

    expect(toolkit.next).toHaveBeenCalledTimes(1);
    expect(toolkit.next).toHaveBeenCalledWith({
      headers: {
        'Content-Security-Policy': 'foo',
        'Content-Security-Policy-Report-Only': 'bar',
        'kbn-name': 'my-server-name',
        headerA: 'value-A',
        headerB: 'x',
      },
    });
  });

  it('do not allow overwrite of the kbn-name and Content-Security-Policy headers if defined in custom headders ', () => {
    const config = createConfig({
      name: 'my-server-name',
      csp: {
        strict: true,
        warnLegacyBrowsers: true,
        disableEmbedding: true,
        header: 'foo',
        reportOnlyHeader: 'bar',
      },
      customResponseHeaders: {
        'kbn-name': 'custom-name',
        'Content-Security-Policy': 'custom-csp',
        'Content-Security-Policy-Report-Only': 'bar',
        headerA: 'value-A',
        headerB: 'value-B',
      },
    });
    const handler = createCustomHeadersPreResponseHandler(config as HttpConfig);

    handler({} as any, {} as any, toolkit);

    expect(toolkit.next).toHaveBeenCalledTimes(1);
    expect(toolkit.next).toHaveBeenCalledWith({
      headers: {
        'kbn-name': 'my-server-name',
        'Content-Security-Policy': 'foo',
        'Content-Security-Policy-Report-Only': 'bar',
        headerA: 'value-A',
        headerB: 'value-B',
      },
    });
  });
});

describe('deprecation header pre-response handler', () => {
  let toolkit: ToolkitMock;

  beforeEach(() => {
    toolkit = createToolkit();
  });

  it('adds the deprecation warning header to the request going to a deprecated route', () => {
    const kibanaVersion = '19.73.41';
    const deprecationMessage = 'This is a deprecated endpoint message in the tests';
    const warningHeader = `299 Kibana-${kibanaVersion} "${encodeURIComponent(deprecationMessage)}"`;
    const handler = createDeprecationWarningHeaderPreResponseHandler(kibanaVersion);

    handler(
      { route: { options: { deprecated: { message: deprecationMessage } } } } as any,
      {} as any,
      toolkit
    );

    expect(toolkit.next).toHaveBeenCalledTimes(1);
    expect(toolkit.next).toHaveBeenCalledWith({
      headers: {
        warning: warningHeader,
      },
    });
  });

  it('does not add the deprecation warning header to the request going to a non-deprecated route', () => {
    const kibanaVersion = '19.73.41';
    const deprecationMessage = 'This is a deprecated endpoint message in the tests';
    const warningHeader = `299 Kibana-${kibanaVersion} "${encodeURIComponent(deprecationMessage)}"`;
    const handler = createDeprecationWarningHeaderPreResponseHandler(kibanaVersion);

    handler({ route: { options: { deprecated: {} } } } as any, {} as any, toolkit);

    expect(toolkit.next).toHaveBeenCalledTimes(1);
    expect(toolkit.next).not.toHaveBeenCalledWith({
      headers: {
        warning: warningHeader,
      },
    });
  });
});

describe('build number mismatch logger on error pre-response handler', () => {
  let logger: jest.Mocked<Logger>;

  beforeEach(() => {
    logger = loggerMock.create();
  });

  it('injects a logger prefix', () => {
    createBuildNrMismatchLoggerPreResponseHandler(123, logger);
    expect(logger.get).toHaveBeenCalledTimes(1);
    expect(logger.get).toHaveBeenCalledWith(`kbn-build-number-mismatch`);
  });

  it('does not log for same server-client build', () => {
    const handler = createBuildNrMismatchLoggerPreResponseHandler(123, logger);
    const request = forgeRequest({ buildNr: '123' });
    const response: OnPreResponseInfo = { statusCode: 500 }; // should log for errors, but not this time bc same build nr
    handler(request, response, createToolkit());
    expect(logger.warn).not.toHaveBeenCalled();
  });

  const badStatusCodeTestCases = [
    /** just test a few common ones */
    [400],
    [401],
    [403],
    [499],
    [500],
    [502],
    [999] /* and not so common... */,
  ];
  it.each(badStatusCodeTestCases)(
    'logs for %p responses and newer client builds',
    (responseStatusCode) => {
      const handler = createBuildNrMismatchLoggerPreResponseHandler(123, logger);
      const request = forgeRequest({ buildNr: '124' });
      const response: OnPreResponseInfo = { statusCode: responseStatusCode };
      handler(request, response, createToolkit());
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        `Client build (124) is newer than this Kibana server build (123). The [${responseStatusCode}] error status in req id [123] may be due to client-server incompatibility!`
      );
    }
  );

  it.each(badStatusCodeTestCases)('logs for %p responses and older client builds', (statusCode) => {
    const handler = createBuildNrMismatchLoggerPreResponseHandler(123, logger);
    const request = forgeRequest({ buildNr: '122' });
    const response: OnPreResponseInfo = { statusCode };
    handler(request, response, createToolkit());
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      `Client build (122) is older than this Kibana server build (123). The [${statusCode}] error status in req id [123] may be due to client-server incompatibility!`
    );
  });

  it.each([[200], [201], [301], [302]])('does not log for %p responses', (statusCode) => {
    const handler = createBuildNrMismatchLoggerPreResponseHandler(123, logger);
    const request = forgeRequest({ buildNr: '124' });
    const response: OnPreResponseInfo = { statusCode };
    handler(request, response, createToolkit());
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([['foo'], [['yes']], [true], [null], [[]], [undefined]])(
    'ignores bogus client build numbers like %p',
    (bogusBuild) => {
      const handler = createBuildNrMismatchLoggerPreResponseHandler(123, logger);
      const request = forgeRequest({ buildNr: bogusBuild as any });
      const response: OnPreResponseInfo = { statusCode: 500 };
      handler(request, response, createToolkit());
      expect(logger.warn).not.toHaveBeenCalled();
    }
  );
});
