/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { EuiProvider } from '@elastic/eui';
import { ErrorSampleDetails } from './error_sample_detail';
import { MockApmPluginContextWrapper } from '../../../../context/apm_plugin/mock_apm_plugin_context';
import { FETCH_STATUS } from '../../../../hooks/use_fetcher';

jest.mock('../../../../hooks/use_fetcher', () => ({
  isPending: jest.fn((status: string) => status === 'loading'),
  isSuccess: jest.fn((status: string) => status === 'success'),
  FETCH_STATUS: {
    LOADING: 'loading',
    SUCCESS: 'success',
    FAILURE: 'failure',
    NOT_INITIATED: 'not_initiated',
  },
}));

jest.mock('../../../../hooks/use_apm_params', () => ({
  useAnyOfApmParams: () => ({
    path: { groupId: 'test-group-id' },
    query: {
      rangeFrom: 'now-24h',
      rangeTo: 'now',
      environment: 'ENVIRONMENT_ALL',
      kuery: '',
      errorId: 'error-id-1',
      comparisonEnabled: false,
      offset: undefined,
    },
  }),
}));

jest.mock('../../../../hooks/use_apm_router', () => ({
  useApmRouter: () => ({
    link: jest.fn(() => '/test-link'),
  }),
}));

jest.mock('../../../../hooks/use_time_range', () => ({
  useTimeRange: () => ({
    start: '2025-01-01T00:00:00.000Z',
    end: '2025-01-02T00:00:00.000Z',
  }),
}));

jest.mock('../../../../context/url_params_context/use_url_params', () => ({
  useLegacyUrlParams: () => ({
    urlParams: {
      detailTab: undefined,
      offset: undefined,
      comparisonEnabled: false,
    },
  }),
}));

jest.mock('./error_sample_contextual_insight', () => ({
  ErrorSampleContextualInsight: () => null,
}));

function Wrapper({ children }: { children?: ReactNode }) {
  return (
    <EuiProvider>
      <MemoryRouter
        initialEntries={[
          '/services/test-service/errors/test-group-id?rangeFrom=now-24h&rangeTo=now&environment=ENVIRONMENT_ALL&kuery=&errorId=error-id-1',
        ]}
      >
        <MockApmPluginContextWrapper>{children}</MockApmPluginContextWrapper>
      </MemoryRouter>
    </EuiProvider>
  );
}

const baseError = {
  '@timestamp': '2025-01-01T00:00:00.000Z',
  service: { name: 'test-service', environment: 'production' },
  error: {
    id: 'error-id-1',
    grouping_key: 'test-group-id',
    exception: [{ message: 'Test error message', type: 'Error' }],
  },
  agent: { name: 'nodejs', version: '1.2.3' },
};

describe('ErrorSampleDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders error details when transaction is undefined', () => {
    render(
      <ErrorSampleDetails
        onSampleClick={jest.fn()}
        errorSampleIds={['error-id-1']}
        errorSamplesFetchStatus={FETCH_STATUS.SUCCESS}
        errorData={{ error: baseError as any, transaction: undefined }}
        errorFetchStatus={FETCH_STATUS.SUCCESS}
        occurrencesCount={1}
      />,
      { wrapper: Wrapper }
    );

    expect(screen.getByText('Error sample')).toBeInTheDocument();
    expect(screen.queryByText('Error while fetching resource')).not.toBeInTheDocument();
  });

  it('renders error details with transaction that has no sampled field', () => {
    const transactionWithoutSampled = {
      trace: { id: 'trace-abc' },
      transaction: {
        id: 'txn-abc',
        name: 'GET /api/test',
        type: 'request',
        duration: { us: 1500 },
      },
      service: { name: 'test-service' },
      agent: { name: 'nodejs' },
    };

    render(
      <ErrorSampleDetails
        onSampleClick={jest.fn()}
        errorSampleIds={['error-id-1']}
        errorSamplesFetchStatus={FETCH_STATUS.SUCCESS}
        errorData={{
          error: baseError as any,
          transaction: transactionWithoutSampled as any,
        }}
        errorFetchStatus={FETCH_STATUS.SUCCESS}
        occurrencesCount={1}
      />,
      { wrapper: Wrapper }
    );

    expect(screen.getByText('Error sample')).toBeInTheDocument();
    expect(screen.getByText('GET /api/test')).toBeInTheDocument();
  });

  it('does not show loading skeleton when data is loaded', () => {
    render(
      <ErrorSampleDetails
        onSampleClick={jest.fn()}
        errorSampleIds={['error-id-1']}
        errorSamplesFetchStatus={FETCH_STATUS.SUCCESS}
        errorData={{ error: baseError as any, transaction: undefined }}
        errorFetchStatus={FETCH_STATUS.SUCCESS}
        occurrencesCount={1}
      />,
      { wrapper: Wrapper }
    );

    expect(screen.queryByTestId('loading-content')).not.toBeInTheDocument();
    expect(screen.getByText('Error sample')).toBeInTheDocument();
  });

  it('renders issue context for the selected error sample', () => {
    render(
      <ErrorSampleDetails
        onSampleClick={jest.fn()}
        errorSampleIds={['error-id-1']}
        errorSamplesFetchStatus={FETCH_STATUS.SUCCESS}
        errorData={{ error: baseError as any, transaction: undefined }}
        errorFetchStatus={FETCH_STATUS.SUCCESS}
        occurrencesCount={3}
      />,
      { wrapper: Wrapper }
    );

    expect(screen.getByText('Issue context')).toBeInTheDocument();
    expect(screen.getByText('Group ID')).toBeInTheDocument();
    expect(screen.getByText('test-group-id')).toBeInTheDocument();
    expect(screen.getByText('Occurrences')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('SDK')).toBeInTheDocument();
    expect(screen.getByText('nodejs 1.2.3')).toBeInTheDocument();
  });
});
