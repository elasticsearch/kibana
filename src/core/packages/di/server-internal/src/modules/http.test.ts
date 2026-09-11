/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { type Container } from 'inversify';
import { inject, injectable, optional } from 'inversify';
import { createToken, KibanaContainerModule, Scope } from '@kbn/core-di';
import { injectionServiceMock, setup, start } from '@kbn/core-di-mocks';
import { CoreSetup, CoreStart, Request, Response, Route, Router } from '@kbn/core-di-server';
import type { KibanaRequest, KibanaResponseFactory } from '@kbn/core-http-server';
import type { CoreSetup as TCoreSetup } from '@kbn/core-lifecycle-server';
import { loadHttp } from './http';

const AsyncValue = createToken<string>('AsyncValue');

@injectable()
class TestRoute {
  static method = 'post' as const;
  static path = '/some-path';
  static handleLegacyErrors = false;
  static security = {
    authz: {
      enabled: false,
      reason: 'This route is opted out from authorization.',
    },
  } as const;
  static validate = {};
  // Getter mirrors DI plugins (e.g. alerting_v2) that expose route options via
  // a static getter rather than an own enumerable property.
  public static get options() {
    return { access: 'public' as const, tags: ['oas-tag:test'] };
  }

  constructor(
    @inject(Request) public readonly request: unknown,
    @inject(Response) public readonly response: KibanaResponseFactory,
    @inject(AsyncValue) @optional() public readonly value?: string
  ) {}

  handle() {
    return this.response.ok(this.value == null ? undefined : { body: this.value });
  }
}

const expectedRouteConfig = {
  path: TestRoute.path,
  validate: TestRoute.validate,
  security: TestRoute.security,
  options: { access: 'public', tags: ['oas-tag:test'] },
};

describe('http', () => {
  let injection: jest.Mocked<ReturnType<typeof injectionServiceMock.createStartContract>>;
  let container: Container;
  let http: jest.Mocked<TCoreSetup['http']>;
  let router: jest.Mocked<ReturnType<typeof http.createRouter>>;

  beforeEach(() => {
    jest.clearAllMocks();
    injection = injectionServiceMock.createStartContract();
    router = { post: jest.fn(), handleLegacyErrors: jest.fn() } as unknown as typeof router;
    http = { createRouter: jest.fn().mockReturnValue(router) } as unknown as typeof http;
    container = injection.getContainer();
    container.load(new KibanaContainerModule(loadHttp));
    container.bind(CoreSetup('http')).toConstantValue(http);
    container.bind(CoreStart('injection')).toConstantValue(injection);
    container.bind(Route).toConstantValue(TestRoute);
  });

  it('should create a router instance', () => {
    expect(container.isBound(Router)).toBe(true);
    expect(container.get(Router)).toBe(router);
    expect(http.createRouter).toHaveBeenCalled();
  });

  it('should create a router instance only once', () => {
    const fork = injection.fork();

    expect(fork.get(Router)).toBe(router);
    expect(fork.get(Router)).toBe(router);
    expect(http.createRouter).toHaveBeenCalledTimes(1);
  });

  it('should register a route', () => {
    container.bind(Route).toConstantValue(TestRoute);
    setup(container);

    expect(router.post).toHaveBeenCalledWith(expectedRouteConfig, expect.any(Function));
  });

  it('should not register a route if there are no corresponding bindings ', () => {
    container.unbind(Route);

    expect(() => setup(container)).not.toThrow();
    expect(router.post).not.toHaveBeenCalled();
  });

  it('should handle a request', async () => {
    setup(container);
    start(container);

    const handleSpy = jest.spyOn(TestRoute.prototype, 'handle');
    expect(router.post).toHaveBeenCalledWith(expectedRouteConfig, expect.any(Function));
    const [, handler] = router.post.mock.lastCall!;
    const request = {} as unknown as KibanaRequest;
    const response = {
      ok: jest.fn(() => 'something'),
    } as unknown as jest.Mocked<KibanaResponseFactory>;
    const scope = container.get(Scope);
    const disposeSpy = jest.spyOn(scope, 'dispose');

    await expect(handler({} as any, request, response)).resolves.toBe('something');
    expect(response.ok).toHaveBeenCalled();

    const route = handleSpy.mock.contexts[0] as TestRoute;

    expect(route.request).toBe(request);
    expect(route.response).toBe(response);
    expect(disposeSpy).toHaveBeenCalled();
  });

  it('should handle a request with an asynchronously bound dependency', async () => {
    container.bind(AsyncValue).toResolvedValue(async () => 'resolved-value');
    setup(container);
    start(container);

    const [, handler] = router.post.mock.lastCall!;
    const response = {
      ok: jest.fn(() => 'something'),
    } as unknown as jest.Mocked<KibanaResponseFactory>;

    await expect(handler({} as any, {} as unknown as KibanaRequest, response)).resolves.toBe(
      'something'
    );
    expect(response.ok).toHaveBeenCalledWith({ body: 'resolved-value' });
  });

  it('should wrap a route handler to handle legacy errors', () => {
    const wrapper = jest.fn();
    router.handleLegacyErrors.mockReturnValue(wrapper);
    TestRoute.handleLegacyErrors = true;
    container.bind(Route).toConstantValue(TestRoute);
    setup(container);
    TestRoute.handleLegacyErrors = false;

    expect(router.post).toHaveBeenCalledWith(expectedRouteConfig, wrapper);
  });
});
