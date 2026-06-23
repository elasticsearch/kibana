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
import { CountNewExecutionHistoryEventsRoute } from './count_new_execution_history_events_route';

const createMocks = () => {
  const deps = createRouteDependencies();
  const executionHistoryClient: jest.Mocked<
    Pick<ActionPolicyExecutionHistoryClient, 'listExecutionHistory' | 'countNewEventsSince'>
  > = {
    listExecutionHistory: jest.fn(),
    countNewEventsSince: jest.fn().mockResolvedValue({ count: 0 }),
  };
  return { deps, executionHistoryClient };
};

const buildRoute = (request: KibanaRequest, mocks: ReturnType<typeof createMocks>) =>
  new CountNewExecutionHistoryEventsRoute(
    mocks.deps.ctx,
    request as any,
    mocks.executionHistoryClient as unknown as ActionPolicyExecutionHistoryClient
  );

describe('CountNewExecutionHistoryEventsRoute', () => {
  it('forwards since, search and outcome from the query to the client', async () => {
    const mocks = createMocks();
    const since = '2026-05-05T10:00:00.000Z';
    const request = httpServerMock.createKibanaRequest({
      query: { since, search: 'foo', outcome: 'all' },
    });
    const route = buildRoute(request as unknown as KibanaRequest, mocks);

    await route.handle();

    expect(mocks.executionHistoryClient.countNewEventsSince).toHaveBeenCalledWith({
      request,
      since,
      search: 'foo',
      outcome: 'all',
    });
  });

  it('passes undefined search/outcome when not in the query (defaults applied by client)', async () => {
    const mocks = createMocks();
    const since = '2026-05-05T10:00:00.000Z';
    const request = httpServerMock.createKibanaRequest({ query: { since } });
    const route = buildRoute(request as unknown as KibanaRequest, mocks);

    await route.handle();

    expect(mocks.executionHistoryClient.countNewEventsSince).toHaveBeenCalledWith({
      request,
      since,
      search: undefined,
      outcome: undefined,
    });
  });

  it('returns the client result verbatim in the response body', async () => {
    const mocks = createMocks();
    mocks.executionHistoryClient.countNewEventsSince.mockResolvedValue({ count: 42 });
    const request = httpServerMock.createKibanaRequest({
      query: { since: '2026-05-05T10:00:00.000Z' },
    });
    const route = buildRoute(request as unknown as KibanaRequest, mocks);

    await route.handle();

    const okCall = (mocks.deps.response.ok as jest.Mock).mock.calls[0][0];
    expect(okCall.body).toEqual({ count: 42 });
  });

  it('lets errors propagate so BaseAlertingRoute.onError handles the response', async () => {
    const mocks = createMocks();
    mocks.executionHistoryClient.countNewEventsSince.mockRejectedValueOnce(new Error('boom'));
    const request = httpServerMock.createKibanaRequest({
      query: { since: '2026-05-05T10:00:00.000Z' },
    });
    const route = buildRoute(request as unknown as KibanaRequest, mocks);

    await route.handle();

    expect(mocks.deps.response.customError).toHaveBeenCalledTimes(1);
    expect(mocks.deps.response.ok).not.toHaveBeenCalled();
  });
});
