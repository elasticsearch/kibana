/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { FocusedTraceWaterfallRenderer } from './focused_trace_waterfall_renderer';
import { FETCHER_OPERATION_IDS } from '../../../hooks/fetcher_operation_ids';
import * as useFetcherModule from '../../../hooks/use_fetcher';
import * as FocusedTraceWaterfallModule from '.';

jest.mock('react-use/lib/useEffectOnce', () => (fn: () => void) => fn());
jest.mock('../../../services/rest/create_call_apm_api', () => ({
  createCallApmApi: jest.fn(),
}));
jest.mock('.', () => ({
  FocusedTraceWaterfall: jest.fn(() => <div data-test-subj="focusedTraceWaterfall" />),
}));

const mockUseFetcher = jest.spyOn(useFetcherModule, 'useFetcher');
const mockFocusedTraceWaterfall = FocusedTraceWaterfallModule.FocusedTraceWaterfall as jest.Mock;

const mockData = {
  traceItems: null,
  summary: null,
};

const defaultProps = {
  traceId: 'trace-123',
  rangeFrom: '2025-01-01T00:00:00.000Z',
  rangeTo: '2025-01-01T01:00:00.000Z',
  core: {
    application: {
      getUrlForApp: jest.fn().mockReturnValue('/app/apm/services/my-service/overview'),
    },
  } as any,
};

const renderComponent = (props = {}) =>
  render(
    <I18nProvider>
      <FocusedTraceWaterfallRenderer {...defaultProps} {...props} />
    </I18nProvider>
  );

describe('FocusedTraceWaterfallRenderer', () => {
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

    expect(screen.getByTestId('FocusedTraceWaterfallEmbeddableNoData')).toBeInTheDocument();
  });

  it('renders FocusedTraceWaterfall when data is available', () => {
    mockUseFetcher.mockReturnValue({
      data: mockData,
      status: useFetcherModule.FETCH_STATUS.SUCCESS,
      error: undefined,
      refetch: jest.fn(),
    });

    renderComponent();

    expect(screen.getByTestId('focusedTraceWaterfall')).toBeInTheDocument();
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
      expect.objectContaining({ operationId: FETCHER_OPERATION_IDS.FETCH_FOCUSED_TRACE_WATERFALL })
    );
  });

  describe('service badge navigation', () => {
    it('passes getServiceBadgeHref to FocusedTraceWaterfall', () => {
      mockUseFetcher.mockReturnValue({
        data: mockData,
        status: useFetcherModule.FETCH_STATUS.SUCCESS,
        error: undefined,
        refetch: jest.fn(),
      });

      renderComponent();

      expect(mockFocusedTraceWaterfall).toHaveBeenCalledWith(
        expect.objectContaining({ getServiceBadgeHref: expect.any(Function) }),
        expect.anything()
      );
    });
  });
});
