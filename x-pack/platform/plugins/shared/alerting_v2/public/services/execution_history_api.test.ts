/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core/public';
import {
  ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_API_PATH,
  ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_COUNT_API_PATH,
} from '../constants';
import { ExecutionHistoryApi } from './execution_history_api';

describe('ExecutionHistoryApi', () => {
  const buildApi = () => {
    const http = {
      get: jest.fn().mockResolvedValue({ items: [], page: 1, perPage: 50, totalEvents: 0 }),
    };
    const api = new ExecutionHistoryApi(http as unknown as HttpStart);
    return { api, http };
  };

  it('GETs the action policy execution history endpoint', async () => {
    const { api, http } = buildApi();

    await api.listExecutionHistory();

    expect(http.get).toHaveBeenCalledWith(
      ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_API_PATH,
      expect.any(Object)
    );
  });

  it('forwards page, perPage, search and outcome as query params', async () => {
    const { api, http } = buildApi();

    await api.listExecutionHistory({
      page: 3,
      perPage: 25,
      search: 'foo',
      outcome: 'throttled',
    });

    expect(http.get).toHaveBeenCalledWith(ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_API_PATH, {
      query: { page: 3, perPage: 25, search: 'foo', outcome: 'throttled' },
    });
  });

  it('passes undefined query params when not provided', async () => {
    const { api, http } = buildApi();

    await api.listExecutionHistory();

    expect(http.get).toHaveBeenCalledWith(ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_API_PATH, {
      query: { page: undefined, perPage: undefined, search: undefined, outcome: undefined },
    });
  });

  it('returns the response from http.get', async () => {
    const { api, http } = buildApi();
    const fakeResponse = {
      items: [{ '@timestamp': '2026-05-05T10:00:00Z' }],
      page: 2,
      perPage: 25,
      totalEvents: 137,
    };
    http.get.mockResolvedValueOnce(fakeResponse);

    await expect(api.listExecutionHistory({ page: 2, perPage: 25 })).resolves.toEqual(fakeResponse);
  });

  it('propagates errors from http.get', async () => {
    const { api, http } = buildApi();
    http.get.mockRejectedValueOnce(new Error('boom'));

    await expect(api.listExecutionHistory()).rejects.toThrow('boom');
  });

  it('forwards search and outcome to countNewSince', async () => {
    const { api, http } = buildApi();
    await api.countNewSince('2026-01-01T00:00:00.000Z', { search: 'foo', outcome: 'throttled' });
    expect(http.get).toHaveBeenCalledWith(
      ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_COUNT_API_PATH,
      { query: { since: '2026-01-01T00:00:00.000Z', search: 'foo', outcome: 'throttled' } }
    );
  });
});
