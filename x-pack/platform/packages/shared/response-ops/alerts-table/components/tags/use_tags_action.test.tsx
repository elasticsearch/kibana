/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { PropsWithChildren } from 'react';
import { act, waitFor, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { useTagsAction } from './use_tags_action';
import type { Alert } from '@kbn/alerting-types';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { AlertsQueryContext } from '@kbn/alerts-ui-shared/src/common/contexts/alerts_query_context';
import { testQueryClientConfig } from '@kbn/alerts-ui-shared/src/common/test_utils/test_query_client_config';

jest.mock('../../contexts/alerts_table_context', () => {
  const actual = jest.requireActual('../../contexts/alerts_table_context');
  return {
    ...actual,
    useAlertsTableContext: jest.fn(),
  };
});

const { useAlertsTableContext } = jest.requireMock('../../contexts/alerts_table_context');

const queryClient = new QueryClient(testQueryClientConfig);

const wrapper = ({ children }: PropsWithChildren) => {
  return (
    <QueryClientProvider client={queryClient} context={AlertsQueryContext}>
      {children}
    </QueryClientProvider>
  );
};

describe('useTagsAction', () => {
  const mockAlert = {
    _id: 'alert-1',
    _index: 'test-index',
    ALERT_WORKFLOW_TAGS: ['coke', 'pepsi'],
  } as unknown as Alert;

  const onActionSuccess = jest.fn();
  const onActionError = jest.fn();
  const http = httpServiceMock.createStartContract();
  const notifications = notificationServiceMock.createStartContract();

  beforeEach(() => {
    jest.clearAllMocks();
    http.post.mockResolvedValue({});
    useAlertsTableContext.mockReturnValue({
      services: {
        http,
        notifications,
      },
    });
  });

  it('renders an action', async () => {
    const { result } = renderHook(
      () =>
        useTagsAction({
          onActionSuccess,
          onActionError,
          isDisabled: false,
        }),
      { wrapper }
    );

    expect(result.current.getAction([mockAlert])).toMatchInlineSnapshot(`
      Object {
        "data-test-subj": "alerts-bulk-action-tags",
        "disabled": false,
        "icon": <EuiIcon
          aria-hidden={true}
          size="m"
          type="tag"
        />,
        "key": "alerts-bulk-action-tags",
        "name": "Edit tags",
        "onClick": [Function],
      }
    `);
  });

  it('processes the tags correctly', async () => {
    const { result } = renderHook(
      () => useTagsAction({ onActionSuccess, onActionError, isDisabled: false }),
      { wrapper }
    );

    const action = result.current.getAction([mockAlert]);

    act(() => {
      action.onClick();
    });

    expect(result.current.isFlyoutOpen).toBe(true);

    act(() => {
      result.current.onSaveTags({ selectedItems: ['one'], unSelectedItems: ['pepsi'] });
    });

    await waitFor(() => {
      expect(result.current.isFlyoutOpen).toBe(false);
    });

    await waitFor(() => {
      expect(http.post).toHaveBeenCalled();
    });

    expect(http.post).toHaveBeenCalledWith('/internal/rac/alerts/tags', {
      body: JSON.stringify({
        index: '.alerts-observability*,.alerts-stack*',
        alertIds: ['alert-1'],
        add: ['one'],
        remove: ['pepsi'],
      }),
    });

    await waitFor(() => {
      expect(onActionSuccess).toHaveBeenCalledTimes(1);
    });
    expect(onActionError).not.toHaveBeenCalled();
  });

  it('opens and closes the flyout correctly', async () => {
    const { result } = renderHook(
      () => useTagsAction({ onActionSuccess, onActionError, isDisabled: false }),
      { wrapper }
    );

    const action = result.current.getAction([mockAlert]);

    // Initially closed
    expect(result.current.isFlyoutOpen).toBe(false);

    // Open the flyout
    act(() => {
      action.onClick();
    });

    expect(result.current.isFlyoutOpen).toBe(true);

    // Close the flyout
    act(() => {
      result.current.onClose();
    });

    await waitFor(() => {
      expect(result.current.isFlyoutOpen).toBe(false);
    });

    // Callbacks should not be called when just closing the flyout
    expect(onActionSuccess).not.toHaveBeenCalled();
    expect(onActionError).not.toHaveBeenCalled();
  });

  it('handles multiple alerts', async () => {
    const { result } = renderHook(
      () => useTagsAction({ onActionSuccess, onActionError, isDisabled: false }),
      { wrapper }
    );

    const mockAlert2 = {
      ...mockAlert,
      _id: 'alert-2',
      ALERT_WORKFLOW_TAGS: ['one', 'three'],
    } as unknown as Alert;

    const action = result.current.getAction([mockAlert, mockAlert2]);

    act(() => {
      action.onClick();
    });

    expect(result.current.isFlyoutOpen).toBe(true);

    act(() => {
      result.current.onSaveTags({ selectedItems: ['one', 'two'], unSelectedItems: ['pepsi'] });
    });

    await waitFor(() => {
      expect(result.current.isFlyoutOpen).toBe(false);
    });

    await waitFor(() => {
      expect(http.post).toHaveBeenCalled();
    });

    expect(http.post).toHaveBeenCalledWith('/internal/rac/alerts/tags', {
      body: JSON.stringify({
        index: '.alerts-observability*,.alerts-stack*',
        alertIds: ['alert-1', 'alert-2'],
        add: ['one', 'two'],
        remove: ['pepsi'],
      }),
    });

    await waitFor(() => {
      expect(onActionSuccess).toHaveBeenCalledTimes(1);
    });
    expect(onActionError).not.toHaveBeenCalled();
  });

  it('calls onActionError when the API request fails', async () => {
    http.post.mockRejectedValue(new Error('API Error'));

    const { result } = renderHook(
      () => useTagsAction({ onActionSuccess, onActionError, isDisabled: false }),
      { wrapper }
    );

    const action = result.current.getAction([mockAlert]);

    act(() => {
      action.onClick();
    });

    expect(result.current.isFlyoutOpen).toBe(true);

    act(() => {
      result.current.onSaveTags({ selectedItems: ['one'], unSelectedItems: ['pepsi'] });
    });

    await waitFor(() => {
      expect(http.post).toHaveBeenCalled();
    });

    expect(http.post).toHaveBeenCalledWith('/internal/rac/alerts/tags', {
      body: JSON.stringify({
        index: '.alerts-observability*,.alerts-stack*',
        alertIds: ['alert-1'],
        add: ['one'],
        remove: ['pepsi'],
      }),
    });

    await waitFor(() => {
      expect(onActionError).toHaveBeenCalledTimes(1);
    });
    expect(onActionSuccess).not.toHaveBeenCalled();
  });
});
