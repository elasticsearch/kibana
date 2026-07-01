/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import supertest from 'supertest';
import { kibanaPackageJson } from '@kbn/repo-info';
import type { IRouter, RouteRegistrar } from '@kbn/core-http-server';
import { contextServiceMock } from '@kbn/core-http-context-server-mocks';
import { docLinksServiceMock } from '@kbn/core-doc-links-server-mocks';
import { createConfigService } from '@kbn/core-http-server-mocks';
import type { HttpService, HttpServerSetup } from '@kbn/core-http-server-internal';
import { executionContextServiceMock } from '@kbn/core-execution-context-server-mocks';
import { userActivityServiceMock } from '@kbn/core-user-activity-server-mocks';
import { schema } from '@kbn/config-schema';
import type { IConfigServiceMock } from '@kbn/config-mocks';
import type { Logger } from '@kbn/logging';
import { loggerMock } from '@kbn/logging-mocks';
import { KIBANA_BUILD_NR_HEADER } from '@kbn/core-http-common';
import { createInternalHttpService } from '../utilities';

const actualVersion = kibanaPackageJson.version;
const versionHeader = 'kbn-version';
const xsrfHeader = 'kbn-xsrf';
const nameHeader = 'kbn-name';
const allowlistedTestPath = '/xsrf/test/route/whitelisted';
const xsrfDisabledTestPath = '/xsrf/test/route/disabled';
const kibanaName = 'my-kibana-name';
const internalOriginHeader = 'x-elastic-internal-origin';
const internalProductQueryParam = 'elasticInternalOrigin';
const setupDeps = {
  context: contextServiceMock.createSetupContract(),
  executionContext: executionContextServiceMock.createInternalSetupContract(),
  userActivity: userActivityServiceMock.createInternalSetupContract(),
};

const testConfig: Parameters<typeof createConfigService>[0] = {
  server: {
    name: kibanaName,
    securityResponseHeaders: {
      // reflects default config
      strictTransportSecurity: null,
      xContentTypeOptions: 'nosniff',
      referrerPolicy: 'strict-origin-when-cross-origin',
      permissionsPolicy: null,
      crossOriginOpenerPolicy: 'same-origin',
    } as any,
    customResponseHeaders: {
      'some-header': 'some-value',
      'referrer-policy': 'strict-origin', // overrides a header that is defined by securityResponseHeaders
    },
    xsrf: {
      disableProtection: false,
      allowlist: [allowlistedTestPath],
      allowedSchemes: [],
    },
    restrictInternalApis: false,
  },
};

