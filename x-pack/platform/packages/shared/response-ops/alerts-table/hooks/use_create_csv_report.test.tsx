/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PropsWithChildren } from 'react';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { renderingServiceMock } from '@kbn/core-rendering-browser-mocks';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { useCreateCsvReport } from './use_create_csv_report';
import { testQueryClientConfig } from '../utils/test';

jest.mock('../apis/create_csv_report', () => ({
  createCsvReport: jest.fn(),
}));

jest.mock('@kbn/react-kibana-mount', () => ({
  toMountPoint: jest.fn((node) => node),
}));

const { createCsvReport } = jest.requireMock('../apis/create_csv_report');

const http = httpServiceMock.createStartContract();
const notifications = notificationServiceMock.createStartContract();
const rendering = renderingServiceMock.create();

const queryClient = new QueryClient(testQueryClientConfig);

const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const variables = {
  title: 'Alerts',
  objectType: 'alert',
  browserTimezone: 'UTC',
  version: '9.5.0',
  columns: ['kibana.alert.rule.name'],
  searchSource: {
    index: { title: '.alerts-default', timeFieldName: '@timestamp' },
    query: { query: '', language: 'kuery' as const },
    filter: [],
    sort: [],
  },
};

describe('useCreateCsvReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('calls createCsvReport with the correct params', async () => {
    createCsvReport.mockResolvedValue(undefined);

    const { result } = renderHook(() => useCreateCsvReport({ http, notifications, rendering }), {
      wrapper,
    });

    result.current.mutate(variables);

    await waitFor(() => expect(createCsvReport).toHaveBeenCalledTimes(1));

    expect(createCsvReport).toHaveBeenCalledWith({ http, ...variables });
  });

  it('shows a success toast with the reporting link on successful export', async () => {
    createCsvReport.mockResolvedValue(undefined);

    const { result } = renderHook(() => useCreateCsvReport({ http, notifications, rendering }), {
      wrapper,
    });

    result.current.mutate(variables);

    await waitFor(() =>
      expect(notifications.toasts.addSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'CSV report queued for generation',
          'data-test-subj': 'csvExportStarted',
        })
      )
    );
  });

  it('does not show a success toast when rendering is undefined', async () => {
    createCsvReport.mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useCreateCsvReport({ http, notifications, rendering: undefined }),
      { wrapper }
    );

    result.current.mutate(variables);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(notifications.toasts.addSuccess).not.toHaveBeenCalled();
  });

  it('shows a danger toast with body.message on failure', async () => {
    createCsvReport.mockRejectedValue({ body: { message: 'Detailed error' } });

    const { result } = renderHook(() => useCreateCsvReport({ http, notifications, rendering }), {
      wrapper,
    });

    result.current.mutate(variables);

    await waitFor(() =>
      expect(notifications.toasts.addDanger).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Failed to generate CSV report',
          text: 'Detailed error',
          'data-test-subj': 'csvExportFailed',
        })
      )
    );
  });

  it('falls back to error.message when body.message is absent', async () => {
    createCsvReport.mockRejectedValue(new Error('Something went wrong'));

    const { result } = renderHook(() => useCreateCsvReport({ http, notifications, rendering }), {
      wrapper,
    });

    result.current.mutate(variables);

    await waitFor(() =>
      expect(notifications.toasts.addDanger).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Something went wrong' })
      )
    );
  });
});
