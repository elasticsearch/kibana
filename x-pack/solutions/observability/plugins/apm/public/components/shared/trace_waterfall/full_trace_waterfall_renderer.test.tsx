/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { FullTraceWaterfallRenderer } from './full_trace_waterfall_renderer';
import { FETCHER_OPERATION_IDS } from '../../../hooks/fetcher_operation_ids';
import * as useFetcherModule from '../../../hooks/use_fetcher';
import * as TraceWaterfallModule from '.';

jest.mock('react-use/lib/useEffectOnce', () => (fn: () => void) => fn());
jest.mock('../../../services/rest/create_call_apm_api', () => ({
  createCallApmApi: jest.fn(),
}));
jest.mock('.', () => ({
  TraceWaterfall: jest.fn(({ traceItems }: { traceItems: unknown[] }) => (
    <div data-test-subj="traceWaterfall">items: {traceItems.length}</div>
  )),
}));
jest.mock('react-virtualized', () => {
  const actual = jest.requireActual('react-virtualized');
  return {
    ...actual,
    AutoSizer: ({ children }: { children: (size: { width: number; height: number }) => any }) =>
      children({ width: 800, height: 600 }),
  };
});

const mockUseFetcher = jest.spyOn(useFetcherModule, 'useFetcher');
const mockTraceWaterfall = TraceWaterfallModule.TraceWaterfall as jest.Mock;

const defaultProps = {
  traceId: 'trace-123',
  rangeFrom: '2025-01-01T00:00:00.000Z',
  rangeTo: '2025-01-01T01:00:00.000Z',
  core: {} as any,
  ebt: {
    row: { element: 'row' },
    errorBadge: { element: 'errorBadge' },
    serviceBadge: { element: 'serviceBadge' },
  },
};

const renderComponent = (props = {}) =>
  render(
    <I18nProvider>
      <FullTraceWaterfallRenderer {...defaultProps} {...props} />
    </I18nProvider>
  );

describe('FullTraceWaterfallRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading indicator while pending', () => {
    mockUseFetcher.mockReturnValue({
      data: undefined,
      status: useFetcherModule.FETCH_STATUS.LOADING,
      error: undefined,
      refetch: jest.fn(),
    });

    renderComponent();

    expect(screen.getByTestId('traceWaterfallLoading')).toBeInTheDocument();
  });

  it('shows error callout when data is undefined after load', () => {
    mockUseFetcher.mockReturnValue({
      data: undefined,
      status: useFetcherModule.FETCH_STATUS.SUCCESS,
      error: undefined,
      refetch: jest.fn(),
    });

    renderComponent();

    expect(screen.getByTestId('TraceWaterfallEmbeddableNoData')).toBeInTheDocument();
  });

  it('renders TraceWaterfall when data is available', () => {
    mockUseFetcher.mockReturnValue({
      data: {
        traceItems: [{ id: 'span-1' }, { id: 'span-2' }],
        errors: [],
        agentMarks: {},
        traceDocsTotal: 2,
        maxTraceItems: 5000,
      },
      status: useFetcherModule.FETCH_STATUS.SUCCESS,
      error: undefined,
      refetch: jest.fn(),
    });

    renderComponent();

    expect(screen.getByTestId('traceWaterfall')).toBeInTheDocument();
  });

  it('calls useFetcher with the correct operationId', () => {
    mockUseFetcher.mockReturnValue({
      data: undefined,
      status: useFetcherModule.FETCH_STATUS.LOADING,
      error: undefined,
      refetch: jest.fn(),
    });

    renderComponent();

    expect(mockUseFetcher).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Array),
      expect.objectContaining({ operationId: FETCHER_OPERATION_IDS.FETCH_FULL_TRACE_WATERFALL })
    );
  });

  describe('service badge navigation', () => {
    it('passes getServiceBadgeHref to TraceWaterfall', () => {
      mockUseFetcher.mockReturnValue({
        data: {
          traceItems: [],
          errors: [],
          agentMarks: {},
          traceDocsTotal: 2,
          maxTraceItems: 5000,
        },
        status: useFetcherModule.FETCH_STATUS.SUCCESS,
        error: undefined,
        refetch: jest.fn(),
      });

      renderComponent();

      expect(mockTraceWaterfall).toHaveBeenCalledWith(
        expect.objectContaining({ getServiceBadgeHref: expect.any(Function) }),
        expect.anything()
      );
    });
  });

  describe('WaterfallSizeWarning props', () => {
    it('passes traceDocsTotal and maxTraceItems to TraceWaterfall', () => {
      mockUseFetcher.mockReturnValue({
        data: {
          traceItems: [],
          errors: [],
          agentMarks: {},
          traceDocsTotal: 20000,
          maxTraceItems: 5000,
        },
        status: useFetcherModule.FETCH_STATUS.SUCCESS,
        error: undefined,
        refetch: jest.fn(),
      });

      renderComponent();

      expect(mockTraceWaterfall).toHaveBeenCalledWith(
        expect.objectContaining({ traceDocsTotal: 20000, maxTraceItems: 5000 }),
        expect.anything()
      );
    });

    it('does not pass discoverHref to TraceWaterfall', () => {
      mockUseFetcher.mockReturnValue({
        data: {
          traceItems: [],
          errors: [],
          agentMarks: {},
          traceDocsTotal: 20000,
          maxTraceItems: 5000,
        },
        status: useFetcherModule.FETCH_STATUS.SUCCESS,
        error: undefined,
        refetch: jest.fn(),
      });

      renderComponent();

      expect(mockTraceWaterfall).toHaveBeenCalledWith(
        expect.not.objectContaining({ discoverHref: expect.anything() }),
        expect.anything()
      );
    });
  });
});
