/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { Wrapper } from '@kbn/alerts-ui-shared/src/common/test_utils/wrapper';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import * as api from '../apis/get_muted_alerts_instances_by_rule';
import { useGetAlertSnoozeStateQuery } from './use_get_alert_snooze_state_query';

jest.mock('../apis/get_muted_alerts_instances_by_rule');

const ruleIds = ['a', 'b'];

describe('useGetAlertSnoozeStateQuery', () => {
  const http = httpServiceMock.createStartContract();
  const notifications = notificationServiceMock.createStartContract();
  const addErrorMock = notifications.toasts.addError;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls the api when invoked with the correct parameters', async () => {
    const spy = jest.spyOn(api, 'getAlertSnoozeStateByRule');

    renderHook(() => useGetAlertSnoozeStateQuery({ http, notifications, ruleIds }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ ruleIds })));
  });

  it('does not call the api if the enabled option is false', async () => {
    const spy = jest.spyOn(api, 'getAlertSnoozeStateByRule');

    renderHook(
      () => useGetAlertSnoozeStateQuery({ http, notifications, ruleIds }, { enabled: false }),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(spy).not.toHaveBeenCalled());
  });

  it('shows a toast error when the api returns an error', async () => {
    const spy = jest
      .spyOn(api, 'getAlertSnoozeStateByRule')
      .mockRejectedValue(new Error('An error'));

    renderHook(() => useGetAlertSnoozeStateQuery({ http, notifications, ruleIds }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(spy).toHaveBeenCalled());
    await waitFor(() => expect(addErrorMock).toHaveBeenCalled());
  });
});
