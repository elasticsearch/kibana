/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * @jest-environment node
 */

import { restoreSelfClientTestEnvironment } from './self_client_test_environment';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import Supertest from 'supertest';
import {
  fetch as undiciFetch,
  Headers as UndiciHeaders,
  Request as UndiciRequest,
  Response as UndiciResponse,
} from 'undici';
import { schema } from '@kbn/config-schema';
import { CA_CERT_PATH, KBN_CERT_PATH, KBN_KEY_PATH } from '@kbn/dev-utils';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { executionContextServiceMock } from '@kbn/core-execution-context-server-mocks';
import { userActivityServiceMock } from '@kbn/core-user-activity-server-mocks';
import { contextServiceMock } from '@kbn/core-http-context-server-mocks';
import { docLinksServiceMock } from '@kbn/core-doc-links-server-mocks';
import { createConfigService } from '@kbn/core-http-server-mocks';
import {
  config as httpConfigDescriptor,
  type HttpConfigType,
  type HttpService,
  type InternalHttpServiceStart,
} from '@kbn/core-http-server-internal';
import { createInternalHttpService } from '../utilities';

interface RecursiveResponse {
  readonly marker?: string | string[];
  readonly error?: string;
}

const TEST_PORT = 10003;
const originalFetch = global.fetch;
const originalHeaders = global.Headers;
const originalRequest = global.Request;
const originalResponse = global.Response;
const routeSecurity = {
  authz: {
    enabled: false,
    reason: 'This route is part of an HTTP integration test.',
  },
} as const;
const setupDeps = {
  context: contextServiceMock.createSetupContract(),
  executionContext: executionContextServiceMock.createInternalSetupContract(),
  userActivity: userActivityServiceMock.createInternalSetupContract(),
};
type TestHttpConfig = Omit<Partial<HttpConfigType>, 'selfHttp' | 'ssl' | 'versioned'> & {
  selfHttp?: Omit<Partial<HttpConfigType['selfHttp']>, 'ssl'> & {
    ssl?: Partial<HttpConfigType['selfHttp']['ssl']>;
  };
  ssl?: Partial<HttpConfigType['ssl']>;
  versioned?: Partial<HttpConfigType['versioned']>;
};

