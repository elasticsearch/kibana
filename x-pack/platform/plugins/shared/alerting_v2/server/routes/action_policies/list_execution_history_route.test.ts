/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import type { ActionPolicyExecutionHistoryClient } from '../../lib/action_policy_execution_history_client';
import { createRouteDependencies } from '../test_utils';
import { ListExecutionHistoryRoute } from './list_execution_history_route';

const createMocks = () => {
  const deps = createRouteDependencies();
  const executionHistoryClient: jest.Mocked<
    Pick<ActionPolicyExecutionHistoryClient, 'listExecutionHistory' | 'countNewEventsSince'>
  > = {
    listExecutionHistory: jest.fn().mockResolvedValue({
      items: [],
      page: 1,
      perPage: 100,
      totalEvents: 0,
      searchMatches: null,
    }),
    countNewEventsSince: jest.fn(),
  };
  return { deps, executionHistoryClient };
};

const buildRoute = (request: KibanaRequest, mocks: ReturnType<typeof createMocks>) =>
  new ListExecutionHistoryRoute(
    mocks.deps.ctx,
    request as any,
    mocks.executionHistoryClient as unknown as ActionPolicyExecutionHistoryClient
  );

describe('ListExecutionHistoryRoute', () => {
  it('forwards page, perPage, search and outcome from the query to the client', async () => {
    const mocks = createMocks();
    const request = httpServerMock.createKibanaRequest({
      query: { page: 2, perPage: 25, search: 'foo', outcome: 'throttled' },
    });
    const route = buildRoute(request as unknown as KibanaRequest, mocks);

    await route.handle();

    expect(mocks.executionHistoryClient.listExecutionHistory).toHaveBeenCalledWith({
      request,
      page: 2,
      perPage: 25,
      search: 'foo',
      outcome: 'throttled',
    });
  });

  it('passes undefined params when query is empty (defaults applied by client)', async () => {
    const mocks = createMocks();
    const request = httpServerMock.createKibanaRequest();
    const route = buildRoute(request as unknown as KibanaRequest, mocks);

    await route.handle();

    expect(mocks.executionHistoryClient.listExecutionHistory).toHaveBeenCalledWith({
      request,
      page: undefined,
      perPage: undefined,
      search: undefined,
      outcome: undefined,
    });
  });

  it('returns the client result verbatim in the response body', async () => {
    const mocks = createMocks();
    const clientResult = { items: [{ id: 'x' }], page: 4, perPage: 25, totalEvents: 137 };
    mocks.executionHistoryClient.listExecutionHistory.mockResolvedValue(clientResult as any);

    const request = httpServerMock.createKibanaRequest();
    const route = buildRoute(request as unknown as KibanaRequest, mocks);

    await route.handle();

    const okCall = (mocks.deps.response.ok as jest.Mock).mock.calls[0][0];
    expect(okCall.body).toEqual(clientResult);
  });

  it('lets errors propagate so BaseAlertingRoute.onError handles the response', async () => {
    const mocks = createMocks();
    mocks.executionHistoryClient.listExecutionHistory.mockRejectedValueOnce(new Error('boom'));
    const request = httpServerMock.createKibanaRequest();
    const route = buildRoute(request as unknown as KibanaRequest, mocks);

    await route.handle();

    expect(mocks.deps.response.customError).toHaveBeenCalledTimes(1);
    expect(mocks.deps.response.ok).not.toHaveBeenCalled();
  });
});
