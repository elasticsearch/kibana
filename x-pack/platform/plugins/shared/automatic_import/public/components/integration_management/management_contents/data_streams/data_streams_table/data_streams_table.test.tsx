/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataStreamsTable } from './data_steams_table';
import type { DataStreamResponse } from '../../../../../../common';
import { UIStateProvider } from '../../../contexts';

// Components are further tested in their own files. We just want to test if it renders.
jest.mock('./input_types_badges', () => ({
  InputTypesBadges: jest.fn(({ inputTypes }) => (
    <div data-test-subj="mock-input-types-badges">
      {inputTypes?.map((t: { name: string }) => t.name).join(', ')}
    </div>
  )),
}));

jest.mock('./status', () => ({
  Status: jest.fn(({ status, isDeleting }) => (
    <div data-test-subj="mock-status">{isDeleting ? 'Deleting...' : status}</div>
  )),
}));

// Mock useDeleteDataStream hook
const mockMutate = jest.fn();
const mockDeleteDataStreamMutation = {
  mutate: mockMutate,
  isLoading: false,
  variables: undefined as { dataStreamId: string } | undefined,
};

const mockReanalyzeMutate = jest.fn();
const mockReanalyzeMutateAsync = jest.fn().mockResolvedValue(undefined);
const mockReanalyzeDataStreamMutation = {
  mutate: mockReanalyzeMutate,
  mutateAsync: mockReanalyzeMutateAsync,
  isLoading: false,
  variables: undefined as
    | { dataStreamId: string; integrationId: string; connectorId: string }
    | undefined,
};

jest.mock('../../../../../common', () => ({
  useDeleteDataStream: () => ({
    deleteDataStreamMutation: mockDeleteDataStreamMutation,
  }),
  useReanalyzeDataStream: () => ({
    reanalyzeDataStreamMutation: mockReanalyzeDataStreamMutation,
  }),
}));

const mockReportEditDataStreamFlyoutOpened = jest.fn();
const mockReportDataStreamDeleteConfirmed = jest.fn();
const mockReportDataStreamRefreshConfirmed = jest.fn();
jest.mock('../../../../telemetry_context', () => ({
  useTelemetry: () => ({
    reportEditDataStreamFlyoutOpened: mockReportEditDataStreamFlyoutOpened,
    reportDataStreamDeleteConfirmed: mockReportDataStreamDeleteConfirmed,
    reportDataStreamRefreshConfirmed: mockReportDataStreamRefreshConfirmed,
  }),
}));

// Mock useIntegrationForm hook
jest.mock('../../../forms/integration_form', () => ({
  useIntegrationForm: () => ({
    formData: { connectorId: 'test-connector-id' },
  }),
}));

// Mock EUI theme provider
jest.mock('@elastic/eui', () => {
  const original = jest.requireActual('@elastic/eui');
  return {
    ...original,
    useEuiTheme: () => ({
      euiTheme: {
        colors: {
          backgroundBaseSubdued: '#f5f7fa',
          text: '#343741',
        },
      },
    }),
  };
});

const createMockDataStream = (overrides: Partial<DataStreamResponse> = {}): DataStreamResponse => ({
  dataStreamId: 'ds-1',
  title: 'Test Data Stream',
  description: 'Test description',
  status: 'completed',
  inputTypes: [{ name: 'filestream' }],
  ...overrides,
});

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<UIStateProvider>{ui}</UIStateProvider>);
};

