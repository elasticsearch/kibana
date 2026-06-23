/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { waitFor, within } from '@testing-library/react';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import userEvent from '@testing-library/user-event';

import { DataStreamDetailPanel } from './data_stream_detail_panel';
import { useLoadDataStream } from '../../../../services/api';
import { useAppContext } from '../../../../app_context';
import type { AppDependencies } from '../../../../app_context';
import {
  createMockAppContext,
  createMockDataStream,
} from './data_stream_detail_panel.test_helpers';

// Mock dependencies
jest.mock('../../../../services/api');
jest.mock('../../../../app_context');
jest.mock('../../../../services/use_ilm_locator');
jest.mock('./streams_promotion', () => ({
  StreamsPromotion: () => null,
}));

const mockUseLoadDataStream = jest.mocked(useLoadDataStream);
const mockUseAppContext = jest.mocked(useAppContext);

describe('DataStreamDetailPanel', () => {
  const onCloseMock = jest.fn();
  let mockAppContext: AppDependencies;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAppContext = createMockAppContext();
    mockUseAppContext.mockReturnValue(mockAppContext);
  });

  describe('storage size units', () => {
    it('displays storage size byte units in uppercase', async () => {
      const dataStream = createMockDataStream({
        storageSize: '5mb',
        meteringStorageSize: '156kb',
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('storageSizeDetail')).toHaveTextContent('5MB');
        expect(getByTestId('meteringStorageSizeDetail')).toHaveTextContent('156KB');
      });
    });
  });

  describe('failure store status', () => {
    it('displays "Disabled" when failure store is not enabled', async () => {
      const dataStream = createMockDataStream({
        failureStoreEnabled: false,
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('failureStoreDetail')).toHaveTextContent('Disabled');
      });
    });

    it('displays "Enabled" when failure store is enabled', async () => {
      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('failureStoreDetail')).toHaveTextContent('Enabled');
      });
    });
  });

  describe('failure store retention', () => {
    it('does not display failure store retention field when failure store is disabled', async () => {
      const dataStream = createMockDataStream({
        failureStoreEnabled: false,
        failureStoreRetention: undefined,
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { queryByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(queryByTestId('failureStoreRetentionDetail')).not.toBeInTheDocument();
      });
    });

    it('displays "Disabled" when failure store retention is explicitly disabled', async () => {
      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
        failureStoreRetention: {
          retentionDisabled: true,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('failureStoreRetentionDetail')).toHaveTextContent('Disabled');
      });
    });

    it('displays custom retention period when set', async () => {
      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
        failureStoreRetention: {
          customRetentionPeriod: '30d',
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('failureStoreRetentionDetail')).toHaveTextContent('30 days');
      });
    });

    it('displays default retention period when no custom period is set', async () => {
      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
        failureStoreRetention: {
          defaultRetentionPeriod: '7d',
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('failureStoreRetentionDetail')).toHaveTextContent('7 days');
      });
    });

    it('prioritizes custom retention period over default retention period', async () => {
      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
        failureStoreRetention: {
          customRetentionPeriod: '30d',
          defaultRetentionPeriod: '7d',
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        const element = getByTestId('failureStoreRetentionDetail');
        expect(element).toHaveTextContent('30 days');
        expect(element).not.toHaveTextContent('7 days');
      });
    });

    it('displays failure store retention with hours', async () => {
      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
        failureStoreRetention: {
          customRetentionPeriod: '48h',
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('failureStoreRetentionDetail')).toHaveTextContent('48 hours');
      });
    });
  });

  describe('configure failure store button', () => {
    it('shows configure failure store button when user has read_failure_store privilege', async () => {
      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('manageDataStreamButton')).toBeInTheDocument();
      });

      // Open the manage menu
      const manageButton = getByTestId('manageDataStreamButton');
      await userEvent.click(manageButton);

      await waitFor(() => {
        expect(getByTestId('configureFailureStoreButton')).toBeInTheDocument();
      });
    });

    it('does not show configure failure store button when user does not have read_failure_store privilege', async () => {
      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: false,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId, queryByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('manageDataStreamButton')).toBeInTheDocument();
      });

      // Open the manage menu
      const manageButton = getByTestId('manageDataStreamButton');
      await userEvent.click(manageButton);

      await waitFor(() => {
        expect(queryByTestId('configureFailureStoreButton')).not.toBeInTheDocument();
      });
    });
  });

  describe('loading and error states', () => {
    it('displays loading state while fetching data', () => {
      mockUseLoadDataStream.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      const content = getByTestId('content');
      expect(content).toBeInTheDocument();
      // When loading, the content should contain the SectionLoading component
      expect(within(content).getByTestId('sectionLoading')).toBeInTheDocument();
    });

    it('displays error state when data fails to load', async () => {
      const error = new Error('Internal Server Error');

      mockUseLoadDataStream.mockReturnValue({
        data: undefined,
        isLoading: false,
        error,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('sectionError')).toBeInTheDocument();
      });
    });
  });

  describe('panel interactions', () => {
    it('calls onClose when close button is clicked', async () => {
      const dataStream = createMockDataStream();

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('closeDetailsButton')).toBeInTheDocument();
      });

      const closeButton = getByTestId('closeDetailsButton');
      await userEvent.click(closeButton);

      expect(onCloseMock).toHaveBeenCalledWith();
    });

    it('displays data stream name in the title', async () => {
      const dataStream = createMockDataStream({
        name: 'my-custom-data-stream',
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="my-custom-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('dataStreamDetailPanelTitle')).toHaveTextContent(
          'my-custom-data-stream'
        );
      });
    });
  });

  describe('data stream details', () => {
    it('displays health status', async () => {
      const dataStream = createMockDataStream({
        health: 'green',
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('healthDetail')).toBeInTheDocument();
      });
    });

    it('displays timestamp field', async () => {
      const dataStream = createMockDataStream({
        timeStampField: { name: '@timestamp' },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('timestampDetail')).toHaveTextContent('@timestamp');
      });
    });

    it('displays generation number', async () => {
      const dataStream = createMockDataStream({
        generation: 5,
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('generationDetail')).toHaveTextContent('5');
      });
    });

    it('displays index mode', async () => {
      const dataStream = createMockDataStream({
        indexMode: 'standard',
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('indexModeDetail')).toBeInTheDocument();
      });
    });
  });
});
