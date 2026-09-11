/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ResponseToolkit, ResponseObject } from '@hapi/hapi';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { isConfigSchema, schema } from '@kbn/config-schema';
import { createRequestMock } from '@kbn/hapi-mocks/src/request';
import { DeferredInitializationError } from '@kbn/core-deferred-init-common';
import { createFooValidation } from './router.test.util';
import { Router, type RouterOptions } from './router';
import type { RouteValidatorRequestAndResponses } from '@kbn/core-http-server';
import { getEnvOptions, createTestEnv } from '@kbn/config-mocks';

const mockResponse = {
  code: jest.fn().mockImplementation(() => mockResponse),
  header: jest.fn().mockImplementation(() => mockResponse),
} as unknown as jest.Mocked<ResponseObject>;

const mockResponseToolkit = {
  response: jest.fn().mockReturnValue(mockResponse),
} as unknown as jest.Mocked<ResponseToolkit>;

const logger = loggingSystemMock.create().get();
const enhanceWithContext = (fn: (...args: any[]) => any) => fn.bind(null, {});
const options = getEnvOptions();
options.cliArgs.dev = false;
const env = createTestEnv({ envOptions: options });

const routerOptions: RouterOptions = {
  env,
  versionedRouterOptions: {
    defaultHandlerResolutionStrategy: 'oldest',
    useVersionResolutionStrategyForInternalPaths: [],
  },
};

