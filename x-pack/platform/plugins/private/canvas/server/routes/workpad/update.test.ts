/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AwaitedProperties } from '@kbn/utility-types';
import sinon from 'sinon';
import { CANVAS_TYPE, API_ROUTE_WORKPAD_STRUCTURES } from '../../../common/lib/constants';
import { initializeUpdateWorkpadRoute, initializeUpdateWorkpadAssetsRoute } from './update';
import type { RequestHandler } from '@kbn/core/server';
import { kibanaResponseFactory, SavedObjectsErrorHelpers } from '@kbn/core/server';
import { savedObjectsClientMock, httpServerMock, coreMock } from '@kbn/core/server/mocks';
import { workpads } from '../../../__fixtures__/workpads';
import { okResponse } from '../ok_response';
import { getMockedRouterDeps } from '../test_helpers';
import type { MockWorkpadRouteContext } from '../../mocks';
import { workpadRouteContextMock } from '../../mocks';

const mockRouteContext = {
  core: {
    savedObjects: {
      client: savedObjectsClientMock.create(),
    },
  },
  canvas: workpadRouteContextMock.create(),
} as unknown as AwaitedProperties<MockWorkpadRouteContext>;

const workpad = workpads[0];
const now = new Date();

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('123abc'),
}));

describe('PUT workpad', () => {
  let routeHandler: RequestHandler<any, any, any>;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers(now);

    const routerDeps = getMockedRouterDeps();
    initializeUpdateWorkpadRoute(routerDeps);

    routeHandler =
      routerDeps.router.versioned.put.mock.results[0].value.addVersion.mock.calls[0][1];
  });

  afterEach(() => {
    jest.resetAllMocks();
    clock.restore();
  });

  it(`returns 200 ok with the server @timestamp when the workpad is updated`, async () => {
    const updatedWorkpad = { name: 'new name' };
    const timestamp = '2021-01-01T00:05:00.000Z';
    const { id } = workpad;

    const request = httpServerMock.createKibanaRequest({
      method: 'put',
      path: `api/canvas/workpad/${id}`,
      params: {
        id,
      },
      body: updatedWorkpad,
    });

    mockRouteContext.canvas.workpad.update.mockResolvedValue({
      id,
      type: CANVAS_TYPE,
      attributes: { '@timestamp': timestamp } as any,
      references: [],
    });

    const response = await routeHandler(
      coreMock.createCustomRequestHandlerContext(mockRouteContext),
      request,
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    expect(response.payload).toEqual({ ...okResponse, '@timestamp': timestamp });
    expect(mockRouteContext.canvas.workpad.update).toBeCalledWith(id, updatedWorkpad);
  });

  it(`returns the server @timestamp from the workpad-structures route`, async () => {
    const routerDeps = getMockedRouterDeps();
    initializeUpdateWorkpadRoute(routerDeps);
    // Find the structures route handler by matching the registered path.
    const putCalls = routerDeps.router.versioned.put.mock.calls;
    const putResults = routerDeps.router.versioned.put.mock.results;
    const structuresIndex = putCalls.findIndex(
      (call: any) => call[0].path === `${API_ROUTE_WORKPAD_STRUCTURES}/{id}`
    );
    const structuresHandler = putResults[structuresIndex].value.addVersion.mock.calls[0][1];

    const { id } = workpad;
    const timestamp = '2021-02-02T00:00:00.000Z';

    const request = httpServerMock.createKibanaRequest({
      method: 'put',
      path: `api/canvas/workpad-structures/${id}`,
      params: { id },
      body: { name: 'new name' },
    });

    mockRouteContext.canvas.workpad.update.mockResolvedValue({
      id,
      type: CANVAS_TYPE,
      attributes: { '@timestamp': timestamp } as any,
      references: [],
    });

    const response = await structuresHandler(
      coreMock.createCustomRequestHandlerContext(mockRouteContext),
      request,
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    expect(response.payload).toEqual({ ...okResponse, '@timestamp': timestamp });
  });

  it(`returns not found if existing workpad is not found`, async () => {
    const request = httpServerMock.createKibanaRequest({
      method: 'put',
      path: 'api/canvas/workpad/some-id',
      params: {
        id: 'not-found',
      },
      body: {},
    });

    mockRouteContext.canvas.workpad.update.mockImplementationOnce(() => {
      throw SavedObjectsErrorHelpers.createGenericNotFoundError('not found');
    });

    const response = await routeHandler(
      coreMock.createCustomRequestHandlerContext(mockRouteContext),
      request,
      kibanaResponseFactory
    );

    expect(response.status).toBe(404);
  });

  it(`returns bad request if the write fails`, async () => {
    const request = httpServerMock.createKibanaRequest({
      method: 'put',
      path: 'api/canvas/workpad/some-id',
      params: {
        id: 'some-id',
      },
      body: {},
    });

    mockRouteContext.canvas.workpad.update.mockImplementationOnce(() => {
      throw SavedObjectsErrorHelpers.createBadRequestError('bad request');
    });

    const response = await routeHandler(
      coreMock.createCustomRequestHandlerContext(mockRouteContext),
      request,
      kibanaResponseFactory
    );

    expect(response.status).toBe(400);
  });
});

describe('update assets', () => {
  let routeHandler: RequestHandler<any, any, any>;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers(now);

    const routerDeps = getMockedRouterDeps();
    initializeUpdateWorkpadAssetsRoute(routerDeps);

    routeHandler =
      routerDeps.router.versioned.put.mock.results[0].value.addVersion.mock.calls[0][1];
  });

  afterEach(() => {
    clock.restore();
  });

  it('updates assets', async () => {
    const { id, ...attributes } = workpad;
    const assets = {
      'asset-1': {
        '@created': new Date().toISOString(),
        id: 'asset-1',
        type: 'asset',
        value: 'some-url-encoded-asset',
      },
      'asset-2': {
        '@created': new Date().toISOString(),
        id: 'asset-2',
        type: 'asset',
        value: 'some-other asset',
      },
    };

    const request = httpServerMock.createKibanaRequest({
      method: 'put',
      path: 'api/canvas/workpad-assets/some-id',
      params: {
        id,
      },
      body: assets,
    });

    mockRouteContext.canvas.workpad.update.mockResolvedValueOnce({
      id,
      type: CANVAS_TYPE,
      attributes: attributes as any,
      references: [],
    });

    const response = await routeHandler(
      coreMock.createCustomRequestHandlerContext(mockRouteContext),
      request,
      kibanaResponseFactory
    );
    expect(response.status).toBe(200);

    expect(mockRouteContext.canvas.workpad.update).toBeCalledWith(id, {
      assets,
    });
  });
});