const startServer = async (serverConfig: TestHttpConfig = { port: TEST_PORT }) => {
  const logger = loggingSystemMock.create();
  const server = createInternalHttpService({
    logger,
    configService: createConfigService({
      server: httpConfigDescriptor.schema.validate({
        restrictInternalApis: false,
        ...serverConfig,
        versioned: {
          ...serverConfig.versioned,
          strictClientVersionCheck: false,
        },
      }),
    }),
  });
  await server.preboot({
    context: contextServiceMock.createPrebootContract(),
    docLinks: docLinksServiceMock.createSetupContract(),
  });

  const { server: innerServer, createRouter, registerOnPostAuth } = await server.setup(setupDeps);
  const router = createRouter('/');
  const supertest = Supertest(innerServer.listener);
  const started = { httpStart: null as InternalHttpServiceStart | null };
  registerOnPostAuth((request, response, toolkit) => {
    if (request.route.path === '/self/authz_denied') {
      return response.forbidden({ body: 'Rejected by test authorization' });
    }
    return toolkit.next();
  });

  router.get(
    {
      path: '/self/path_safety',
      security: routeSecurity,
      validate: false,
    },
    async (context, req, res) => {
      try {
        await started.httpStart!.selfClient.asScoped(req).fetch('/\\evil.com/steal');
      } catch (error) {
        return res.ok({ body: { error: (error as Error).message } });
      }

      return res.ok({ body: { error: null } });
    }
  );

  router.get(
    {
      path: '/self/recursive/{remaining}',
      security: routeSecurity,
      validate: {
        params: schema.object({
          remaining: schema.number({ min: 0 }),
        }),
      },
    },
    async (context, req, res) => {
      if (req.params.remaining === 0) {
        return res.ok({
          body: { marker: req.headers['x-kbn-self-call'] },
        });
      }

      try {
        const body = await started
          .httpStart!.selfClient.asScoped(req)
          .fetch<RecursiveResponse>(`/self/recursive/${req.params.remaining - 1}`);

        return res.ok({ body });
      } catch (error) {
        return res.ok({ body: { error: (error as Error).message } });
      }
    }
  );

  router.get(
    {
      path: '/self/observed_target',
      security: routeSecurity,
      validate: false,
    },
    (_context, _req, res) => res.ok({ body: { ok: true } })
  );

  router.get(
    {
      path: '/self/authz_denied',
      security: routeSecurity,
      validate: false,
    },
    (_context, _req, res) => res.ok({ body: { shouldNotRun: true } })
  );

  router.get(
    {
      path: '/self/target_url',
      security: routeSecurity,
      validate: false,
    },
    (_context, req, res) => {
      return res.ok({
        body: {
          url: req.url.href,
          host: req.headers.host,
          internalOrigin: req.headers['x-elastic-internal-origin'],
          marker: req.headers['x-kbn-self-call'],
        },
      });
    }
  );

  router.get(
    {
      path: '/self/redirect',
      security: routeSecurity,
      validate: false,
    },
    (_context, _req, res) => res.redirected({ headers: { location: '/self/target_url' } })
  );

  router.get(
    {
      path: '/self/call_redirect',
      security: routeSecurity,
      validate: false,
    },
    async (_context, req, res) => {
      try {
        await started.httpStart!.selfClient.asScoped(req).fetch('/self/redirect');
        return res.ok({ body: { error: null } });
      } catch (error) {
        return res.ok({ body: { error: (error as Error).message } });
      }
    }
  );

  router.get(
    {
      path: '/self/cookie_target',
      security: routeSecurity,
      validate: false,
    },
    (_context, req, res) =>
      res.ok({
        body: { cookie: req.headers.cookie ?? null },
        headers: { 'set-cookie': 'inner=value; Path=/' },
      })
  );

  router.get(
    {
      path: '/self/call_cookie_target',
      security: routeSecurity,
      validate: false,
    },
    async (_context, req, res) => {
      const body = await started
        .httpStart!.selfClient.asScoped(req)
        .fetch<{ cookie: string | null }>('/self/cookie_target', {
          forwardRequestHeaders: true,
        });
      return res.ok({ body });
    }
  );

  router.get(
    {
      path: '/self/public_target',
      security: routeSecurity,
      validate: false,
      options: { access: 'public' },
    },
    (_context, req, res) =>
      res.ok({
        body: {
          internalOrigin: req.headers['x-elastic-internal-origin'],
          marker: req.headers['x-kbn-self-call'],
        },
      })
  );

  router.get(
    {
      path: '/self/internal_target',
      security: routeSecurity,
      validate: false,
      options: { access: 'internal' },
    },
    (_context, req, res) =>
      res.ok({
        body: {
          internalOrigin: req.headers['x-elastic-internal-origin'],
          marker: req.headers['x-kbn-self-call'],
        },
      })
  );

  router.get(
    {
      path: '/self/call_access/{access}',
      security: routeSecurity,
      validate: {
        params: schema.object({
          access: schema.oneOf([schema.literal('public'), schema.literal('internal')]),
        }),
      },
    },
    async (_context, req, res) => {
      const body = await started
        .httpStart!.selfClient.asScoped(req)
        .fetch<{ internalOrigin?: string; marker: string }>(`/self/${req.params.access}_target`, {
          access: req.params.access,
        });
      return res.ok({ body });
    }
  );

  router.versioned
    .get({
      path: '/self/versioned_target',
      access: 'public',
      security: routeSecurity,
    })
    .addVersion({ version: '2023-10-31', validate: false }, (_context, req, res) =>
      res.ok({
        body: {
          apiVersion: req.apiVersion,
          marker: req.headers['x-kbn-self-call'],
        },
      })
    );

  router.get(
    {
      path: '/self/call_versioned',
      security: routeSecurity,
      validate: false,
    },
    async (_context, req, res) => {
      const body = await started
        .httpStart!.selfClient.asScoped(req)
        .fetch<{ apiVersion: string; marker: string }>('/self/versioned_target', {
          version: '2023-10-31',
        });
      return res.ok({ body });
    }
  );

  router.get(
    {
      path: '/self/resolve_target',
      security: routeSecurity,
      validate: false,
    },
    async (context, req, res) => {
      try {
        const response = await started
          .httpStart!.selfClient.asScoped(req)
          .fetch<{ url: string; host?: string }>('/self/target_url', { asResponse: true });

        return res.ok({
          body: {
            url: response.request.url,
          },
        });
      } catch (error) {
        return res.ok({ body: { error: (error as Error).message } });
      }
    }
  );

  started.httpStart = await server.start();

  return { server, httpStart: started.httpStart, logger, supertest };
};

