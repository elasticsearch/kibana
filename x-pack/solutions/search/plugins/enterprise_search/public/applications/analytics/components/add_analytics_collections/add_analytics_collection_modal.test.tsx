/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues, setMockActions } from '../../../__mocks__/kea_logic';

import React from 'react';

import { screen, waitFor } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { AddAnalyticsCollectionModal } from './add_analytics_collection_modal';

const mockValues = {
  canSubmit: true,
  isLoading: false,
  isSuccess: false,
  isSystemError: false,
};

const mockActions = {
  createAnalyticsCollection: jest.fn(),
  setNameValue: jest.fn(),
};

describe('AddAnalyticsCollectionModal', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders', () => {
    setMockValues(mockValues);
    setMockActions(mockActions);

    renderWithKibanaRenderContext(<AddAnalyticsCollectionModal onClose={mockOnClose} />);

    expect(screen.getByText('Name your Collection')).toBeInTheDocument();
    expect(screen.getByText('Collection name')).toBeInTheDocument();
  });

  it('successful creation will call onClose action', async () => {
    setMockValues({ ...mockValues, isSuccess: true });
    setMockActions(mockActions);

    renderWithKibanaRenderContext(<AddAnalyticsCollectionModal onClose={mockOnClose} />);

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('system error will call onClose action', async () => {
    setMockValues({ ...mockValues, isSystemError: true });
    setMockActions(mockActions);

    renderWithKibanaRenderContext(<AddAnalyticsCollectionModal onClose={mockOnClose} />);

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('disabled confirmed button when canSubmit is false', () => {
    setMockValues({
      ...mockValues,
      canSubmit: false,
    });
    setMockActions(mockActions);

    renderWithKibanaRenderContext(<AddAnalyticsCollectionModal onClose={mockOnClose} />);

    expect(
      screen.getByTestId('enterpriseSearchAddAnalyticsCollectionModalCreateButton')
    ).toBeDisabled();
  });
});
