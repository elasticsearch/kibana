/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import { ALERTING_V2_RULE_API_PATH } from '@kbn/alerting-v2-constants';
import { createQueryClientWrapper, createTestQueryClient } from './test_utils';
import { useFetchRule } from './use_fetch_rule';
import { RuleStateStatus } from '../types/rule_state';

const mockRule = { id: 'r1', metadata: { name: 'Rule 1' } } as unknown as RuleResponse;

const queryClient = createTestQueryClient();
const wrapper = createQueryClientWrapper(queryClient);

describe('useFetchRule', () => {
  afterEach(() => {
    queryClient.clear();
  });

  it('fetches a rule by id via http GET', async () => {
    const http = httpServiceMock.createStartContract();
    http.get.mockResolvedValueOnce(mockRule);

    const { result } = renderHook(() => useFetchRule({ id: 'r1', http }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(http.get).toHaveBeenCalledWith(`${ALERTING_V2_RULE_API_PATH}/r1`, {
      signal: expect.any(AbortSignal),
    });
    expect(result.current.data).toEqual(mockRule);
    expect(result.current.ruleState).toEqual({
      status: RuleStateStatus.loaded,
      ruleId: 'r1',
      rule: mockRule,
    });
  });

  it('does not fetch when id is undefined', () => {
    const http = httpServiceMock.createStartContract();
    const { result } = renderHook(() => useFetchRule({ id: undefined, http }), { wrapper });
    expect(http.get).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.ruleState).toEqual({ status: RuleStateStatus.idle });
  });

  it('does not show a toast when the rule is not found', async () => {
    const http = httpServiceMock.createStartContract();
    const notifications = notificationServiceMock.createStartContract();
    http.get.mockRejectedValueOnce({
      response: { status: 404 },
      body: { code: 'RULE_NOT_FOUND', error: 'Not Found', message: 'Rule not found' },
    });

    const { result } = renderHook(() => useFetchRule({ id: 'missing-rule', http, notifications }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifications.toasts.addDanger).not.toHaveBeenCalled();
    expect(result.current.ruleState).toEqual({
      status: RuleStateStatus.not_found,
      ruleId: 'missing-rule',
    });
  });

  it('shows a toast for non-404 rule fetch failures', async () => {
    const http = httpServiceMock.createStartContract();
    const notifications = notificationServiceMock.createStartContract();
    http.get.mockRejectedValueOnce({
      response: { status: 500 },
      body: { code: 'INTERNAL_ERROR', error: 'Internal Server Error', message: 'Failed' },
    });

    const { result } = renderHook(() => useFetchRule({ id: 'r1', http, notifications }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifications.toasts.addDanger).toHaveBeenCalledTimes(1);
    expect(result.current.ruleState).toEqual({
      status: RuleStateStatus.error,
      ruleId: 'r1',
      error: expect.any(Error),
    });
  });
});
