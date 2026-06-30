/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { Wrapper } from '@kbn/alerts-ui-shared/src/common/test_utils/wrapper';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import * as api from '../apis/snooze_alert_instance';
import { useSnoozeAlertInstance } from './use_snooze_alert_instance';

jest.mock('../apis/snooze_alert_instance');

const params = { ruleId: 'rule-id', alertInstanceId: 'instance-id' };

describe('useSnoozeAlertInstance', () => {
  const http = httpServiceMock.createStartContract();
  const notifications = notificationServiceMock.createStartContract();
  const { addError, addSuccess } = notifications.toasts;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls the API with correct parameters', async () => {
    const spy = jest.spyOn(api, 'snoozeAlertInstance');

    const { result } = renderHook(() => useSnoozeAlertInstance({ http, notifications }), {
      wrapper: Wrapper,
    });

    result.current.mutate(params);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({
        http: expect.anything(),
        id: params.ruleId,
        instanceId: params.alertInstanceId,
        expiresAt: undefined,
        conditions: undefined,
        conditionOperator: undefined,
      });
    });
  });

  it('passes expiresAt and conditions to the API', async () => {
    const spy = jest.spyOn(api, 'snoozeAlertInstance');

    const { result } = renderHook(() => useSnoozeAlertInstance({ http, notifications }), {
      wrapper: Wrapper,
    });

    result.current.mutate({
      ...params,
      expiresAt: '2026-06-01T00:00:00.000Z',
      conditions: [{ type: 'severity_change' }],
      conditionOperator: 'any',
    });

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: '2026-06-01T00:00:00.000Z',
          conditions: [{ type: 'severity_change' }],
          conditionOperator: 'any',
        })
      );
    });
  });

  it('shows a success toast when the API call succeeds', async () => {
    jest.spyOn(api, 'snoozeAlertInstance').mockResolvedValue(undefined);

    const { result } = renderHook(() => useSnoozeAlertInstance({ http, notifications }), {
      wrapper: Wrapper,
    });

    result.current.mutate(params);

    await waitFor(() => {
      expect(addSuccess).toHaveBeenCalled();
    });
  });

  it('shows an error toast when the API call fails', async () => {
    jest.spyOn(api, 'snoozeAlertInstance').mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useSnoozeAlertInstance({ http, notifications }), {
      wrapper: Wrapper,
    });

    result.current.mutate(params);

    await waitFor(() => {
      expect(addError).toHaveBeenCalled();
    });
  });
});