describe('Http self client', () => {
  beforeAll(() => {
    global.fetch = undiciFetch as unknown as typeof global.fetch;
    global.Headers = UndiciHeaders as typeof global.Headers;
    global.Request = UndiciRequest as unknown as typeof global.Request;
    global.Response = UndiciResponse as unknown as typeof global.Response;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    global.Headers = originalHeaders;
    global.Request = originalRequest;
    global.Response = originalResponse;
    restoreSelfClientTestEnvironment();
  });

  describe('path safety and recursion limits', () => {
    let server: HttpService;
    let supertest: Supertest.Agent;

    beforeEach(async () => {
      ({ server, supertest } = await startServer());
    });

    afterEach(async () => {
      await server.stop();
      http.globalAgent.destroy();
      https.globalAgent.destroy();
    });

    it('rejects authority-like backslash paths before making a self call', async () => {
      const response = await supertest.get('/self/path_safety').expect(200);

      expect(response.body.error).toContain('Invalid self HTTP path "/\\evil.com/steal"');
    });

    it('allows one self-call hop', async () => {
      const response = await supertest.get('/self/recursive/1').expect(200);

      expect(response.body).toEqual({ marker: 'true' });
    });

    it('rejects a second self-call hop before network activity', async () => {
      const response = await supertest.get('/self/recursive/2').expect(200);

      expect(response.body.error).toContain('a self call cannot issue another self call');
    });

    it('does not follow redirects', async () => {
      const response = await supertest.get('/self/call_redirect').expect(200);

      expect(response.body.error).toMatch(/redirect|fetch failed/i);
    });

    it('does not forward Cookie or relay Set-Cookie', async () => {
      const response = await supertest
        .get('/self/call_cookie_target')
        .set('cookie', 'outer=value')
        .expect(200, { cookie: null });

      expect(response.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('receiving self-call observation', () => {
    let server: HttpService;

    afterEach(async () => {
      await server.stop();
      http.globalAgent.destroy();
      https.globalAgent.destroy();
    });

    it('allows and safely logs self calls after authorization', async () => {
      const started = await startServer({ port: TEST_PORT });
      server = started.server;
      (started.logger.get().info as jest.Mock).mockClear();

      await started.supertest
        .get('/self/observed_target?filter=raw-value')
        .set('x-kbn-self-call', 'true')
        .expect(200, { ok: true });

      expect(started.logger.get().info).toHaveBeenCalledWith(
        'Kibana self HTTP call completed',
        expect.objectContaining({
          event: { action: 'kibana_self_http_request' },
          http: {
            request: { method: 'GET' },
            response: { status_code: 200 },
          },
          labels: expect.objectContaining({
            self_http_route_template: '/self/observed_target',
            self_http_status_class: '2xx',
          }),
        })
      );
      expect(started.logger.get().info).toHaveBeenCalledTimes(1);
      expect(JSON.stringify((started.logger.get().info as jest.Mock).mock.calls)).not.toContain(
        'filter=raw-value'
      );

      (started.logger.get().info as jest.Mock).mockClear();
      await started.supertest.get('/self/authz_denied').set('x-kbn-self-call', 'true').expect(403);
      expect(started.logger.get().info).not.toHaveBeenCalled();
    });

    it('supports public, internal, and versioned target routes', async () => {
      const started = await startServer({ port: TEST_PORT });
      server = started.server;

      await started.supertest.get('/self/call_access/public').expect(200, {
        marker: 'true',
      });
      await started.supertest.get('/self/call_access/internal').expect(200, {
        internalOrigin: 'Kibana',
        marker: 'true',
      });
      await started.supertest.get('/self/call_versioned').expect(200, {
        apiVersion: '2023-10-31',
        marker: 'true',
      });
    });
  });

  describe('selfHttp target resolution', () => {
    let server: HttpService;
    let supertest: Supertest.Agent;

    afterEach(async () => {
      await server?.stop();
      http.globalAgent.destroy();
      https.globalAgent.destroy();
    });

    it('uses publicBaseUrl when target is auto and publicBaseUrl is configured', async () => {
      ({ server, supertest } = await startServer({
        port: TEST_PORT,
        publicBaseUrl: `http://localhost:${TEST_PORT}`,
        selfHttp: { target: 'auto' },
      }));

      const response = await supertest.get('/self/resolve_target').expect(200);

      expect(response.body.url).toBe(`http://localhost:${TEST_PORT}/self/target_url`);
    });

    it('uses local server info when target is auto and publicBaseUrl is absent', async () => {
      ({ server, supertest } = await startServer({
        port: TEST_PORT,
        selfHttp: { target: 'auto' },
      }));

      const response = await supertest.get('/self/resolve_target').expect(200);

      expect(response.body.url).toBe(`http://localhost:${TEST_PORT}/self/target_url`);
    });

    it('ignores publicBaseUrl when target is local', async () => {
      ({ server, supertest } = await startServer({
        port: TEST_PORT,
        publicBaseUrl: 'http://external.example',
        selfHttp: { target: 'local' },
      }));

      const response = await supertest.get('/self/resolve_target').expect(200);

      expect(response.body.url).toBe(`http://localhost:${TEST_PORT}/self/target_url`);
    });

    it('trusts the active local HTTPS certificate with hostname verification enabled', async () => {
      ({ server, supertest } = await startServer({
        port: TEST_PORT,
        ssl: {
          enabled: true,
          certificate: KBN_CERT_PATH,
          key: KBN_KEY_PATH,
        },
        selfHttp: { target: 'local' },
      }));

      const response = await Supertest(`https://localhost:${TEST_PORT}`)
        .get('/self/resolve_target')
        .ca(readFileSync(CA_CERT_PATH))
        .expect(200);

      expect(response.body.url).toBe(`https://localhost:${TEST_PORT}/self/target_url`);
    });

    it('trusts configured certificate authorities for an HTTPS publicBaseUrl', async () => {
      ({ server, supertest } = await startServer({
        port: TEST_PORT,
        publicBaseUrl: `https://localhost:${TEST_PORT}`,
        ssl: {
          enabled: true,
          certificate: KBN_CERT_PATH,
          key: KBN_KEY_PATH,
        },
        selfHttp: {
          target: 'auto',
          ssl: { certificateAuthorities: CA_CERT_PATH },
        },
      }));

      const response = await Supertest(`https://localhost:${TEST_PORT}`)
        .get('/self/resolve_target')
        .ca(readFileSync(CA_CERT_PATH))
        .expect(200);

      expect(response.body.url).toBe(`https://localhost:${TEST_PORT}/self/target_url`);
    });
  });

  describe('selfHttp SSL verification mode', () => {
    let server: HttpService;

    afterEach(async () => {
      await server?.stop();
      http.globalAgent.destroy();
      https.globalAgent.destroy();
    });

    const resolveTarget = async (
      selfHttpSsl: NonNullable<TestHttpConfig['selfHttp']>['ssl'],
      publicBaseUrlHost: string
    ) => {
      ({ server } = await startServer({
        port: TEST_PORT,
        publicBaseUrl: `https://${publicBaseUrlHost}:${TEST_PORT}`,
        ssl: {
          enabled: true,
          certificate: KBN_CERT_PATH,
          key: KBN_KEY_PATH,
        },
        selfHttp: { target: 'auto', ssl: selfHttpSsl },
      }));

      const response = await Supertest(`https://localhost:${TEST_PORT}`)
        .get('/self/resolve_target')
        .ca(readFileSync(CA_CERT_PATH))
        .expect(200);

      return response.body as { url?: string; error?: string };
    };

    it('rejects an untrusted certificate in full mode when no authorities are configured', async () => {
      const body = await resolveTarget({ verificationMode: 'full' }, 'localhost');

      expect(body.url).toBeUndefined();
      expect(body.error).toBeDefined();
    });

    it('accepts an untrusted certificate in none mode when no authorities are configured', async () => {
      const body = await resolveTarget({ verificationMode: 'none' }, 'localhost');

      expect(body.error).toBeUndefined();
      expect(body.url).toBe(`https://localhost:${TEST_PORT}/self/target_url`);
    });

    // KBN_CERT_PATH is issued for `localhost` with no `127.0.0.1` SAN, so addressing the
    // self call by IP is what makes the hostname check the only thing that can fail.
    it('rejects a hostname mismatch in full mode', async () => {
      const body = await resolveTarget(
        { verificationMode: 'full', certificateAuthorities: CA_CERT_PATH },
        '127.0.0.1'
      );

      expect(body.url).toBeUndefined();
      expect(body.error).toBeDefined();
    });

    it('accepts a hostname mismatch in certificate mode', async () => {
      const body = await resolveTarget(
        { verificationMode: 'certificate', certificateAuthorities: CA_CERT_PATH },
        '127.0.0.1'
      );

      expect(body.error).toBeUndefined();
      expect(body.url).toBe(`https://127.0.0.1:${TEST_PORT}/self/target_url`);
    });
  });
});
