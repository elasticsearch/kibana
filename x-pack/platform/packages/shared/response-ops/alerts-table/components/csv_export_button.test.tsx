/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PropsWithChildren } from 'react';
import React from 'react';
import 'moment-timezone';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { renderingServiceMock } from '@kbn/core-rendering-browser-mocks';
import { applicationServiceMock } from '@kbn/core-application-browser-mocks';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { CsvExportButton } from './csv_export_button';
import { testQueryClientConfig } from '../utils/test';

jest.mock('../contexts/alerts_table_context', () => {
  const actual = jest.requireActual('../contexts/alerts_table_context');
  return {
    ...actual,
    useAlertsTableContext: jest.fn(),
  };
});

const { useAlertsTableContext } = jest.requireMock('../contexts/alerts_table_context');

jest.mock('@kbn/alerts-ui-shared', () => ({
  useFetchAlertsIndexNamesQuery: jest.fn().mockReturnValue({
    data: ['.alerts-security.alerts-default'],
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('@kbn/react-kibana-mount', () => ({
  toMountPoint: jest.fn((node) => node),
}));

jest.mock('@kbn/rison', () => ({
  encode: jest.fn((val) => JSON.stringify(val)),
}));

const queryClient = new QueryClient(testQueryClientConfig);

const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('CsvExportButton', () => {
  const http = httpServiceMock.createStartContract();
  const notifications = notificationServiceMock.createStartContract();
  const application = applicationServiceMock.createStartContract();
  const settings = {
    client: {
      get: jest.fn().mockReturnValue('UTC'),
    },
  };

  const defaultContext = {
    kibanaVersion: '9.5.0',
    services: {
      http,
      notifications,
      rendering: renderingServiceMock.create(),
      settings,
      application,
    },
    ruleTypeIds: ['siem.queryRule'],
    consumers: ['siem'],
    query: { bool: { must: [{ match_all: {} }] } },
    sort: [{ '@timestamp': { order: 'desc' as const } }],
    columns: [{ id: 'kibana.alert.rule.name' }, { id: '@timestamp' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    application.capabilities = {
      ...application.capabilities,
      reportingLegacy: { generateReport: true },
    };
    useAlertsTableContext.mockReturnValue(defaultContext);
    http.post.mockResolvedValue({});
  });

  it('renders the export button', () => {
    render(<CsvExportButton />, { wrapper });
    expect(screen.getByTestId('alerts-csv-export-button')).toBeInTheDocument();
  });

  it('renders the export button when dashboard_v2.downloadCsv is true', () => {
    application.capabilities = {
      ...application.capabilities,
      reportingLegacy: { generateReport: false },
      dashboard_v2: { downloadCsv: true },
    };
    useAlertsTableContext.mockReturnValue(defaultContext);

    render(<CsvExportButton />, { wrapper });
    expect(screen.getByTestId('alerts-csv-export-button')).toBeInTheDocument();
  });

  it('does not render the export button when the user lacks reporting capabilities', () => {
    application.capabilities = {
      ...application.capabilities,
      reportingLegacy: { generateReport: false },
      dashboard_v2: { downloadCsv: false },
    };
    useAlertsTableContext.mockReturnValue(defaultContext);

    const { container } = render(<CsvExportButton />, { wrapper });
    expect(container).toBeEmptyDOMElement();
  });

  it('calls the reporting API with correct params on click', async () => {
    render(<CsvExportButton />, { wrapper });
    await userEvent.click(screen.getByTestId('alerts-csv-export-button'));

    await waitFor(() => {
      expect(http.post).toHaveBeenCalledTimes(1);
    });

    const [url, options] = http.post.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toContain('/csv_searchsource');
    const body = JSON.parse(options.body);
    expect(body.jobParams).toBeDefined();
  });

  it('fetches alert index names via the query hook', () => {
    const { useFetchAlertsIndexNamesQuery } = jest.requireMock('@kbn/alerts-ui-shared');
    render(<CsvExportButton />, { wrapper });

    expect(useFetchAlertsIndexNamesQuery).toHaveBeenCalledWith({
      http,
      ruleTypeIds: ['siem.queryRule'],
    });
  });

  it('shows a success toast on successful export', async () => {
    render(<CsvExportButton />, { wrapper });
    await userEvent.click(screen.getByTestId('alerts-csv-export-button'));

    await waitFor(() => {
      expect(notifications.toasts.addSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'CSV report queued for generation',
          'data-test-subj': 'csvExportStarted',
        })
      );
    });
  });

  it('shows a danger toast on export failure', async () => {
    http.post.mockRejectedValue({ message: 'Something went wrong' });

    render(<CsvExportButton />, { wrapper });
    await userEvent.click(screen.getByTestId('alerts-csv-export-button'));

    await waitFor(() => {
      expect(notifications.toasts.addDanger).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Failed to generate CSV report',
          text: 'Something went wrong',
          'data-test-subj': 'csvExportFailed',
        })
      );
    });
  });

  it('shows a danger toast with body.message when available', async () => {
    http.post.mockRejectedValue({ body: { message: 'Detailed error' } });

    render(<CsvExportButton />, { wrapper });
    await userEvent.click(screen.getByTestId('alerts-csv-export-button'));

    await waitFor(() => {
      expect(notifications.toasts.addDanger).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Detailed error',
        })
      );
    });
  });

  it('includes consumer and ruleTypeId filters in the request', async () => {
    render(<CsvExportButton />, { wrapper });
    await userEvent.click(screen.getByTestId('alerts-csv-export-button'));

    await waitFor(() => {
      expect(http.post).toHaveBeenCalledTimes(1);
    });

    const body = JSON.parse(
      (http.post.mock.calls[0] as unknown as [string, { body: string }])[1].body
    );
    const jobParams = JSON.parse(body.jobParams);
    const filterQueries = jobParams.searchSource.filter.map(
      (f: { query: Record<string, unknown> }) => f.query
    );

    expect(filterQueries).toEqual(
      expect.arrayContaining([
        { terms: { 'kibana.alert.rule.rule_type_id': ['siem.queryRule'] } },
        { terms: { 'kibana.alert.rule.consumer': ['siem'] } },
      ])
    );
  });

  it('includes ids filter when query has ids', async () => {
    useAlertsTableContext.mockReturnValue({
      ...defaultContext,
      query: { ids: { values: ['id-1', 'id-2'] } },
    });

    render(<CsvExportButton />, { wrapper });
    await userEvent.click(screen.getByTestId('alerts-csv-export-button'));

    await waitFor(() => {
      expect(http.post).toHaveBeenCalledTimes(1);
    });

    const body = JSON.parse(
      (http.post.mock.calls[0] as unknown as [string, { body: string }])[1].body
    );
    const jobParams = JSON.parse(body.jobParams);
    const filterQueries = jobParams.searchSource.filter.map(
      (f: { query: Record<string, unknown> }) => f.query
    );

    expect(filterQueries).toEqual(expect.arrayContaining([{ ids: { values: ['id-1', 'id-2'] } }]));
  });

  it('skips consumer filter when consumers is empty', async () => {
    useAlertsTableContext.mockReturnValue({
      ...defaultContext,
      consumers: [],
    });

    render(<CsvExportButton />, { wrapper });
    await userEvent.click(screen.getByTestId('alerts-csv-export-button'));

    await waitFor(() => {
      expect(http.post).toHaveBeenCalledTimes(1);
    });

    const body = JSON.parse(
      (http.post.mock.calls[0] as unknown as [string, { body: string }])[1].body
    );
    const jobParams = JSON.parse(body.jobParams);
    const hasConsumerFilter = jobParams.searchSource.filter.some(
      (f: { query: Record<string, unknown> }) =>
        (f.query.terms as Record<string, unknown> | undefined)?.['kibana.alert.rule.consumer']
    );

    expect(hasConsumerFilter).toBe(false);
  });

  it('includes the kibana version in the request', async () => {
    render(<CsvExportButton />, { wrapper });
    await userEvent.click(screen.getByTestId('alerts-csv-export-button'));

    await waitFor(() => {
      expect(http.post).toHaveBeenCalledTimes(1);
    });

    const body = JSON.parse(
      (http.post.mock.calls[0] as unknown as [string, { body: string }])[1].body
    );
    const jobParams = JSON.parse(body.jobParams);

    expect(jobParams.version).toBe('9.5.0');
  });

  it('maps column ids correctly', async () => {
    render(<CsvExportButton />, { wrapper });
    await userEvent.click(screen.getByTestId('alerts-csv-export-button'));

    await waitFor(() => {
      expect(http.post).toHaveBeenCalledTimes(1);
    });

    const body = JSON.parse(
      (http.post.mock.calls[0] as unknown as [string, { body: string }])[1].body
    );
    const jobParams = JSON.parse(body.jobParams);

    expect(jobParams.columns).toEqual(['kibana.alert.rule.name', '@timestamp']);
  });

  it('disables the button while exporting', async () => {
    let resolvePost: (value: unknown) => void;
    http.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        })
    );

    render(<CsvExportButton />, { wrapper });
    await userEvent.click(screen.getByTestId('alerts-csv-export-button'));

    await waitFor(() => {
      expect(screen.getByTestId('alerts-csv-export-button')).toBeDisabled();
    });

    resolvePost!({});

    await waitFor(() => {
      expect(screen.getByTestId('alerts-csv-export-button')).toBeEnabled();
    });
  });
});