describe('core lifecycle handlers', () => {
  let server: HttpService;
  let innerServer: HttpServerSetup['server'];
  let router: IRouter;
  let logger: jest.Mocked<Logger>;

  beforeEach(async () => {
    const configService = createConfigService(testConfig);
    logger = loggerMock.create();
    server = createInternalHttpService({ configService, logger });
    await server.preboot({
      context: contextServiceMock.createPrebootContract(),
      docLinks: docLinksServiceMock.createSetupContract(),
    });
    const serverSetup = await server.setup(setupDeps);
    router = serverSetup.createRouter('/');
    innerServer = serverSetup.server;
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('versionCheck post-auth handler', () => {
    const testRoute = '/version_check/test/route';

    beforeEach(async () => {
      router.get(
        { path: testRoute, validate: false, security: { authz: { enabled: false, reason: '' } } },
        (context, req, res) => {
          return res.ok({ body: 'ok' });
        }
      );
      await server.start();
    });

    it('accepts requests with the correct version passed in the version header', async () => {
      await supertest(innerServer.listener)
        .get(testRoute)
        .set(versionHeader, actualVersion)
        .expect(200, 'ok');
    });

    it('accepts requests that do not include a version header', async () => {
      await supertest(innerServer.listener).get(testRoute).expect(200, 'ok');
    });

    it('rejects requests with an incorrect version passed in the version header', async () => {
      await supertest(innerServer.listener)
        .get(testRoute)
        .set(versionHeader, 'invalid-version')
        .expect(400, /Browser client is out of date/);
    });

    it('does not log a warning message about the build mismatch', async () => {
      await supertest(innerServer.listener)
        .get(testRoute)
        .set(versionHeader, 'invalid-version')
        .expect(400, /Browser client is out of date/);
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('customHeaders pre-response handler', () => {
    const testRoute = '/custom_headers/test/route';
    const testErrorRoute = '/custom_headers/test/error_route';

    const expectedHeaders = {
      [nameHeader]: kibanaName,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin',
      'some-header': 'some-value',
    };

    beforeEach(async () => {
      router.get(
        { path: testRoute, validate: false, security: { authz: { enabled: false, reason: '' } } },
        (context, req, res) => {
          return res.ok({ body: 'ok' });
        }
      );
      router.get(
        {
          path: testErrorRoute,
          validate: false,
          security: { authz: { enabled: false, reason: '' } },
        },
        (context, req, res) => {
          return res.badRequest({ body: 'bad request' });
        }
      );
      await server.start();
    });

    it('adds the expected headers in case of success', async () => {
      const result = await supertest(innerServer.listener).get(testRoute).expect(200, 'ok');
      const headers = result.header as Record<string, string>;
      expect(headers).toEqual(expect.objectContaining(expectedHeaders));
    });

    it('adds the expected headers in case of error', async () => {
      const result = await supertest(innerServer.listener).get(testErrorRoute).expect(400);
      const headers = result.header as Record<string, string>;
      expect(headers).toEqual(expect.objectContaining(expectedHeaders));
    });
  });

  describe('xsrf post-auth handler', () => {
    const testPath = '/xsrf/test/route';
    const destructiveMethods = ['POST', 'PUT', 'DELETE'];
    const nonDestructiveMethods = ['GET', 'HEAD'];

    const getSupertest = (method: string, path: string): supertest.Test => {
      return (supertest(innerServer.listener) as any)[method.toLowerCase()](path) as supertest.Test;
    };

    beforeEach(async () => {
      router.get(
        { path: testPath, validate: false, security: { authz: { enabled: false, reason: '' } } },
        (context, req, res) => {
          return res.ok({ body: 'ok' });
        }
      );

      destructiveMethods.forEach((method) => {
        ((router as any)[method.toLowerCase()] as RouteRegistrar<any, any>)<any, any, any>(
          { path: testPath, validate: false, security: { authz: { enabled: false, reason: '' } } },
          (context, req, res) => {
            return res.ok({ body: 'ok' });
          }
        );
        ((router as any)[method.toLowerCase()] as RouteRegistrar<any, any>)<any, any, any>(
          {
            path: allowlistedTestPath,
            validate: false,
            security: { authz: { enabled: false, reason: '' } },
          },
          (context, req, res) => {
            return res.ok({ body: 'ok' });
          }
        );
        ((router as any)[method.toLowerCase()] as RouteRegistrar<any, any>)<any, any, any>(
          {
            path: xsrfDisabledTestPath,
            validate: false,
            security: { authz: { enabled: false, reason: '' } },
            options: { xsrfRequired: false },
          },
          (context, req, res) => {
            return res.ok({ body: 'ok' });
          }
        );
      });

      await server.start();
    });

    nonDestructiveMethods.forEach((method) => {
      describe(`When using non-destructive ${method} method`, () => {
        it('accepts requests without a token', async () => {
          await getSupertest(method.toLowerCase(), testPath).expect(
            200,
            method === 'HEAD' ? undefined : 'ok'
          );
        });

        it('accepts requests with the xsrf header', async () => {
          await getSupertest(method.toLowerCase(), testPath)
            .set(xsrfHeader, 'anything')
            .expect(200, method === 'HEAD' ? undefined : 'ok');
        });
      });
    });

    destructiveMethods.forEach((method) => {
      describe(`When using destructive ${method} method`, () => {
        it('accepts requests with the xsrf header', async () => {
          await getSupertest(method.toLowerCase(), testPath)
            .set(xsrfHeader, 'anything')
            .expect(200, 'ok');
        });

        it('accepts requests with the version header', async () => {
          await getSupertest(method.toLowerCase(), testPath)
            .set(versionHeader, actualVersion)
            .expect(200, 'ok');
        });

        it('rejects requests without either an xsrf or version header', async () => {
          await getSupertest(method.toLowerCase(), testPath).expect(400, {
            statusCode: 400,
            error: 'Bad Request',
            message: 'Request must contain a kbn-xsrf header.',
          });
        });

        it('accepts whitelisted requests without either an xsrf or version header', async () => {
          await getSupertest(method.toLowerCase(), allowlistedTestPath).expect(200, 'ok');
        });

        it('accepts requests on a route with disabled xsrf protection', async () => {
          await getSupertest(method.toLowerCase(), xsrfDisabledTestPath).expect(200, 'ok');
        });
      });
    });
  });

  describe('restrictInternalRoutes post-auth handler', () => {
    const testInternalRoute = '/restrict_internal_routes/test/route_internal';
    const testPublicRoute = '/restrict_internal_routes/test/route_public';

    beforeEach(async () => {
      await server?.stop();
      const configService = createConfigService({
        server: {
          ...testConfig.server,
          restrictInternalApis: true,
        },
      });
      server = createInternalHttpService({ configService });
      await server.preboot({
        context: contextServiceMock.createPrebootContract(),
        docLinks: docLinksServiceMock.createSetupContract(),
      });
      const serverSetup = await server.setup(setupDeps);
      router = serverSetup.createRouter('/');
      innerServer = serverSetup.server;
      router.get(
        {
          path: testInternalRoute,
          security: { authz: { enabled: false, reason: '' } },
          validate: { query: schema.object({ myValue: schema.string() }) },
          options: { access: 'internal' },
        },
        (context, req, res) => {
          return res.ok({ body: 'ok()' });
        }
      );
      router.get(
        {
          path: testPublicRoute,
          security: { authz: { enabled: false, reason: '' } },
          validate: { query: schema.object({ myValue: schema.string() }) },
          options: { access: 'public' },
        },
        (context, req, res) => {
          return res.ok({ body: 'ok()' });
        }
      );
      await server.start();
    });

    it('rejects requests to internal routes without special values', async () => {
      await supertest(innerServer.listener)
        .get(testInternalRoute)
        .query({ myValue: 'test' })
        .expect(400);
    });

    it('accepts requests with the internal origin header to internal routes', async () => {
      await supertest(innerServer.listener)
        .get(testInternalRoute)
        .set(internalOriginHeader, 'anything')
        .query({ myValue: 'test' })
        .expect(200, 'ok()');
    });

    it('accepts requests with the internal origin header to public routes', async () => {
      await supertest(innerServer.listener)
        .get(testPublicRoute)
        .set(internalOriginHeader, 'anything')
        .query({ myValue: 'test' })
        .expect(200, 'ok()');
    });

    it('accepts requests with the internal origin query param to internal routes', async () => {
      await supertest(innerServer.listener)
        .get(testInternalRoute)
        .query({ [internalProductQueryParam]: 'anything', myValue: 'test' })
        .expect(200, 'ok()');
    });

    it('accepts requests with the internal origin query param to public routes', async () => {
      await supertest(innerServer.listener)
        .get(testInternalRoute)
        .query({ [internalProductQueryParam]: 'anything', myValue: 'test' })
        .expect(200, 'ok()');
    });
  });
});

describe('core lifecycle handlers with restrict internal routes enforced', () => {
  let server: HttpService;
  let innerServer: HttpServerSetup['server'];
  let router: IRouter;
  let logger: jest.Mocked<Logger>;

  beforeEach(async () => {
    logger = loggerMock.create();
    const configService = createConfigService({ server: { restrictInternalApis: true } });
    server = createInternalHttpService({ configService, logger });

    await server.preboot({
      context: contextServiceMock.createPrebootContract(),
      docLinks: docLinksServiceMock.createSetupContract(),
    });
    const serverSetup = await server.setup(setupDeps);
    router = serverSetup.createRouter('/');
    innerServer = serverSetup.server;
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('restrictInternalRoutes postauth handler', () => {
    const testInternalRoute = '/restrict_internal_routes/test/route_internal';
    const testPublicRoute = '/restrict_internal_routes/test/route_public';
    beforeEach(async () => {
      router.get(
        {
          path: testInternalRoute,
          validate: false,
          security: { authz: { enabled: false, reason: '' } },
          options: { access: 'internal' },
        },
        (context, req, res) => {
          return res.ok({ body: 'ok()' });
        }
      );
      router.get(
        {
          path: testPublicRoute,
          validate: false,
          security: { authz: { enabled: false, reason: '' } },
          options: { access: 'public' },
        },
        (context, req, res) => {
          return res.ok({ body: 'ok()' });
        }
      );
      await server.start();
    });

    it('rejects requests without the internal product header to internal routes', async () => {
      const result = await supertest(innerServer.listener).get(testInternalRoute).expect(400);
      expect(result.body.error).toBe('Bad Request');
      expect(logger.warn).toHaveBeenCalledTimes(0);
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('accepts requests with the internal product header to internal routes', async () => {
      await supertest(innerServer.listener)
        .get(testInternalRoute)
        .set(internalOriginHeader, 'anything')
        .expect(200, 'ok()');
      expect(logger.warn).toHaveBeenCalledTimes(0);
      expect(logger.error).toHaveBeenCalledTimes(0);
    });
  });
});

describe('core lifecycle handlers with no strict client version check', () => {
  const testRouteGood = '/no_version_check/test/ok';
  const testRouteBad = '/no_version_check/test/nok';
  let server: HttpService;
  let innerServer: HttpServerSetup['server'];
  let router: IRouter;
  let configService: IConfigServiceMock;
  let logger: jest.Mocked<Logger>;

  beforeEach(async () => {
    logger = loggerMock.create();
    configService = createConfigService({
      server: {
        versioned: {
          strictClientVersionCheck: false,
          versionResolution: 'newest',
          useVersionResolutionStrategyForInternalPaths: [],
        },
      },
    });
    server = createInternalHttpService({ configService, logger, buildNum: 1234 });
    await server.preboot({
      context: contextServiceMock.createPrebootContract(),
      docLinks: docLinksServiceMock.createSetupContract(),
    });
    const serverSetup = await server.setup(setupDeps);
    router = serverSetup.createRouter('/');
    router.get(
      { path: testRouteGood, validate: false, security: { authz: { enabled: false, reason: '' } } },
      (context, req, res) => {
        return res.ok({ body: 'ok' });
      }
    );
    router.get(
      { path: testRouteBad, validate: false, security: { authz: { enabled: false, reason: '' } } },
      (context, req, res) => {
        return res.custom({ body: 'nok', statusCode: 500 });
      }
    );
    innerServer = serverSetup.server;
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('accepts requests that do not include a version header', async () => {
    await supertest(innerServer.listener).get(testRouteGood).expect(200, 'ok');
  });

  it('accepts requests with any version passed in the version header', async () => {
    await supertest(innerServer.listener)
      .get(testRouteGood)
      .set(versionHeader, 'what-have-you')
      .expect(200, 'ok');
  });

  it('logs a warning when a client build number is newer', async () => {
    await supertest(innerServer.listener)
      .get(testRouteBad)
      .set(KIBANA_BUILD_NR_HEADER, '12345')
      .expect(500, /nok/);

    expect(logger.warn).toHaveBeenCalledTimes(2);
    const message = logger.warn.mock.calls[1][0];
    expect(message).toMatch(
      /^Client build \(12345\) is newer than this Kibana server build \(1234\)/
    );
  });
  it('logs a warning when a client build number is older', async () => {
    await supertest(innerServer.listener)
      .get(testRouteBad)
      .set(KIBANA_BUILD_NR_HEADER, '123')
      .expect(500, /nok/);

    expect(logger.warn).toHaveBeenCalledTimes(2);
    const message = logger.warn.mock.calls[1][0];
    expect(message).toMatch(
      /^Client build \(123\) is older than this Kibana server build \(1234\)/
    );
  });
});
