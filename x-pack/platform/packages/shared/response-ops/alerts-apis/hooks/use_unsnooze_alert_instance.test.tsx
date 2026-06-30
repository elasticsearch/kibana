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
import * as api from '../apis/unsnooze_alert_instance';
import { useUnsnoozeAlertInstance } from './use_unsnooze_alert_instance';

jest.mock('../apis/unsnooze_alert_instance');

const params = { ruleId: 'rule-id', alertInstanceId: 'instance-id' };

describe('useUnsnoozeAlertInstance', () => {
  const http = httpServiceMock.createStartContract();
  const notifications = notificationServiceMock.createStartContract();
  const { addError, addSuccess } = notifications.toasts;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls the API with correct parameters', async () => {
    const spy = jest.spyOn(api, 'unsnoozeAlertInstance');

    const { result } = renderHook(() => useUnsnoozeAlertInstance({ http, notifications }), {
      wrapper: Wrapper,
    });

    result.current.mutate(params);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({
        http: expect.anything(),
        id: params.ruleId,
        instanceId: params.alertInstanceId,
      });
    });
  });

  it('shows a success toast when the API call succeeds', async () => {
    jest.spyOn(api, 'unsnoozeAlertInstance').mockResolvedValue(undefined);

    const { result } = renderHook(() => useUnsnoozeAlertInstance({ http, notifications }), {
      wrapper: Wrapper,
    });

    result.current.mutate(params);

    await waitFor(() => {
      expect(addSuccess).toHaveBeenCalled();
    });
  });

  it('shows an error toast when the API call fails', async () => {
    jest.spyOn(api, 'unsnoozeAlertInstance').mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useUnsnoozeAlertInstance({ http, notifications }), {
      wrapper: Wrapper,
    });

    result.current.mutate(params);

    await waitFor(() => {
      expect(addError).toHaveBeenCalled();
    });
  });
});
