/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mockRouter } from '@kbn/core-http-router-server-mocks';
import { DEFERRED_INIT_STATUS_ROUTE } from '@kbn/core-deferred-init-common';
import { registerDeferredInitStatusRoute } from './register_status_route';
import type { DeferredInitEngine } from './deferred_init_engine';

const PLUGIN_ID = 'myPlugin';

const createEngineMock = (): jest.Mocked<
  Pick<DeferredInitEngine, 'ensureInitialized' | 'getFailureDetails'>
> => ({
  ensureInitialized: jest.fn(),
  getFailureDetails: jest.fn(),
});

const createHandler = (engine: ReturnType<typeof createEngineMock>) => {
  const router = mockRouter.create();
  registerDeferredInitStatusRoute(router, engine as unknown as DeferredInitEngine);
  const [config, handler] = (router.get as jest.Mock).mock.calls[0];
  return { config, handler };
};

describe('registerDeferredInitStatusRoute', () => {
  it('registers the shared status route path, unauthenticated and internal-only', () => {
    const { config } = createHandler(createEngineMock());

    expect(config.path).toBe(DEFERRED_INIT_STATUS_ROUTE);
    expect(config.security.authz.enabled).toBe(false);
    expect(config.options.access).toBe('internal');
  });

  it('returns just pluginId and status when not failed', async () => {
    const engine = createEngineMock();
    engine.ensureInitialized.mockReturnValue('initializing');
    const { handler } = createHandler(engine);
    const response = mockRouter.createResponseFactory();

    await handler(
      {},
      mockRouter.createKibanaRequest({ params: { pluginId: PLUGIN_ID } }),
      response
    );

    expect(engine.ensureInitialized).toHaveBeenCalledWith(PLUGIN_ID);
    expect(engine.getFailureDetails).not.toHaveBeenCalled();
    expect(response.ok).toHaveBeenCalledWith({
      body: { pluginId: PLUGIN_ID, status: 'initializing' },
    });
  });

  it('includes the error message, attempt count and failed phase when failed', async () => {
    const engine = createEngineMock();
    engine.ensureInitialized.mockReturnValue('failed');
    engine.getFailureDetails.mockReturnValue({ message: 'boom', attempts: 3, phase: 'start' });
    const { handler } = createHandler(engine);
    const response = mockRouter.createResponseFactory();

    await handler(
      {},
      mockRouter.createKibanaRequest({ params: { pluginId: PLUGIN_ID } }),
      response
    );

    expect(response.ok).toHaveBeenCalledWith({
      body: {
        pluginId: PLUGIN_ID,
        status: 'failed',
        error: { message: 'boom' },
        attempts: 3,
        phase: 'start',
      },
    });
  });
});