describe('DataStreamsTable', () => {
  const defaultProps = {
    integrationId: 'integration-123',
    items: [createMockDataStream()],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteDataStreamMutation.isLoading = false;
    mockDeleteDataStreamMutation.variables = undefined;
    mockReanalyzeDataStreamMutation.isLoading = false;
    mockReanalyzeDataStreamMutation.variables = undefined;
  });

  describe('rendering', () => {
    it('should render the table with a data stream title', () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      expect(screen.getByText('Test Data Stream')).toBeInTheDocument();
    });

    it('should render multiple data streams', () => {
      const items = [
        createMockDataStream({ dataStreamId: 'ds-1', title: 'First Stream' }),
        createMockDataStream({ dataStreamId: 'ds-2', title: 'Second Stream' }),
      ];

      renderWithProvider(<DataStreamsTable {...defaultProps} items={items} />);

      expect(screen.getByText('First Stream')).toBeInTheDocument();
      expect(screen.getByText('Second Stream')).toBeInTheDocument();
    });

    it('should render InputTypesBadges component for each row', () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      expect(screen.getByTestId('mock-input-types-badges')).toBeInTheDocument();
    });

    it('should render Status component for each row', () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      expect(screen.getByTestId('mock-status')).toBeInTheDocument();
    });

    it('should call reportEditDataStreamFlyoutOpened when data stream is expanded', async () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      const expandButton = screen.getByTestId('expandDataStreamButton');
      await userEvent.click(expandButton);

      expect(mockReportEditDataStreamFlyoutOpened).toHaveBeenCalled();
    });

    it('should render empty table when no items', () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} items={[]} />);

      expect(screen.queryByText('Test Data Stream')).not.toBeInTheDocument();
    });
  });

  describe('sorting', () => {
    it('should preserve original order by default (no sorting applied)', () => {
      const items = [
        createMockDataStream({ dataStreamId: 'ds-1', title: 'Zebra Stream' }),
        createMockDataStream({ dataStreamId: 'ds-2', title: 'Alpha Stream' }),
      ];

      renderWithProvider(<DataStreamsTable {...defaultProps} items={items} />);

      const rows = screen.getAllByRole('row');

      expect(within(rows[1]).getByText('Zebra Stream')).toBeInTheDocument();
      expect(within(rows[2]).getByText('Alpha Stream')).toBeInTheDocument();
    });

    it('should sort alphabetically ascending when column header is clicked', async () => {
      const items = [
        createMockDataStream({ dataStreamId: 'ds-1', title: 'Zebra Stream' }),
        createMockDataStream({ dataStreamId: 'ds-2', title: 'Alpha Stream' }),
      ];

      renderWithProvider(<DataStreamsTable {...defaultProps} items={items} />);

      const titleHeader = screen.getByRole('button', { name: /title/i });
      await userEvent.click(titleHeader);

      const rows = screen.getAllByRole('row');
      expect(within(rows[1]).getByText('Alpha Stream')).toBeInTheDocument();
      expect(within(rows[2]).getByText('Zebra Stream')).toBeInTheDocument();
    });

    it('should toggle to descending when column header is clicked twice', async () => {
      const items = [
        createMockDataStream({ dataStreamId: 'ds-1', title: 'Alpha Stream' }),
        createMockDataStream({ dataStreamId: 'ds-2', title: 'Zebra Stream' }),
      ];

      renderWithProvider(<DataStreamsTable {...defaultProps} items={items} />);

      const titleHeader = screen.getByRole('button', { name: /title/i });
      await userEvent.click(titleHeader);
      await userEvent.click(titleHeader);

      const rows = screen.getAllByRole('row');
      expect(within(rows[1]).getByText('Zebra Stream')).toBeInTheDocument();
    });
  });

  describe('delete functionality', () => {
    it('should show delete confirmation modal when delete action clicked', async () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      const deleteButton = screen.getByTestId('deleteDataStreamButton');
      await userEvent.click(deleteButton);

      expect(
        screen.getByText(/Are you sure you want to delete "Test Data Stream"/i)
      ).toBeInTheDocument();
    });

    it('should close modal when cancel is clicked', async () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      const deleteButton = screen.getByTestId('deleteDataStreamButton');
      await userEvent.click(deleteButton);

      const cancelButton = screen.getByText('Cancel');
      await userEvent.click(cancelButton);

      expect(screen.queryByText(/Are you sure you want to delete/i)).not.toBeInTheDocument();
    });

    it('should call delete mutation when confirm is clicked', async () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      const deleteButton = screen.getByTestId('deleteDataStreamButton');
      await userEvent.click(deleteButton);

      // Click confirm button in the modal
      const confirmButton = screen.getByRole('button', { name: /delete/i });
      await userEvent.click(confirmButton);

      expect(mockMutate).toHaveBeenCalledWith({
        integrationId: 'integration-123',
        dataStreamId: 'ds-1',
      });
    });

    it('should show deleting status when item status is deleting (set via optimistic update)', () => {
      // With optimistic updates, the useDeleteDataStream hook updates the cache
      // to set status='deleting' before the API call completes. The table component
      // now simply checks item.status === 'deleting' rather than tracking isLoading.
      const items = [createMockDataStream({ status: 'deleting' })];

      renderWithProvider(<DataStreamsTable {...defaultProps} items={items} />);

      expect(screen.getByText('Deleting...')).toBeInTheDocument();
    });

    it('should disable delete button when item status is deleting', () => {
      const items = [createMockDataStream({ status: 'deleting' })];

      renderWithProvider(<DataStreamsTable {...defaultProps} items={items} />);

      const deleteButton = screen.getByTestId('deleteDataStreamButton');
      expect(deleteButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('should pass isDeleting to Status when server status is deleting', () => {
      const items = [createMockDataStream({ status: 'deleting' })];

      renderWithProvider(<DataStreamsTable {...defaultProps} items={items} />);

      expect(screen.getByText('Deleting...')).toBeInTheDocument();
    });

    it('should disable delete button when server status is deleting', () => {
      const items = [createMockDataStream({ status: 'deleting' })];

      renderWithProvider(<DataStreamsTable {...defaultProps} items={items} />);

      const deleteButton = screen.getByTestId('deleteDataStreamButton');
      expect(deleteButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('should disable refresh button when server status is deleting', () => {
      const items = [createMockDataStream({ status: 'deleting' })];

      renderWithProvider(<DataStreamsTable {...defaultProps} items={items} />);

      const refreshButton = screen.getByTestId('refreshDataStreamButton');
      expect(refreshButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('should disable expand button when server status is deleting', () => {
      const items = [createMockDataStream({ status: 'deleting' })];

      renderWithProvider(<DataStreamsTable {...defaultProps} items={items} />);

      const expandButton = screen.getByTestId('expandDataStreamButton');
      expect(expandButton).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('reanalyze functionality', () => {
    it('should show reanalyze confirmation modal when refresh action clicked', async () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      const refreshButton = screen.getByTestId('refreshDataStreamButton');
      await userEvent.click(refreshButton);

      expect(screen.getByText(/Re-analyze data stream "Test Data Stream"/i)).toBeInTheDocument();
    });

    it('should show explanation text in reanalyze modal', async () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      const refreshButton = screen.getByTestId('refreshDataStreamButton');
      await userEvent.click(refreshButton);

      expect(screen.getByText(/re-run the AI analysis on this data stream/i)).toBeInTheDocument();
    });

    it('should close modal when cancel is clicked', async () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      const refreshButton = screen.getByTestId('refreshDataStreamButton');
      await userEvent.click(refreshButton);

      const cancelButton = screen.getByText('Cancel');
      await userEvent.click(cancelButton);

      expect(screen.queryByText(/Re-analyze "Test Data Stream"/i)).not.toBeInTheDocument();
    });

    it('should call reanalyze mutation when confirm is clicked', async () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      const refreshButton = screen.getByTestId('refreshDataStreamButton');
      await userEvent.click(refreshButton);

      const confirmButton = screen.getByRole('button', { name: /Re-Analyze/i });
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockReanalyzeMutateAsync).toHaveBeenCalledWith({
          integrationId: 'integration-123',
          dataStreamId: 'ds-1',
          connectorId: 'test-connector-id',
        });
      });
    });

    it('should disable refresh button when reanalyze is in progress for that item', () => {
      mockReanalyzeDataStreamMutation.isLoading = true;
      mockReanalyzeDataStreamMutation.variables = {
        dataStreamId: 'ds-1',
        integrationId: 'integration-123',
        connectorId: 'test-connector-id',
      };

      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      const refreshButton = screen.getByTestId('refreshDataStreamButton');
      expect(refreshButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('should not disable refresh button for other items when reanalyze is in progress', () => {
      mockReanalyzeDataStreamMutation.isLoading = true;
      mockReanalyzeDataStreamMutation.variables = {
        dataStreamId: 'ds-other',
        integrationId: 'integration-123',
        connectorId: 'test-connector-id',
      };

      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      const refreshButton = screen.getByTestId('refreshDataStreamButton');
      expect(refreshButton).not.toBeDisabled();
    });
  });

  describe('action buttons', () => {
    it('should disable expand button for non-completed data streams', () => {
      const items = [createMockDataStream({ status: 'pending' })];

      renderWithProvider(<DataStreamsTable {...defaultProps} items={items} />);

      const expandButton = screen.getByTestId('expandDataStreamButton');
      expect(expandButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('should enable expand button for completed data streams', () => {
      const items = [createMockDataStream({ status: 'completed' })];

      renderWithProvider(<DataStreamsTable {...defaultProps} items={items} />);

      const expandButton = screen.getByTestId('expandDataStreamButton');
      expect(expandButton).not.toBeDisabled();
    });

    it('should disable refresh button for pending data streams', () => {
      const items = [createMockDataStream({ status: 'pending' })];

      renderWithProvider(<DataStreamsTable {...defaultProps} items={items} />);

      const refreshButton = screen.getByTestId('refreshDataStreamButton');
      expect(refreshButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('should enable refresh button for completed data streams', () => {
      const items = [createMockDataStream({ status: 'completed' })];

      renderWithProvider(<DataStreamsTable {...defaultProps} items={items} />);

      const refreshButton = screen.getByTestId('refreshDataStreamButton');
      expect(refreshButton).not.toBeDisabled();
    });

    it('should enable refresh button for failed data streams', () => {
      const items = [createMockDataStream({ status: 'failed' })];

      renderWithProvider(<DataStreamsTable {...defaultProps} items={items} />);

      const refreshButton = screen.getByTestId('refreshDataStreamButton');
      expect(refreshButton).not.toBeDisabled();
    });
  });

  describe('column rendering', () => {
    it('should render title column with tooltip', () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      const titleCell = screen.getByText('Test Data Stream');
      expect(titleCell).toBeInTheDocument();
      expect(titleCell.closest('span')).toHaveAttribute('tabIndex', '0');
    });

    it('should render Data Collection Methods column', () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      expect(screen.getByText('Data Collection Methods')).toBeInTheDocument();
    });

    it('should render Status column', () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      expect(screen.getByText('Status')).toBeInTheDocument();
    });

    it('should render Actions column', () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      expect(screen.getByText('Actions')).toBeInTheDocument();
    });
  });

  describe('telemetry', () => {
    it('should call reportDataStreamDeleteConfirmed when delete is confirmed', async () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      await userEvent.click(screen.getByTestId('deleteDataStreamButton'));
      await userEvent.click(screen.getByRole('button', { name: /delete/i }));

      expect(mockReportDataStreamDeleteConfirmed).toHaveBeenCalledTimes(1);
    });

    it('should not call reportDataStreamDeleteConfirmed when delete is cancelled', async () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      await userEvent.click(screen.getByTestId('deleteDataStreamButton'));
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockReportDataStreamDeleteConfirmed).not.toHaveBeenCalled();
    });

    it('should call reportDataStreamRefreshConfirmed when re-analyze is confirmed', async () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      await userEvent.click(screen.getByTestId('refreshDataStreamButton'));
      await userEvent.click(screen.getByRole('button', { name: /re-analyze/i }));

      expect(mockReportDataStreamRefreshConfirmed).toHaveBeenCalledTimes(1);
    });

    it('should not call reportDataStreamRefreshConfirmed when re-analyze is cancelled', async () => {
      renderWithProvider(<DataStreamsTable {...defaultProps} />);

      await userEvent.click(screen.getByTestId('refreshDataStreamButton'));
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockReportDataStreamRefreshConfirmed).not.toHaveBeenCalled();
    });
  });
});
