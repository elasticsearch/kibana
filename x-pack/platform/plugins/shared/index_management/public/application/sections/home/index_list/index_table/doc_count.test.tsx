/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import { DocCountCell } from './doc_count';
import { RequestResultType } from './get_doc_count';

jest.mock('react-use/lib/useObservable', () => jest.fn());

const mockedUseObservable = jest.requireMock('react-use/lib/useObservable');

describe('DocCountCell', () => {
  const docCountApi = {
    getByName: jest.fn(),
    getObservable: jest.fn(),
    abort: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Ensure we don't leave work in the React scheduler between tests.
    jest.runOnlyPendingTimers();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shows a spinner while loading and requests the count for the index', () => {
    mockedUseObservable.mockReturnValue(undefined);

    render(<DocCountCell indexName="index-a" docCountApi={docCountApi} status="open" />);

    // Triggers request
    expect(docCountApi.getByName).toHaveBeenCalledWith('index-a');

    // Loading spinner rendered
    expect(screen.getByTestId('docCountLoadingSpinner')).toBeInTheDocument();
  });

  it('renders an error label when the index count failed to load and no metadata count is available', () => {
    mockedUseObservable.mockReturnValue({
      'index-a': { status: RequestResultType.Error },
    });

    render(<DocCountCell indexName="index-a" docCountApi={docCountApi} />);

    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders the metadata count with an info icon instead of "Error" when ES|QL fails but metadata is available', () => {
    mockedUseObservable.mockReturnValue({
      'index-a': { status: RequestResultType.Error },
    });

    render(<DocCountCell indexName="index-a" docCountApi={docCountApi} metadataCount={500} />);

    // Should show the formatted count, not "Error"
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument();
  });

  it('waits for index stats before requesting the count when status and metadata are missing', () => {
    mockedUseObservable.mockReturnValue(undefined);

    const { rerender } = render(<DocCountCell indexName="index-a" docCountApi={docCountApi} />);

    expect(docCountApi.getByName).not.toHaveBeenCalled();
    expect(screen.getByTestId('docCountLoadingSpinner')).toBeInTheDocument();

    rerender(<DocCountCell indexName="index-a" docCountApi={docCountApi} status="open" />);

    expect(docCountApi.getByName).toHaveBeenCalledWith('index-a');
  });

  it('does not request the count when delayed index stats identify the index as closed', () => {
    mockedUseObservable.mockReturnValue(undefined);

    const { rerender } = render(<DocCountCell indexName="index-a" docCountApi={docCountApi} />);

    expect(docCountApi.getByName).not.toHaveBeenCalled();

    rerender(
      <DocCountCell
        indexName="index-a"
        docCountApi={docCountApi}
        metadataCount={42}
        status="closed"
      />
    );

    expect(docCountApi.getByName).not.toHaveBeenCalled();
    expect(screen.getByText(/42/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Approximate — actual document count may be lower. Exact counts are not available for closed indices.'
      )
    ).toBeInTheDocument();
  });

  it.each(['close', 'closed'])(
    'renders the metadata count directly for a closed index with status %s without calling getByName',
    (status) => {
      // Observable returns nothing for closed index (getByName was never called)
      mockedUseObservable.mockReturnValue({});

      render(
        <DocCountCell
          indexName="index-a"
          docCountApi={docCountApi}
          metadataCount={42}
          status={status}
        />
      );

      // getByName must NOT be called for closed indices
      expect(docCountApi.getByName).not.toHaveBeenCalled();

      // The metadata count should be rendered
      expect(screen.getByText(/42/)).toBeInTheDocument();
      expect(
        screen.getByText(
          'Approximate — actual document count may be lower. Exact counts are not available for closed indices.'
        )
      ).toBeInTheDocument();
    }
  );

  it('renders the formatted count when available', () => {
    mockedUseObservable.mockReturnValue({
      'index-a': { status: RequestResultType.Success, count: 1000 },
    });

    render(<DocCountCell indexName="index-a" docCountApi={docCountApi} />);

    expect(screen.getByText(Number(1000).toLocaleString())).toBeInTheDocument();
  });
});
