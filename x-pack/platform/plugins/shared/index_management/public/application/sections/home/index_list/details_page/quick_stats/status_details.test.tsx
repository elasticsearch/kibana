/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import { useAppContext } from '../../../../../app_context';
import type { Index } from '../../../../../../../common';
import type { DocCountState } from './quick_stats';
import { StatusDetails } from './status_details';

jest.mock('../../../../../app_context', () => ({
  useAppContext: jest.fn(),
}));

const mockUseAppContext = jest.mocked(useAppContext);

const defaultProps: {
  docCount: DocCountState;
  documentsDeleted: Index['documents_deleted'];
  status: Index['status'];
  health: Index['health'];
} = {
  docCount: { isLoading: false, isError: false, count: 10 },
  documentsDeleted: 3,
  status: 'open',
  health: 'green',
};

const renderComponent = (overrides: Partial<typeof defaultProps> = {}) => {
  return render(<StatusDetails {...defaultProps} {...overrides} />);
};

describe('StatusDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppContext.mockReturnValue({
      config: { enableIndexStats: true },
    } as ReturnType<typeof useAppContext>);
  });

  it('renders nothing when enableIndexStats is disabled', () => {
    mockUseAppContext.mockReturnValue({
      config: { enableIndexStats: false },
    } as ReturnType<typeof useAppContext>);

    const { container } = renderComponent();

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when health is undefined', () => {
    const { container } = renderComponent({ health: undefined });

    expect(container).toBeEmptyDOMElement();
  });

  it('shows "Open" when the index status is open', () => {
    renderComponent({ status: 'open' });

    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it.each(['close', 'closed'])('shows "Closed" when the index status is %s', (status) => {
    renderComponent({ status: status as Index['status'] });

    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('shows "Healthy" badge for green health', () => {
    renderComponent({ health: 'green' });

    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('shows "Warning" badge for yellow health', () => {
    renderComponent({ health: 'yellow' });

    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('shows "Critical" badge for red health', () => {
    renderComponent({ health: 'red' });

    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('shows a loading spinner while doc count is loading', () => {
    renderComponent({ docCount: { isLoading: true, isError: false } });

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows a warning and deleted count when doc count has an error', () => {
    renderComponent({
      docCount: { isLoading: false, isError: true },
      documentsDeleted: 7,
    });

    expect(screen.getByText('Unable to retrieve')).toBeInTheDocument();
    expect(screen.getByText(/7 Deleted/)).toBeInTheDocument();
  });

  it('shows doc count and deleted count on success', () => {
    renderComponent({
      docCount: { isLoading: false, isError: false, count: 500 },
      documentsDeleted: 12,
    });

    expect(screen.getByText('500 Documents / 12 Deleted')).toBeInTheDocument();
  });

  it('shows the read-access tooltip when metadata count is used after an exact count failure', () => {
    renderComponent({
      docCount: {
        isLoading: false,
        isError: false,
        count: 500,
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
      status: 'closed' as Index['status'],
      docCount: {
        isLoading: false,
        isError: false,
        count: 500,
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
