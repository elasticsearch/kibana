/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Server } from '@hapi/hapi';
import { EMPTY } from 'rxjs';
import moment from 'moment';
import supertest from 'supertest';
import { getServerOptions, createServer, type IHttpConfig } from '@kbn/server-http-tools';
import { ByteSizeValue } from '@kbn/config-schema';

import type { BasePathProxyServerOptions } from '../base_path_proxy';
import { Http1BasePathProxyServer } from '../base_path_proxy';
import { DevConfig } from '../config/dev_config';
import { TestLog } from '../log';

describe('Http1BasePathProxyServer', () => {
  let server: Server;
  let proxyServer: Http1BasePathProxyServer;
  let logger: TestLog;
  let config: IHttpConfig;
  let basePath: string;
  let proxySupertest: supertest.Agent;

  beforeEach(async () => {
    logger = new TestLog();

    config = {
      protocol: 'http1',
      host: '127.0.0.1',
      port: 10012,
      shutdownTimeout: moment.duration(30, 'seconds'),
      keepaliveTimeout: 1000,
      socketTimeout: 1000,
      payloadTimeout: 1000,
      cors: {
        enabled: false,
        allowCredentials: false,
        allowOrigin: [],
      },
      ssl: { enabled: false },
      maxPayload: new ByteSizeValue(1024),
      restrictInternalApis: false,
    };

    const serverOptions = getServerOptions(config);
    server = createServer(serverOptions);

    // setup and start the proxy server
    const proxyConfig: IHttpConfig = { ...config, port: 10013 };
    const devConfig = new DevConfig({ basePathProxyTarget: config.port });
    proxyServer = new Http1BasePathProxyServer(logger, proxyConfig, devConfig);
    const options: BasePathProxyServerOptions = {
      shouldRedirectFromOldBasePath: () => true,
      delayUntil: () => EMPTY,
    };
    await proxyServer.start(options);

    // set the base path or throw if for some unknown reason it is not setup
    if (proxyServer.basePath == null) {
      throw new Error('Invalid null base path, all tests will fail');
    } else {
      basePath = proxyServer.basePath;
    }
    proxySupertest = supertest(`http://127.0.0.1:${proxyConfig.port}`);
  });

  afterEach(async () => {
    await server.stop();
    await proxyServer.stop();
    jest.clearAllMocks();
  });

  test('root URL will return a 302 redirect', async () => {
    await proxySupertest.get('/').expect(302);
  });

  test('root URL will return a redirect location with exactly 3 characters that are a-z (or spalger)', async () => {
    const res = await proxySupertest.get('/');
    const location = res.header.location;
    expect(location).toMatch(/^\/(spalger|[a-z]{3})$/);
  });

  test('forwards request with the correct path', async () => {
    server.route({
      method: 'GET',
      path: `${basePath}/foo/{test}`,
      handler: (request, h) => {
        return h.response(request.params.test);
      },
    });
    await server.start();

    await proxySupertest
      .get(`${basePath}/foo/some-string`)
      .expect(200)
      .then((res) => {
        expect(res.text).toBe('some-string');
      });
  });

  test('forwards request with the correct query params', async () => {
    server.route({
      method: 'GET',
      path: `${basePath}/foo/`,
      handler: (request, h) => {
        return h.response(request.query);
      },
    });

    await server.start();

    await proxySupertest
      .get(`${basePath}/foo/?bar=test&quux=123`)
      .expect(200)
      .then((res) => {
        expect(res.body).toEqual({ bar: 'test', quux: '123' });
      });
  });

  test('forwards the request body', async () => {
    server.route({
      method: 'POST',
      path: `${basePath}/foo/`,
      handler: (request, h) => {
        return h.response(request.payload);
      },
    });

    await server.start();

    await proxySupertest
      .post(`${basePath}/foo/`)
      .send({
        bar: 'test',
        baz: 123,
      })
      .expect(200)
      .then((res) => {
        expect(res.body).toEqual({ bar: 'test', baz: 123 });
      });
  });

  test('returns the correct status code', async () => {
    server.route({
      method: 'GET',
      path: `${basePath}/foo/`,
      handler: (request, h) => {
        return h.response({ foo: 'bar' }).code(417);
      },
    });

    await server.start();

    await proxySupertest
      .get(`${basePath}/foo/`)
      .expect(417)
      .then((res) => {
        expect(res.body).toEqual({ foo: 'bar' });
      });
  });

  test('returns the response headers', async () => {
    server.route({
      method: 'GET',
      path: `${basePath}/foo/`,
      handler: (request, h) => {
        return h.response({ foo: 'bar' }).header('foo', 'bar');
      },
    });

    await server.start();

    await proxySupertest
      .get(`${basePath}/foo/`)
      .expect(200)
      .then((res) => {
        expect(res.get('foo')).toEqual('bar');
      });
  });

  test('forwards request cancellation', async () => {
    let propagated = false;

    let notifyRequestReceived: () => void;
    const requestReceived = new Promise<void>((resolve) => {
      notifyRequestReceived = resolve;
    });

    let notifyRequestAborted: () => void;
    const requestAborted = new Promise<void>((resolve) => {
      notifyRequestAborted = resolve;
    });

    server.route({
      method: 'GET',
      path: `${basePath}/foo/{test}`,
      handler: async (request, h) => {
        notifyRequestReceived();

        request.raw.req.once('aborted', () => {
          notifyRequestAborted();
          propagated = true;
        });
        return await new Promise((resolve) => undefined);
      },
    });
    await server.start();

    const request = proxySupertest.get(`${basePath}/foo/some-string`).end();

    await requestReceived;

    request.abort();

    await requestAborted;

    expect(propagated).toEqual(true);
  });

  test('handles putting', async () => {
    server.route({
      method: 'PUT',
      path: `${basePath}/foo/`,
      handler: (request, h) => {
        return h.response(request.payload);
      },
    });

    await server.start();

    await proxySupertest
      .put(`${basePath}/foo/`)
      .send({
        bar: 'test',
        baz: 123,
      })
      .expect(200)
      .then((res) => {
        expect(res.body).toEqual({ bar: 'test', baz: 123 });
      });
  });

  test('handles deleting', async () => {
    server.route({
      method: 'DELETE',
      path: `${basePath}/foo/{test}`,
      handler: (request, h) => {
        return h.response(request.params.test);
      },
    });
    await server.start();

    await proxySupertest
      .delete(`${basePath}/foo/some-string`)
      .expect(200)
      .then((res) => {
        expect(res.text).toBe('some-string');
      });
  });

  describe('with `basepath: /bar` and `rewriteBasePath: false`', () => {
    beforeEach(async () => {
      const configWithBasePath: IHttpConfig = {
        ...config,
        basePath: '/bar',
        rewriteBasePath: false,
      } as IHttpConfig;

      const serverOptions = getServerOptions(configWithBasePath);
      server = createServer(serverOptions);

      server.route({
        method: 'GET',
        path: `${basePath}/`,
        handler: (request, h) => {
          return h.response('value:/');
        },
      });
      server.route({
        method: 'GET',
        path: `${basePath}/foo`,
        handler: (request, h) => {
          return h.response('value:/foo');
        },
      });

      await server.start();
    });

    test('/bar => 404', async () => {
      await proxySupertest.get(`${basePath}/bar`).expect(404);
    });

    test('/bar/ => 404', async () => {
      await proxySupertest.get(`${basePath}/bar/`).expect(404);
    });

    test('/bar/foo => 404', async () => {
      await proxySupertest.get(`${basePath}/bar/foo`).expect(404);
    });

    test('/ => /', async () => {
      await proxySupertest
        .get(`${basePath}/`)
        .expect(200)
        .then((res) => {
          expect(res.text).toBe('value:/');
        });
    });

    test('/foo => /foo', async () => {
      await proxySupertest
        .get(`${basePath}/foo`)
        .expect(200)
        .then((res) => {
          expect(res.text).toBe('value:/foo');
        });
    });
  });

  describe('shouldRedirect', () => {
    let proxyServerWithoutShouldRedirect: Http1BasePathProxyServer;
    let proxyWithoutShouldRedirectSupertest: supertest.Agent;

    beforeEach(async () => {
      // setup and start a proxy server which does not use "shouldRedirectFromOldBasePath"
      const proxyConfig: IHttpConfig = { ...config, port: 10004 };
      const devConfig = new DevConfig({ basePathProxyTarget: config.port });
      proxyServerWithoutShouldRedirect = new Http1BasePathProxyServer(
        logger,
        proxyConfig,
        devConfig
      );
      const options: Readonly<BasePathProxyServerOptions> = {
        shouldRedirectFromOldBasePath: () => false, // Return false to not redirect
        delayUntil: () => EMPTY,
      };
      await proxyServerWithoutShouldRedirect.start(options);
      proxyWithoutShouldRedirectSupertest = supertest(`http://127.0.0.1:${proxyConfig.port}`);
    });

    afterEach(async () => {
      await proxyServerWithoutShouldRedirect.stop();
    });

    test('it will do a redirect if it detects what looks like a stale or previously used base path', async () => {
      const fakeBasePath = basePath !== '/abc' ? 'abc' : 'efg';
      const res = await proxySupertest.get(`/${fakeBasePath}`).expect(302);
      const location = res.header.location;
      expect(location).toEqual(`${basePath}/`);
    });

    test('it will NOT do a redirect if it detects what looks like a stale or previously used base path if we intentionally turn it off', async () => {
      const fakeBasePath = basePath !== '/abc' ? 'abc' : 'efg';
      await proxyWithoutShouldRedirectSupertest.get(`/${fakeBasePath}`).expect(404);
    });

    test('it will NOT redirect if it detects a larger path than 3 characters', async () => {
      await proxySupertest.get('/abcde').expect(404);
    });

    test('it will NOT redirect if it is not a GET verb', async () => {
      const fakeBasePath = basePath !== '/abc' ? 'abc' : 'efg';
      await proxySupertest.put(`/${fakeBasePath}`).expect(404);
    });
  });

  describe('constructor option for sending in a custom basePath', () => {
    let proxyServerWithFooBasePath: Http1BasePathProxyServer;
    let proxyWithFooBasePath: supertest.Agent;

    beforeEach(async () => {
      // setup and start a proxy server which uses a basePath of "foo"
      const proxyConfig = { ...config, port: 10004, basePath: '/foo' }; // <-- "foo" here in basePath
      const devConfig = new DevConfig({ basePathProxyTarget: config.port });
      proxyServerWithFooBasePath = new Http1BasePathProxyServer(logger, proxyConfig, devConfig);
      const options: Readonly<BasePathProxyServerOptions> = {
        shouldRedirectFromOldBasePath: () => true,
        delayUntil: () => EMPTY,
      };
      await proxyServerWithFooBasePath.start(options);
      proxyWithFooBasePath = supertest(`http://127.0.0.1:${proxyConfig.port}`);
    });

    afterEach(async () => {
      await proxyServerWithFooBasePath.stop();
    });

    test('it will do a redirect to foo which is our passed in value for the configuration', async () => {
      const res = await proxyWithFooBasePath.get('/bar').expect(302);
      const location = res.header.location;
      expect(location).toEqual('/foo/');
    });
  });
});
