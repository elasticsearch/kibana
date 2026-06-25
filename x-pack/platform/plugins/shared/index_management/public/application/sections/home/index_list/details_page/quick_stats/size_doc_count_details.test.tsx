/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import { useAppContext } from '../../../../../app_context';
import type { DocCountState } from './quick_stats';
import { SizeDocCountDetails } from './size_doc_count_details';

jest.mock('../../../../../app_context', () => ({
  useAppContext: jest.fn(),
}));

const mockUseAppContext = jest.mocked(useAppContext);

const renderComponent = ({
  size = '10.5mb',
  docCount,
}: {
  size?: string;
  docCount: DocCountState;
}) => {
  return render(<SizeDocCountDetails size={size} docCount={docCount} />);
};

describe('SizeDocCountDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppContext.mockReturnValue({
      config: { enableSizeAndDocCount: true },
    } as ReturnType<typeof useAppContext>);
  });

  it('renders nothing when enableSizeAndDocCount is disabled', () => {
    mockUseAppContext.mockReturnValue({
      config: { enableSizeAndDocCount: false },
    } as ReturnType<typeof useAppContext>);

    const { container } = renderComponent({
      docCount: { isLoading: false, isError: false, count: 5 },
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the size in the card content', () => {
    renderComponent({
      size: '42.3mb',
      docCount: { isLoading: false, isError: false, count: 0 },
    });

    expect(screen.getByText('42.3mb')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('shows a loading spinner while doc count is loading', () => {
    renderComponent({
      docCount: { isLoading: true, isError: false },
    });

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows a warning when doc count has an error', () => {
    renderComponent({
      docCount: { isLoading: false, isError: true },
    });

    expect(screen.getByText('Unable to retrieve')).toBeInTheDocument();
  });

  it('shows the formatted doc count on success', () => {
    renderComponent({
      docCount: { isLoading: false, isError: false, count: 1234 },
    });

    expect(screen.getByText(Number(1234).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText('Documents')).toBeInTheDocument();
  });

  it('shows the read-access tooltip when metadata count is used after an exact count failure', () => {
    renderComponent({
      docCount: {
        isLoading: false,
        isError: false,
        count: 1234,
        approximateReason: 'requires_read',
      },
    });

    expect(
      screen.getByText(
        'Approximate — actual document count may be lower. An exact count requires read access.'
      )
    ).toBeInTheDocument();
  });

  it('shows the closed-index tooltip when metadata count is used for a closed index', () => {
    renderComponent({
      docCount: {
        isLoading: false,
        isError: false,
        count: 1234,
        approximateReason: 'closed_index',
      },
    });

    expect(
      screen.getByText(
        'Approximate — actual document count may be lower. Exact counts are not available for closed indices.'
      )
    ).toBeInTheDocument();
  });
});