describe('Router', () => {
  let testValidation: ReturnType<typeof createFooValidation>;
  beforeEach(() => {
    testValidation = createFooValidation();
  });
  afterEach(() => jest.clearAllMocks());
  describe('#getRoutes', () => {
    it('returns expected route metadata', () => {
      const router = new Router('', logger, enhanceWithContext, routerOptions);
      const validation = schema.object({ foo: schema.string() });
      router.post(
        {
          path: '/',
          validate: { body: validation, query: validation, params: validation },
          security: {
            authz: {
              requiredPrivileges: ['foo'],
            },
          },
          options: {
            deprecated: {
              documentationUrl: 'https://fake-url.com',
              reason: { type: 'remove' },
              severity: 'warning',
            },
            discontinued: 'post test discontinued',
            summary: 'post test summary',
            description: 'post test description',
            availability: {
              since: '1.0.0',
              stability: 'experimental',
            },
          },
        },
        (context, req, res) => res.ok()
      );
      const routes = router.getRoutes();
      expect(routes).toHaveLength(1);
      const [route] = routes;
      expect(route).toMatchObject({
        handler: expect.any(Function),
        method: 'post',
        path: '/',
        validationSchemas: { body: validation, query: validation, params: validation },
        isVersioned: false,
        options: {
          deprecated: {
            documentationUrl: 'https://fake-url.com',
            reason: { type: 'remove' },
            severity: 'warning',
          },
          discontinued: 'post test discontinued',
          summary: 'post test summary',
          description: 'post test description',
          availability: {
            since: '1.0.0',
            stability: 'experimental',
          },
        },
      });
    });

    it('can exclude versioned routes', () => {
      const router = new Router('', logger, enhanceWithContext, routerOptions);
      const validation = schema.object({ foo: schema.string() });
      router.versioned
        .post({
          path: '/versioned',
          access: 'internal',
          security: {
            authz: {
              requiredPrivileges: ['foo'],
            },
          },
        })
        .addVersion({ version: '999', validate: false }, async (ctx, req, res) => res.ok());
      router.get(
        {
          path: '/unversioned',
          validate: { body: validation, query: validation, params: validation },
          security: {
            authz: {
              requiredPrivileges: ['foo'],
            },
          },
        },
        (context, req, res) => res.ok()
      );
      const routes = router.getRoutes({ excludeVersionedRoutes: true });
      expect(routes).toHaveLength(1);
      const [route] = routes;
      expect(route).toMatchObject({
        method: 'get',
        path: '/unversioned',
      });
    });
  });

  it.each([['static' as const], ['lazy' as const]])(
    'runs %s route validations',
    async (staticOrLazy) => {
      const { fooValidation } = testValidation;
      const router = new Router('', logger, enhanceWithContext, routerOptions);
      router.post(
        {
          path: '/',
          validate: staticOrLazy ? fooValidation : () => fooValidation,
          security: {
            authz: {
              requiredPrivileges: ['foo'],
            },
          },
        },
        (context, req, res) => res.ok()
      );
      const [{ handler }] = router.getRoutes();
      await handler(
        createRequestMock({
          params: { foo: '1' },
          query: { foo: '1' },
          payload: { foo: 1 },
        }),
        mockResponseToolkit
      );
      const { validateBodyFn, validateParamsFn, validateQueryFn, validateOutputFn } =
        testValidation;
      expect(validateBodyFn).toHaveBeenCalledTimes(1);
      expect(validateParamsFn).toHaveBeenCalledTimes(1);
      expect(validateQueryFn).toHaveBeenCalledTimes(1);
      expect(validateOutputFn).toHaveBeenCalledTimes(0);
    }
  );

  describe('elastic-api-version header', () => {
    it('adds the header to public, unversioned routes', async () => {
      const router = new Router('', logger, enhanceWithContext, routerOptions);
      router.post(
        {
          path: '/public',
          security: {
            authz: {
              requiredPrivileges: ['foo'],
            },
          },
          options: {
            access: 'public',
          },
          validate: false,
        },
        (context, req, res) => res.ok({ headers: { AAAA: 'test' } }) // with some fake headers
      );
      router.post(
        {
          path: '/internal',
          security: {
            authz: {
              requiredPrivileges: ['foo'],
            },
          },
          options: {
            access: 'internal',
          },
          validate: false,
        },
        (context, req, res) => res.ok()
      );
      const [{ handler: publicHandler }, { handler: internalHandler }] = router.getRoutes();

      await publicHandler(createRequestMock(), mockResponseToolkit);
      expect(mockResponse.header).toHaveBeenCalledTimes(2);
      const [first, second] = mockResponse.header.mock.calls
        .concat()
        .sort(([k1], [k2]) => k1.localeCompare(k2));
      expect(first).toEqual(['AAAA', 'test']);
      expect(second).toEqual(['elastic-api-version', '2023-10-31']);

      await internalHandler(createRequestMock(), mockResponseToolkit);
      expect(mockResponse.header).toHaveBeenCalledTimes(2); // no additional calls
    });

    it('does not add the header to public http resource routes', async () => {
      const router = new Router('', logger, enhanceWithContext, routerOptions);
      router.post(
        {
          path: '/public',
          security: {
            authz: {
              requiredPrivileges: ['foo'],
            },
          },
          options: {
            access: 'public',
          },
          validate: false,
        },
        (context, req, res) => res.ok()
      );
      router.post(
        {
          path: '/public-resource',
          security: {
            authz: {
              requiredPrivileges: ['foo'],
            },
          },
          options: {
            access: 'public',
            httpResource: true,
          },
          validate: false,
        },
        (context, req, res) => res.ok()
      );
      const [{ handler: publicHandler }, { handler: resourceHandler }] = router.getRoutes();

      await publicHandler(createRequestMock(), mockResponseToolkit);
      expect(mockResponse.header).toHaveBeenCalledTimes(1);
      const [headersTuple] = mockResponse.header.mock.calls;
      expect(headersTuple).toEqual(['elastic-api-version', '2023-10-31']);

      await resourceHandler(createRequestMock(), mockResponseToolkit);
      expect(mockResponse.header).toHaveBeenCalledTimes(1); // no additional calls
    });
  });

  it('constructs lazily provided validations once (idempotency)', async () => {
    const router = new Router('', logger, enhanceWithContext, routerOptions);
    const { fooValidation } = testValidation;

    const response200 = fooValidation.response[200].body;
    const lazyResponse200 = jest.fn(() => response200());
    fooValidation.response[200].body = lazyResponse200;

    const response404 = fooValidation.response[404].body;
    const lazyResponse404 = jest.fn(() => response404());
    fooValidation.response[404].body = lazyResponse404;

    const lazyValidation = jest.fn(() => fooValidation);
    router.post(
      {
        path: '/',
        security: {
          authz: {
            requiredPrivileges: ['foo'],
          },
        },
        validate: lazyValidation,
      },
      (context, req, res) => res.ok()
    );
    const [{ handler, validationSchemas }] = router.getRoutes();
    for (let i = 0; i < 10; i++) {
      await handler(
        createRequestMock({
          params: { foo: '1' },
          query: { foo: '1' },
          payload: { foo: 1 },
        }),
        mockResponseToolkit
      );

      expect(
        isConfigSchema(
          (
            validationSchemas as () => RouteValidatorRequestAndResponses<unknown, unknown, unknown>
          )().response![200].body!()
        )
      ).toBe(true);
      expect(
        isConfigSchema(
          (
            validationSchemas as () => RouteValidatorRequestAndResponses<unknown, unknown, unknown>
          )().response![404].body!()
        )
      ).toBe(true);
    }
    expect(lazyValidation).toHaveBeenCalledTimes(1);
    expect(lazyResponse200).toHaveBeenCalledTimes(1);
    expect(lazyResponse404).toHaveBeenCalledTimes(1);
  });

  it('registers pluginId if provided', () => {
    const pluginId = Symbol('test');
    const router = new Router('', logger, enhanceWithContext, { pluginId, env });
    expect(router.pluginId).toBe(pluginId);
  });

  describe('Options', () => {
    it('throws if validation for a route is not defined explicitly', () => {
      // Use dev mode to test eager schema construction and immediate error detection
      const devOptions = getEnvOptions();
      devOptions.cliArgs.dev = true;
      const devEnv = createTestEnv({ envOptions: devOptions });
      const devRouterOptions: RouterOptions = { ...routerOptions, env: devEnv };

      const router = new Router('', logger, enhanceWithContext, devRouterOptions);
      expect(
        // we use 'any' because validate is a required field
        () => router.get({ path: '/' } as any, (context, req, res) => res.ok({}))
      ).toThrowErrorMatchingInlineSnapshot(
        `"The [get] at [/] does not have a 'validate' specified. Use 'false' as the value if you want to bypass validation."`
      );
    });
    it('throws if validation for a route is declared wrong', () => {
      // Use dev mode to test eager schema construction and immediate error detection
      const devOptions = getEnvOptions();
      devOptions.cliArgs.dev = true;
      const devEnv = createTestEnv({ envOptions: devOptions });
      const devRouterOptions: RouterOptions = { ...routerOptions, env: devEnv };

      const router = new Router('', logger, enhanceWithContext, devRouterOptions);
      expect(() =>
        router.get(
          // we use 'any' because validate requires valid Type or function usage
          {
            path: '/',
            validate: { params: { validate: () => 'error' } } as any,
            security: {
              authz: {
                requiredPrivileges: ['foo'],
              },
            },
          },
          (context, req, res) => res.ok({})
        )
      ).toThrowErrorMatchingInlineSnapshot(
        `"Expected a valid validation logic declared with '@kbn/config-schema' package, '@kbn/zod' package or a RouteValidationFunction at key: [params]."`
      );
    });

    it('throws if route has security declared wrong', () => {
      const router = new Router('', logger, enhanceWithContext, routerOptions);
      expect(() =>
        router.get(
          // we use 'any' because validate requires valid Type or function usage
          {
            path: '/',
            validate: false,
            options: { security: { authz: { requiredPrivileges: [] } } } as any,
            security: {
              authz: {
                requiredPrivileges: ['foo'],
              },
            },
          },
          (context, req, res) => res.ok({})
        )
      ).toThrowErrorMatchingInlineSnapshot(
        `"\`options.security\` is not allowed in route config. Use \`security\` instead."`
      );
    });

    it('throws if options.body.output is not a valid value', () => {
      const router = new Router('', logger, enhanceWithContext, routerOptions);
      expect(() =>
        router.post(
          // we use 'any' because TS already checks we cannot provide this body.output
          {
            path: '/',
            options: { body: { output: 'file' } } as any, // We explicitly don't support 'file'
            validate: { body: schema.object({}, { unknowns: 'allow' }) },
            security: {
              authz: {
                requiredPrivileges: ['foo'],
              },
            },
          },
          (context, req, res) => res.ok({})
        )
      ).toThrowErrorMatchingInlineSnapshot(
        `"[options.body.output: 'file'] in route POST / is not valid. Only 'data' or 'stream' are valid."`
      );
    });

    it('throws if enabled security config is not valid', () => {
      const router = new Router('', logger, enhanceWithContext, routerOptions);
      expect(() =>
        router.get(
          {
            path: '/',
            validate: false,
            security: {
              authz: {
                requiredPrivileges: [],
              },
            },
          },
          (context, req, res) => res.ok({})
        )
      ).toThrowErrorMatchingInlineSnapshot(
        `"[authz.requiredPrivileges]: array size is [0], but cannot be smaller than [1]"`
      );
    });

    it('throws if disabled security config does not provide opt-out reason', () => {
      const router = new Router('', logger, enhanceWithContext, routerOptions);
      expect(() =>
        router.get(
          {
            path: '/',
            validate: false,
            security: {
              // @ts-expect-error
              authz: {
                enabled: false,
              },
            },
          },
          (context, req, res) => res.ok({})
        )
      ).toThrowErrorMatchingInlineSnapshot(
        `"[authz.reason]: expected value of type [string] but got [undefined]"`
      );
    });

    it('should default `output: "stream" and parse: false` when no body validation is required but not a GET', () => {
      const router = new Router('', logger, enhanceWithContext, routerOptions);
      router.post(
        {
          path: '/',
          validate: {},
          security: {
            authz: {
              requiredPrivileges: ['foo'],
            },
          },
        },
        (context, req, res) => res.ok({})
      );
      const [route] = router.getRoutes();
      expect(route.options).toEqual({ body: { output: 'stream', parse: false } });
    });

    it('should NOT default `output: "stream" and parse: false` when the user has specified body options (he cares about it)', () => {
      const router = new Router('', logger, enhanceWithContext, routerOptions);
      router.post(
        {
          path: '/',
          security: {
            authz: {
              requiredPrivileges: ['foo'],
            },
          },
          options: { body: { maxBytes: 1 } },
          validate: {},
        },
        (context, req, res) => res.ok({})
      );
      const [route] = router.getRoutes();
      expect(route.options).toEqual({ body: { maxBytes: 1 } });
    });

    it('should NOT default `output: "stream" and parse: false` when no body validation is required and GET', () => {
      const router = new Router('', logger, enhanceWithContext, routerOptions);
      router.get(
        {
          path: '/',
          validate: {},
          security: {
            authz: {
              requiredPrivileges: ['foo'],
            },
          },
        },
        (context, req, res) => res.ok({})
      );
      const [route] = router.getRoutes();
      expect(route.options).toEqual({});
    });
  });

  describe('error handling', () => {
    it('converts a DeferredInitializationError thrown from a handler into a 503 with Retry-After', async () => {
      const router = new Router('', logger, enhanceWithContext, routerOptions);
      router.get(
        {
          path: '/',
          validate: false,
          security: {
            authz: { enabled: false, reason: 'test' },
          },
        },
        () => {
          // No `status` on the error -> falls back to `failed`, the only state waitUntilAvailable
          // rejects on.
          throw new DeferredInitializationError('myPlugin');
        }
      );
      const [{ handler }] = router.getRoutes();

      await handler(createRequestMock(), mockResponseToolkit);

      expect(mockResponseToolkit.response).toHaveBeenCalledWith({
        pluginId: 'myPlugin',
        status: 'failed',
      });
      expect(mockResponse.code).toHaveBeenCalledWith(503);
      expect(mockResponse.header).toHaveBeenCalledWith('retry-after', '1');
    });

    it('reports the real state carried on the DeferredInitializationError in the 503 body', async () => {
      const router = new Router('', logger, enhanceWithContext, routerOptions);
      router.get(
        {
          path: '/',
          validate: false,
          security: {
            authz: { enabled: false, reason: 'test' },
          },
        },
        () => {
          throw new DeferredInitializationError('myPlugin', { status: 'initializing' });
        }
      );
      const [{ handler }] = router.getRoutes();

      await handler(createRequestMock(), mockResponseToolkit);

      expect(mockResponseToolkit.response).toHaveBeenCalledWith({
        pluginId: 'myPlugin',
        status: 'initializing',
      });
      expect(mockResponse.code).toHaveBeenCalledWith(503);
    });
  });
});
