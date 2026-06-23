/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import {
  DATA_VIEW_ERROR_TEST_ID,
  DATA_VIEW_LOADING_PROMPT_TEST_ID,
  SKELETON_TEST_ID,
  Wrapper,
} from './wrapper';
import { TestProviders } from '../../../common/mock';
import { useDataView } from '../../../data_view_manager/hooks/use_data_view';
import type { DataView } from '@kbn/data-views-plugin/common';
import { createStubDataView } from '@kbn/data-views-plugin/common/data_views/data_view.stub';

jest.mock('../../../common/hooks/use_experimental_features');
jest.mock('../../../data_view_manager/hooks/use_data_view');
jest.mock('./content', () => ({
  AlertsPageContent: () => <div data-test-subj={'alerts-page-content'} />,
}));

const dataView: DataView = createStubDataView({ spec: {} });

describe('<Wrapper />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render a loading skeleton if the dataView status is pristine', async () => {
    (useDataView as jest.Mock).mockReturnValue({ dataView, status: 'pristine' });

    render(
      <TestProviders>
        <Wrapper />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId(DATA_VIEW_LOADING_PROMPT_TEST_ID)).toBeInTheDocument();
      expect(screen.getByTestId(SKELETON_TEST_ID)).toBeInTheDocument();
    });
  });

  it('should render a loading skeleton if the dataView status is loading', async () => {
    (useDataView as jest.Mock).mockReturnValue({ dataView, status: 'loading' });

    render(
      <TestProviders>
        <Wrapper />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId(DATA_VIEW_LOADING_PROMPT_TEST_ID)).toBeInTheDocument();
      expect(screen.getByTestId(SKELETON_TEST_ID)).toBeInTheDocument();
    });
  });

  it('should render an error if the dataView status is error', async () => {
    (useDataView as jest.Mock).mockReturnValue({
      dataView: undefined,
      status: 'error',
    });

    render(
      <TestProviders>
        <Wrapper />
      </TestProviders>
    );

    expect(await screen.findByTestId(DATA_VIEW_LOADING_PROMPT_TEST_ID)).toBeInTheDocument();
    expect(await screen.findByTestId(DATA_VIEW_ERROR_TEST_ID)).toHaveTextContent(
      'Unable to retrieve the data view'
    );
  });

  it('should render an error if the dataView status is ready but it has no indices', async () => {
    (useDataView as jest.Mock).mockReturnValue({
      dataView: {
        ...dataView,
        getRuntimeMappings: jest.fn(),
        hasMatchedIndices: jest.fn().mockReturnValue(false),
      },
      status: 'ready',
    });

    render(
      <TestProviders>
        <Wrapper />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId(DATA_VIEW_LOADING_PROMPT_TEST_ID)).toBeInTheDocument();
      expect(screen.getByTestId(DATA_VIEW_ERROR_TEST_ID)).toHaveTextContent(
        'Unable to retrieve the data view'
      );
    });
  });

  it('should render the content', async () => {
    (useDataView as jest.Mock).mockReturnValue({
      dataView: {
        ...dataView,
        id: 'id',
        getIndexPattern: jest.fn().mockReturnValue('title'),
        getRuntimeMappings: jest.fn(),
        hasMatchedIndices: jest.fn().mockReturnValue(true),
      },
      status: 'ready',
    });

    render(
      <TestProviders>
        <Wrapper />
      </TestProviders>
    );

    expect(await screen.findByTestId(DATA_VIEW_LOADING_PROMPT_TEST_ID)).toBeInTheDocument();
    expect(await screen.findByTestId('alerts-page-content')).toBeInTheDocument();
  });
});
