/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import '@testing-library/jest-dom';
import { waitFor, within } from '@testing-library/react';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import userEvent from '@testing-library/user-event';

import { DataStreamDetailPanel } from './data_stream_detail_panel';
import { useLoadDataStream, loadSnapshotRepositories } from '../../../../services/api';
import { useAppContext } from '../../../../app_context';
import type { AppDependencies } from '../../../../app_context';
import { sendRequest } from '../../../../services/use_request';
import {
  updateDataLifecycle,
  updateDSFailureStore,
  updateDataStreamSettings,
  updateIndexSettings,
} from '../../../../services/api';
import {
  createMockAppContext,
  createMockDataStream,
} from './data_stream_detail_panel.test_helpers';

// Mock dependencies
jest.mock('../../../../services/api');
jest.mock('../../../../app_context');
jest.mock('../../../../services/use_ilm_locator');
jest.mock('../../../../services/use_request');
jest.mock('./streams_promotion', () => ({
  StreamsPromotion: () => null,
}));

const mockUseLoadDataStream = jest.mocked(useLoadDataStream);
const mockLoadSnapshotRepositories = jest.mocked(loadSnapshotRepositories);
const mockUseAppContext = jest.mocked(useAppContext);
const mockSendRequest = jest.mocked(sendRequest);
const mockUpdateDataLifecycle = jest.mocked(updateDataLifecycle);
const mockUpdateDSFailureStore = jest.mocked(updateDSFailureStore);
const mockUpdateDataStreamSettings = jest.mocked(updateDataStreamSettings);
const mockUpdateIndexSettings = jest.mocked(updateIndexSettings);

describe('DataStreamDetailPanel', () => {
  const onCloseMock = jest.fn();
  let mockAppContext: AppDependencies;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAppContext = createMockAppContext();
    mockUseAppContext.mockReturnValue(mockAppContext);
    mockLoadSnapshotRepositories.mockResolvedValue({ data: undefined } as any);
    mockSendRequest.mockResolvedValue({ data: undefined } as any);
    mockUpdateDataLifecycle.mockResolvedValue({} as any);
    mockUpdateDSFailureStore.mockResolvedValue({} as any);
    mockUpdateDataStreamSettings.mockResolvedValue({} as any);
    mockUpdateIndexSettings.mockResolvedValue({} as any);
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

  describe('failed ingest lifecycle', () => {
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
        expect(getByTestId('failedIngestLifecycleDetail')).toHaveTextContent('Disabled');
      });
    });

    it('shows lifecycle summary when failure store is enabled', async () => {
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
        expect(getByTestId('failedIngestLifecycleDetail')).toHaveTextContent(
          'Data stream lifecycle'
        );
      });
    });

    it('does not mark an explicitly disabled failure store as inherited', async () => {
      const dataStream = createMockDataStream({
        // Explicit `_options` override (the user disabled it), even though the template also
        // leaves the failure store disabled: it must read as an explicit choice, not inherited.
        failureStoreEnabled: false,
        failureStoreSettings: { enabled: false },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      // Template loads but defines no failure store.
      mockSendRequest.mockResolvedValue({
        data: {
          name: 'indexTemplate',
          template: { lifecycle: { enabled: true } },
          _kbnMeta: { hasDatastream: true },
        },
      } as any);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('failedIngestLifecycleDetail')).toHaveTextContent('Disabled');
      });
      expect(getByTestId('failedIngestLifecycleDetail')).not.toHaveTextContent('Inherited');
    });

    it('marks a failure store disabled via inheritance as inherited', async () => {
      const dataStream = createMockDataStream({
        // No explicit `_options` override: the disabled state comes from inheriting a template
        // that leaves the failure store disabled, so it must read as inherited.
        failureStoreEnabled: false,
        failureStoreSettings: undefined,
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      // Template loads but defines no failure store.
      mockSendRequest.mockResolvedValue({
        data: {
          name: 'indexTemplate',
          template: { lifecycle: { enabled: true } },
          _kbnMeta: { hasDatastream: true },
        },
      } as any);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('failedIngestLifecycleDetail')).toHaveTextContent('Inherited');
      });
      expect(getByTestId('failedIngestLifecycleDetail')).toHaveTextContent('Disabled');
    });
  });

  describe('failed ingest lifecycle retention', () => {
    it('shows ∞ when the retention lifecycle is disabled (kept indefinitely)', async () => {
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
        expect(getByTestId('failedIngestLifecycleDetail')).toHaveTextContent('∞');
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
        expect(getByTestId('failedIngestLifecycleDetail')).toHaveTextContent('30 days');
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
        expect(getByTestId('failedIngestLifecycleDetail')).toHaveTextContent('7 days');
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
        expect(getByTestId('failedIngestLifecycleDetail')).toHaveTextContent('30 days');
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
        expect(getByTestId('failedIngestLifecycleDetail')).toHaveTextContent('48 hours');
      });
    });
  });

  describe('actions menu', () => {
    it('shows actions button and menu items when user has privileges', async () => {
      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
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

      // Open the actions menu
      const actionsButton = getByTestId('manageDataStreamButton');
      await userEvent.click(actionsButton);

      await waitFor(() => {
        expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument();
        expect(getByTestId('deleteDataStreamButton')).toBeInTheDocument();
      });
    });

    it('hides "Edit data lifecycle" when the user lacks the manage privilege', async () => {
      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: false,
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

      await userEvent.click(getByTestId('manageDataStreamButton'));

      await waitFor(() => {
        expect(getByTestId('deleteDataStreamButton')).toBeInTheDocument();
      });
      expect(queryByTestId('editDataLifecycleButton')).not.toBeInTheDocument();
    });

    it('does not warn when a lookup stream has DSL-eligible historical data', async () => {
      const dataStream = createMockDataStream({
        indexMode: 'lookup',
        indices: [
          {
            name: 'historical-index',
            uuid: 'historical-index-id',
            preferILM: false,
            managedBy: 'Unmanaged',
            indexMode: 'standard',
          },
        ],
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);
      mockSendRequest.mockResolvedValue({ data: undefined } as any);

      const { getByTestId, queryByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => expect(getByTestId('manageDataStreamButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));

      expect(queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument();
    });

    it('does not render actions button when user has no actions', async () => {
      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
        privileges: {
          delete_index: false,
          manage_data_stream_lifecycle: false,
          read_failure_store: false,
          manage: false,
        },
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
        expect(queryByTestId('manageDataStreamButton')).not.toBeInTheDocument();
      });
    });

    it('does not overwrite failure store draft when toggling inheritance', async () => {
      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
        // Mark as explicit override so the failed-data inherit toggle starts unchecked.
        failureStoreSettings: { enabled: true },
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      // Template load isn't the focus here; just return a minimal response.
      mockSendRequest.mockResolvedValue({ data: undefined } as any);

      const { getByTestId, queryByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('manageDataStreamButton')).toBeInTheDocument();
      });

      // Open actions menu and open the Edit data lifecycle flyout
      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));
      // Standard data stream: no lookup notice in the flyout
      expect(queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument();

      // Go to Failed data tab
      await userEvent.click(getByTestId('flyoutTab-failed_data'));

      const failureStoreCheckbox = getByTestId(
        'editFailedDataLifecycle-enableFailureStoreCheckbox'
      );
      expect(failureStoreCheckbox).toBeChecked();

      // User edits draft (disable failure store)
      await userEvent.click(failureStoreCheckbox);
      expect(failureStoreCheckbox).not.toBeChecked();

      // Toggle inheritance on and off; draft should be preserved
      const inheritCheckbox = getByTestId('dataLifecycleInheritCheckbox');
      await userEvent.click(inheritCheckbox);
      await userEvent.click(inheritCheckbox);

      expect(getByTestId('editFailedDataLifecycle-enableFailureStoreCheckbox')).not.toBeChecked();
    });

    it('preserves historical ILM when only failed data is edited on a lookup stream', async () => {
      const dataStream = createMockDataStream({
        indexMode: 'lookup',
        indices: [
          {
            name: 'historical-index',
            uuid: 'historical-index-id',
            preferILM: true,
            managedBy: 'Index Lifecycle Management',
            ilmPolicyName: 'historical-policy',
            indexMode: 'standard',
          },
          {
            name: 'lookup-index',
            uuid: 'lookup-index-id',
            preferILM: false,
            managedBy: 'Unmanaged',
            indexMode: 'lookup',
          },
        ],
        nextGenerationManagedBy: 'Data stream lifecycle',
        lifecycle: {
          enabled: true,
          data_retention: '7d',
          retention_determined_by: 'data_stream_configuration',
        },
        lifecycleSettings: { preferIlm: false },
        failureStoreEnabled: false,
        failureStoreSettings: { enabled: false },
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);
      mockSendRequest.mockImplementation(async ({ path }: any) => {
        if (typeof path === 'string' && path.includes('/index_templates/')) {
          return {
            data: {
              name: 'indexTemplate',
              template: { lifecycle: { enabled: true, data_retention: '30d' } },
              _kbnMeta: { hasDatastream: true },
            },
          } as any;
        }
        return { data: undefined } as any;
      });

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => expect(getByTestId('manageDataStreamButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));
      await userEvent.click(getByTestId('flyoutTab-failed_data'));
      await userEvent.click(getByTestId('editFailedDataLifecycle-enableFailureStoreCheckbox'));
      await userEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

      await waitFor(() => expect(onCloseMock).toHaveBeenCalledWith(true));
      expect(mockUpdateDSFailureStore).toHaveBeenCalledTimes(1);
      expect(mockUpdateDataLifecycle).not.toHaveBeenCalled();
      expect(mockUpdateDataStreamSettings).not.toHaveBeenCalled();
      expect(mockUpdateIndexSettings).not.toHaveBeenCalled();
    });

    it('uses cluster default failure store retention when inheriting and template does not set one', async () => {
      mockAppContext = createMockAppContext();
      mockAppContext.config.isServerless = true;
      mockUseAppContext.mockReturnValue(mockAppContext);

      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
        failureStoreRetention: {
          defaultRetentionPeriod: '7d',
        },
        // No explicit override => inherited
        failureStoreSettings: undefined,
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      // Template has failure store enabled but no explicit lifecycle retention => should use cluster default
      mockSendRequest.mockResolvedValue({
        data: {
          name: 'indexTemplate',
          template: {
            data_stream_options: {
              failure_store: { enabled: true, lifecycle: { enabled: true } },
            },
            lifecycle: { enabled: true },
          },
          _kbnMeta: { hasDatastream: true },
        },
      } as any);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('manageDataStreamButton')).toBeInTheDocument();
      });

      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));

      await userEvent.click(getByTestId('flyoutTab-failed_data'));

      // In serverless+failure store, the delete phase card is shown (no checkbox),
      // and inputs should reflect the inherited default retention (7d).
      await waitFor(() => {
        expect(getByTestId('deleteDurationValue')).toHaveValue(7);
        expect(getByTestId('deleteDurationUnit')).toHaveValue('d');
      });
    });

    it('treats template missing failure store lifecycle as inherited when stream reports lifecycle.enabled', async () => {
      mockAppContext = createMockAppContext();
      mockAppContext.config.isServerless = true;
      mockUseAppContext.mockReturnValue(mockAppContext);

      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
        // Simulate ES returning effective lifecycle enabled (defaults) even though the template does not specify it
        failureStoreSettings: { enabled: true, lifecycle: { enabled: true } },
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      mockSendRequest.mockResolvedValue({
        data: {
          name: 'indexTemplate',
          template: {
            data_stream_options: {
              failure_store: { enabled: true },
            },
            lifecycle: { enabled: true },
          },
          _kbnMeta: { hasDatastream: true },
        },
      } as any);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('manageDataStreamButton')).toBeInTheDocument();
      });

      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));

      await userEvent.click(getByTestId('flyoutTab-failed_data'));

      await waitFor(() => {
        expect(getByTestId('dataLifecycleInheritCheckbox')).toBeChecked();
      });
    });

    it('treats serverless default retention materialized as data_stream_configuration as inherited', async () => {
      mockAppContext = createMockAppContext();
      mockAppContext.config.isServerless = true;
      mockUseAppContext.mockReturnValue(mockAppContext);

      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
        failureStoreRetention: {
          defaultRetentionPeriod: '30d',
        },
        // Explicit options exist (written by Streams), but they match the template/default retention.
        failureStoreSettings: { enabled: true, lifecycle: { enabled: true, dataRetention: '30d' } },
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      mockSendRequest.mockResolvedValue({
        data: {
          name: 'indexTemplate',
          template: {
            data_stream_options: {
              // Template enables failure store but does not specify an explicit data_retention.
              failure_store: { enabled: true, lifecycle: { enabled: true } },
            },
            lifecycle: { enabled: true },
          },
          _kbnMeta: { hasDatastream: true },
        },
      } as any);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('manageDataStreamButton')).toBeInTheDocument();
      });

      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));

      await userEvent.click(getByTestId('flyoutTab-failed_data'));

      await waitFor(() => {
        expect(getByTestId('dataLifecycleInheritCheckbox')).toBeChecked();
      });
    });

    it('treats default failures retention as inherited even with explicit options', async () => {
      mockAppContext = createMockAppContext();
      mockAppContext.config.isServerless = true;
      mockUseAppContext.mockReturnValue(mockAppContext);

      const dataStream = createMockDataStream({
        failureStoreEnabled: true,
        // Explicit options exist (e.g. written by another UI), but retention is determined by the
        // default failures retention and has no explicit `data_retention`.
        failureStoreSettings: { enabled: true },
        failureStoreRetention: {
          defaultRetentionPeriod: '30d',
          retentionDeterminedBy: 'default_failures_retention',
        },
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      // Template load isn't required for this heuristic.
      mockSendRequest.mockResolvedValue({ data: undefined } as any);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('manageDataStreamButton')).toBeInTheDocument();
      });

      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));

      await userEvent.click(getByTestId('flyoutTab-failed_data'));

      await waitFor(() => {
        expect(getByTestId('dataLifecycleInheritCheckbox')).toBeChecked();
      });
    });

    it('resets DSL lifecycle to template values when saving successful inheritance', async () => {
      mockAppContext = createMockAppContext();
      mockAppContext.config.isServerless = true;
      mockUseAppContext.mockReturnValue(mockAppContext);

      const dataStream = createMockDataStream({
        // Start in "inherited" mode so the flyout applies template defaults on Apply.
        lifecycle: {
          enabled: true,
          data_retention: '10d',
          frozen_after: '1d',
          retention_determined_by: 'index_template',
        } as any,
        nextGenerationManagedBy: 'Data stream lifecycle',
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      mockSendRequest.mockResolvedValue({
        data: {
          name: 'indexTemplate',
          template: {
            settings: { index: { lifecycle: { prefer_ilm: false } } },
            lifecycle: { enabled: true, data_retention: '80d', frozen_after: '20d' },
            data_stream_options: { failure_store: { enabled: true } },
          },
          _kbnMeta: { hasDatastream: true },
        },
      } as any);

      const { getByTestId, getByLabelText } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('manageDataStreamButton')).toBeInTheDocument();
      });

      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));

      // Successful lifecycle is already inherited; apply should reset to template values.
      await userEvent.click(getByTestId('flyoutTab-successful_data'));
      expect(getByLabelText('Inherit lifecycle from index template')).toBeChecked();

      await userEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

      expect(mockUpdateDataLifecycle).toHaveBeenCalledWith(['test-data-stream'], {
        enabled: true,
        frozenAfter: '20d',
        dataRetention: '80d',
      });
    });

    it('shows a success toast and closes the flyout after saving', async () => {
      mockAppContext = createMockAppContext();
      mockAppContext.config.isServerless = true;
      mockUseAppContext.mockReturnValue(mockAppContext);

      const dataStream = createMockDataStream({
        lifecycle: {
          enabled: true,
          data_retention: '10d',
          retention_determined_by: 'index_template',
        } as any,
        nextGenerationManagedBy: 'Data stream lifecycle',
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      mockSendRequest.mockResolvedValue({
        data: {
          name: 'indexTemplate',
          template: { lifecycle: { enabled: true, data_retention: '80d' } },
          _kbnMeta: { hasDatastream: true },
        },
      } as any);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => expect(getByTestId('manageDataStreamButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));
      await userEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

      await waitFor(() => expect(onCloseMock).toHaveBeenCalledWith(true));
      expect(mockAppContext.services.notificationService.showSuccessToast).toHaveBeenCalledTimes(1);
      expect(mockAppContext.services.notificationService.showDangerToast).not.toHaveBeenCalled();
    });

    it('shows a tailored error toast and still closes when only one request fails', async () => {
      mockAppContext = createMockAppContext();
      mockAppContext.config.isServerless = true;
      mockUseAppContext.mockReturnValue(mockAppContext);

      const dataStream = createMockDataStream({
        lifecycle: {
          enabled: true,
          data_retention: '10d',
          retention_determined_by: 'index_template',
        } as any,
        nextGenerationManagedBy: 'Data stream lifecycle',
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      mockSendRequest.mockResolvedValue({
        data: {
          name: 'indexTemplate',
          template: { lifecycle: { enabled: true, data_retention: '80d' } },
          _kbnMeta: { hasDatastream: true },
        },
      } as any);

      // The successful-data request succeeds while the failed-data (failure store) request fails.
      mockUpdateDSFailureStore.mockResolvedValue({ error: { message: 'boom' } } as any);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => expect(getByTestId('manageDataStreamButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));
      // Edit successful data, then apply from Failed data so both independent requests run.
      // The lifecycle starts out inherited, which disables the phase selector, so stop
      // inheriting first: otherwise the successful half is never attempted.
      await userEvent.click(getByTestId('dataLifecycleInheritCheckbox'));
      await userEvent.click(getByTestId('dlmPhasesSelectorDeletePhaseCard'));
      await userEvent.click(getByTestId('flyoutTab-failed_data'));
      await userEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

      await waitFor(() => expect(onCloseMock).toHaveBeenCalledWith(true));
      expect(mockAppContext.services.notificationService.showSuccessToast).not.toHaveBeenCalled();
      expect(mockAppContext.services.notificationService.showDangerToast).toHaveBeenCalledWith(
        'The successful data lifecycle was saved, but the failed data lifecycle could not be saved',
        'Failed to inherit failure store configuration: boom'
      );
    });

    it('shows a generic error toast when only the failed data tab was edited and it fails', async () => {
      mockAppContext = createMockAppContext();
      mockAppContext.config.isServerless = true;
      mockUseAppContext.mockReturnValue(mockAppContext);

      const dataStream = createMockDataStream({
        lifecycle: {
          enabled: true,
          data_retention: '10d',
          retention_determined_by: 'index_template',
        } as any,
        nextGenerationManagedBy: 'Data stream lifecycle',
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      mockSendRequest.mockResolvedValue({
        data: {
          name: 'indexTemplate',
          template: { lifecycle: { enabled: true, data_retention: '80d' } },
          _kbnMeta: { hasDatastream: true },
        },
      } as any);

      mockUpdateDSFailureStore.mockResolvedValue({ error: { message: 'boom' } } as any);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => expect(getByTestId('manageDataStreamButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));
      // Only the failed data tab is applied, so the successful half is never attempted and must
      // not be reported as saved.
      await userEvent.click(getByTestId('flyoutTab-failed_data'));
      await userEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

      await waitFor(() => expect(onCloseMock).toHaveBeenCalledWith(true));
      expect(mockUpdateDataLifecycle).not.toHaveBeenCalled();
      expect(mockAppContext.services.notificationService.showSuccessToast).not.toHaveBeenCalled();
      expect(mockAppContext.services.notificationService.showDangerToast).toHaveBeenCalledWith(
        'Could not save changes',
        'Failed to inherit failure store configuration: boom'
      );
      expect(mockAppContext.services.notificationService.showDangerToast).not.toHaveBeenCalledWith(
        'The successful data lifecycle was saved, but the failed data lifecycle could not be saved',
        expect.anything()
      );
    });

    it('treats failure store as inherited when retention is the Elasticsearch default and the template defines no failure store', async () => {
      mockAppContext = createMockAppContext();
      mockAppContext.config.isServerless = true;
      mockUseAppContext.mockReturnValue(mockAppContext);

      const dataStream = createMockDataStream({
        // Serverless data stream with failure store enabled and retention coming from the
        // Elasticsearch default failures retention (no explicit data stream override).
        failureStoreEnabled: true,
        failureStoreRetention: {
          defaultRetentionPeriod: '30d',
          retentionDeterminedBy: 'default_failures_retention',
        },
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      // Template does not define a failure store.
      mockSendRequest.mockResolvedValue({
        data: {
          name: 'indexTemplate',
          template: { lifecycle: { enabled: true } },
          _kbnMeta: { hasDatastream: true },
        },
      } as any);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('manageDataStreamButton')).toBeInTheDocument();
      });

      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));

      await userEvent.click(getByTestId('flyoutTab-failed_data'));

      await waitFor(() => {
        expect(getByTestId('dataLifecycleInheritCheckbox')).toBeChecked();
      });
    });
  });

  it('keeps the inherited marker for classic lookup streams with DSL-managed history', async () => {
    const dataStream = createMockDataStream({
      indexMode: 'lookup',
      indices: [
        {
          name: 'indexName',
          uuid: 'indexId',
          preferILM: false,
          managedBy: 'Data stream lifecycle',
          indexMode: 'standard',
        },
      ],
      lifecycle: { enabled: true, data_retention: '7d' },
    });
    mockUseLoadDataStream.mockReturnValue({
      data: dataStream,
      isLoading: false,
      error: null,
      resendRequest: jest.fn(),
      isInitialRequest: false,
    } as unknown as ReturnType<typeof useLoadDataStream>);
    mockSendRequest.mockResolvedValue({
      data: {
        name: 'indexTemplate',
        template: { lifecycle: { enabled: true, data_retention: '7d' } },
        _kbnMeta: { hasDatastream: true },
      },
    } as any);

    const { getByTestId } = renderWithI18n(
      <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
    );

    await waitFor(() => {
      expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent('7 days');
    });
    expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent('Inherited');
  });

  it('does not mark historical ILM as inherited for classic lookup streams', async () => {
    const dataStream = createMockDataStream({
      indexMode: 'lookup',
      indices: [
        {
          name: 'indexName',
          uuid: 'indexId',
          preferILM: true,
          managedBy: 'Index Lifecycle Management',
          ilmPolicyName: 'lookup-history-policy',
          indexMode: 'standard',
        },
      ],
      lifecycle: { enabled: true, data_retention: '7d' },
    });
    mockUseLoadDataStream.mockReturnValue({
      data: dataStream,
      isLoading: false,
      error: null,
      resendRequest: jest.fn(),
      isInitialRequest: false,
    } as unknown as ReturnType<typeof useLoadDataStream>);
    mockSendRequest.mockResolvedValue({
      data: {
        name: 'indexTemplate',
        template: { lifecycle: { enabled: true, data_retention: '7d' } },
        _kbnMeta: { hasDatastream: true },
      },
    } as any);

    const { getByTestId } = renderWithI18n(
      <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
    );

    await waitFor(() => {
      expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent(
        'lookup-history-policy'
      );
    });
    expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent('Inherited');
  });

  describe('wired streams', () => {
    const WIRED_STREAM_NAME = 'logs.otel.child';

    const createWiredStreamsGetResponse = ({
      lifecycle,
      failureStore,
      effectiveLifecycle,
      effectiveFailureStore,
    }: {
      lifecycle: Record<string, unknown>;
      failureStore: Record<string, unknown>;
      effectiveLifecycle: Record<string, unknown>;
      effectiveFailureStore: Record<string, unknown>;
    }) => ({
      stream: {
        type: 'wired' as const,
        name: WIRED_STREAM_NAME,
        description: '',
        updated_at: new Date().toISOString(),
        ingest: {
          lifecycle,
          processing: { steps: [], updated_at: new Date().toISOString() },
          settings: {},
          wired: { fields: {}, routing: [] },
          failure_store: failureStore,
        },
      },
      privileges: {
        lifecycle: true,
        manage: true,
        monitor: true,
        simulate: true,
        text_structure: true,
        read_failure_store: true,
        manage_failure_store: true,
        view_index_metadata: true,
        create_snapshot_repository: true,
      },
      effective_lifecycle: effectiveLifecycle,
      effective_settings: {},
      data_stream_exists: true,
      inherited_fields: {},
      effective_failure_store: effectiveFailureStore,
      dashboards: [],
      rules: [],
    });

    const createWiredDataStream = () =>
      createMockDataStream({
        name: WIRED_STREAM_NAME,
        _meta: { managed_by: 'streams', managed: true } as any,
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
      });

    it.each([
      ['DSL', { dsl: { data_retention: '7d' }, from: WIRED_STREAM_NAME }],
      ['ILM', { ilm: { policy: 'current-template-policy' }, from: WIRED_STREAM_NAME }],
    ])(
      'uses backing-index lifecycle for a lookup stream instead of Streams %s lifecycle',
      async (_, effectiveLifecycle) => {
        const dataStream = createMockDataStream({
          name: WIRED_STREAM_NAME,
          indexMode: 'lookup',
          indices: [
            {
              name: 'indexName',
              uuid: 'indexId',
              preferILM: true,
              managedBy: 'Index Lifecycle Management',
              ilmPolicyName: 'historical-policy',
              indexMode: 'standard',
            },
          ],
          nextGenerationManagedBy: 'Unmanaged',
          ilmPolicyName: 'current-template-policy',
          lifecycle: undefined,
          _meta: { managed_by: 'streams', managed: true } as any,
        });
        mockUseLoadDataStream.mockReturnValue({
          data: dataStream,
          isLoading: false,
          error: null,
          resendRequest: jest.fn(),
          isInitialRequest: false,
        } as unknown as ReturnType<typeof useLoadDataStream>);
        const streamsGetResponse = createWiredStreamsGetResponse({
          lifecycle: { dsl: { data_retention: '7d' } },
          failureStore: { inherit: {} },
          effectiveLifecycle,
          effectiveFailureStore: { lifecycle: { disabled: {} }, from: WIRED_STREAM_NAME },
        });
        mockSendRequest.mockImplementation(async ({ path, method }: any) => {
          if (path === `/api/streams/${WIRED_STREAM_NAME}` && method === 'get') {
            return { data: streamsGetResponse } as any;
          }
          return { data: undefined } as any;
        });

        const { getByTestId } = renderWithI18n(
          <DataStreamDetailPanel dataStreamName={WIRED_STREAM_NAME} onClose={onCloseMock} />
        );

        await waitFor(() => {
          expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent(
            'ILM: historical-policy'
          );
        });
        expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent(
          'current-template-policy'
        );
        expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent(
          'Data stream lifecycle'
        );
        expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent('Inherited');
      }
    );

    it('uses backing-index DSL retention for a wired lookup stream', async () => {
      const dataStream = createMockDataStream({
        name: WIRED_STREAM_NAME,
        indexMode: 'lookup',
        indices: [
          {
            name: 'indexName',
            uuid: 'indexId',
            preferILM: false,
            managedBy: 'Data stream lifecycle',
            indexMode: 'standard',
          },
        ],
        lifecycle: { enabled: true, data_retention: '30d' },
        _meta: { managed_by: 'streams', managed: true } as any,
      });
      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);
      const streamsGetResponse = createWiredStreamsGetResponse({
        lifecycle: { inherit: {} },
        failureStore: { inherit: {} },
        effectiveLifecycle: { dsl: { data_retention: '7d' }, from: 'logs.otel' },
        effectiveFailureStore: { lifecycle: { disabled: {} }, from: WIRED_STREAM_NAME },
      });
      mockSendRequest.mockImplementation(async ({ path, method }: any) => {
        if (path === `/api/streams/${WIRED_STREAM_NAME}` && method === 'get') {
          return { data: streamsGetResponse } as any;
        }
        return { data: undefined } as any;
      });

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName={WIRED_STREAM_NAME} onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent('30 days');
      });
      expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent('7 days');
      expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent('Inherited');
    });

    it('keeps the inherited marker when wired lookup DSL retention matches Streams', async () => {
      const dataStream = createMockDataStream({
        name: WIRED_STREAM_NAME,
        indexMode: 'lookup',
        indices: [
          {
            name: 'indexName',
            uuid: 'indexId',
            preferILM: false,
            managedBy: 'Data stream lifecycle',
            indexMode: 'standard',
          },
        ],
        lifecycle: { enabled: true, data_retention: '7d' },
        _meta: { managed_by: 'streams', managed: true } as any,
      });
      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);
      const streamsGetResponse = createWiredStreamsGetResponse({
        lifecycle: { inherit: {} },
        failureStore: { inherit: {} },
        effectiveLifecycle: { dsl: { data_retention: '7d' }, from: 'logs.otel' },
        effectiveFailureStore: { lifecycle: { disabled: {} }, from: WIRED_STREAM_NAME },
      });
      mockSendRequest.mockImplementation(async ({ path, method }: any) => {
        if (path === `/api/streams/${WIRED_STREAM_NAME}` && method === 'get') {
          return { data: streamsGetResponse } as any;
        }
        return { data: undefined } as any;
      });

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName={WIRED_STREAM_NAME} onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent('7 days');
      });
      expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent('Inherited');
    });

    it('keeps the inherited marker when wired lookup DSL details match Streams', async () => {
      const dataStream = createMockDataStream({
        name: WIRED_STREAM_NAME,
        indexMode: 'lookup',
        indices: [
          {
            name: 'indexName',
            uuid: 'indexId',
            preferILM: false,
            managedBy: 'Data stream lifecycle',
            indexMode: 'standard',
          },
        ],
        lifecycle: {
          enabled: true,
          data_retention: '7d',
          frozen_after: '30d',
          downsampling: [{ after: '1d', fixed_interval: '1h' }],
        },
        _meta: { managed_by: 'streams', managed: true } as any,
      });
      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);
      const streamsGetResponse = createWiredStreamsGetResponse({
        lifecycle: { inherit: {} },
        failureStore: { inherit: {} },
        effectiveLifecycle: {
          dsl: {
            data_retention: '7d',
            frozen_after: '30d',
            downsample: [{ after: '1d', fixed_interval: '1h' }],
          },
          from: 'logs.otel',
        },
        effectiveFailureStore: { lifecycle: { disabled: {} }, from: WIRED_STREAM_NAME },
      });
      mockSendRequest.mockImplementation(async ({ path, method }: any) => {
        if (path === `/api/streams/${WIRED_STREAM_NAME}` && method === 'get') {
          return { data: streamsGetResponse } as any;
        }
        return { data: undefined } as any;
      });

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName={WIRED_STREAM_NAME} onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent('7 days');
      });
      expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent('Inherited');
    });

    it('does not inherit when wired lookup DSL has different frozen retention', async () => {
      const dataStream = createMockDataStream({
        name: WIRED_STREAM_NAME,
        indexMode: 'lookup',
        indices: [
          {
            name: 'indexName',
            uuid: 'indexId',
            preferILM: false,
            managedBy: 'Data stream lifecycle',
            indexMode: 'standard',
          },
        ],
        lifecycle: { enabled: true, data_retention: '7d', frozen_after: '30d' },
        _meta: { managed_by: 'streams', managed: true } as any,
      });
      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);
      const streamsGetResponse = createWiredStreamsGetResponse({
        lifecycle: { inherit: {} },
        failureStore: { inherit: {} },
        effectiveLifecycle: {
          dsl: { data_retention: '7d', frozen_after: '60d' },
          from: 'logs.otel',
        },
        effectiveFailureStore: { lifecycle: { disabled: {} }, from: WIRED_STREAM_NAME },
      });
      mockSendRequest.mockImplementation(async ({ path, method }: any) => {
        if (path === `/api/streams/${WIRED_STREAM_NAME}` && method === 'get') {
          return { data: streamsGetResponse } as any;
        }
        return { data: undefined } as any;
      });

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName={WIRED_STREAM_NAME} onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent('7 days');
      });
      expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent('Inherited');
    });

    it('does not inherit when wired lookup DSL has different downsampling', async () => {
      const dataStream = createMockDataStream({
        name: WIRED_STREAM_NAME,
        indexMode: 'lookup',
        indices: [
          {
            name: 'indexName',
            uuid: 'indexId',
            preferILM: false,
            managedBy: 'Data stream lifecycle',
            indexMode: 'standard',
          },
        ],
        lifecycle: {
          enabled: true,
          data_retention: '7d',
          downsampling: [{ after: '1d', fixed_interval: '1h' }],
        },
        _meta: { managed_by: 'streams', managed: true } as any,
      });
      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);
      const streamsGetResponse = createWiredStreamsGetResponse({
        lifecycle: { inherit: {} },
        failureStore: { inherit: {} },
        effectiveLifecycle: {
          dsl: {
            data_retention: '7d',
            downsample: [{ after: '1d', fixed_interval: '2h' }],
          },
          from: 'logs.otel',
        },
        effectiveFailureStore: { lifecycle: { disabled: {} }, from: WIRED_STREAM_NAME },
      });
      mockSendRequest.mockImplementation(async ({ path, method }: any) => {
        if (path === `/api/streams/${WIRED_STREAM_NAME}` && method === 'get') {
          return { data: streamsGetResponse } as any;
        }
        return { data: undefined } as any;
      });

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName={WIRED_STREAM_NAME} onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent('7 days');
      });
      expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent('Inherited');
    });

    it('does not inherit when wired lookup DSL has a different downsampling method', async () => {
      const dataStream = createMockDataStream({
        name: WIRED_STREAM_NAME,
        indexMode: 'lookup',
        indices: [
          {
            name: 'indexName',
            uuid: 'indexId',
            preferILM: false,
            managedBy: 'Data stream lifecycle',
            indexMode: 'standard',
          },
        ],
        lifecycle: {
          enabled: true,
          data_retention: '7d',
          downsampling: [{ after: '1d', fixed_interval: '1h' }],
          downsampling_method: 'last_value',
        },
        _meta: { managed_by: 'streams', managed: true } as any,
      });
      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);
      const streamsGetResponse = createWiredStreamsGetResponse({
        lifecycle: { inherit: {} },
        failureStore: { inherit: {} },
        effectiveLifecycle: {
          dsl: {
            data_retention: '7d',
            downsample: [{ after: '1d', fixed_interval: '1h' }],
          },
          from: 'logs.otel',
        },
        effectiveFailureStore: { lifecycle: { disabled: {} }, from: WIRED_STREAM_NAME },
      });
      mockSendRequest.mockImplementation(async ({ path, method }: any) => {
        if (path === `/api/streams/${WIRED_STREAM_NAME}` && method === 'get') {
          return { data: streamsGetResponse } as any;
        }
        return { data: undefined } as any;
      });

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName={WIRED_STREAM_NAME} onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent('7 days');
      });
      expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent('Inherited');
    });

    it('seeds the flyout from the Streams ingest API', async () => {
      const dataStream = createWiredDataStream();

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const streamsGetResponse = createWiredStreamsGetResponse({
        // Failure store is inherited from the parent stream.
        lifecycle: { dsl: { data_retention: '7d' } },
        failureStore: { inherit: {} },
        effectiveLifecycle: { dsl: { data_retention: '7d' }, from: WIRED_STREAM_NAME },
        effectiveFailureStore: {
          lifecycle: { enabled: { data_retention: '30d' } },
          from: 'logs.otel',
        },
      });

      mockSendRequest.mockImplementation(async ({ path, method }: any) => {
        if (path === `/api/streams/${WIRED_STREAM_NAME}` && method === 'get') {
          return { data: streamsGetResponse } as any;
        }
        return { data: undefined } as any;
      });

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName={WIRED_STREAM_NAME} onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('manageDataStreamButton')).toBeInTheDocument();
      });

      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));

      await userEvent.click(getByTestId('flyoutTab-failed_data'));

      // The flyout reflects the Streams definition: failure store is inherited.
      await waitFor(() => {
        expect(getByTestId('dataLifecycleInheritCheckbox')).toBeChecked();
      });
    });

    it('persists via the Streams ingest API and not via Elasticsearch directly', async () => {
      const dataStream = createWiredDataStream();

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const streamsGetResponse = createWiredStreamsGetResponse({
        lifecycle: { dsl: { data_retention: '7d' } },
        failureStore: { inherit: {} },
        effectiveLifecycle: { dsl: { data_retention: '7d' }, from: WIRED_STREAM_NAME },
        effectiveFailureStore: {
          lifecycle: { enabled: { data_retention: '30d' } },
          from: 'logs.otel',
        },
      });

      const putCalls: any[] = [];
      mockSendRequest.mockImplementation(async ({ path, method, body }: any) => {
        if (path === `/api/streams/${WIRED_STREAM_NAME}` && method === 'get') {
          return { data: streamsGetResponse } as any;
        }
        if (path === `/api/streams/${WIRED_STREAM_NAME}/_ingest` && method === 'put') {
          putCalls.push(body);
          return { data: {} } as any;
        }
        return { data: undefined } as any;
      });

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName={WIRED_STREAM_NAME} onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('manageDataStreamButton')).toBeInTheDocument();
      });

      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));

      await userEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

      await waitFor(() => {
        expect(onCloseMock).toHaveBeenCalledWith(true);
      });

      // Persisted through the Streams ingest API, carrying both lifecycle and failure store.
      expect(putCalls).toHaveLength(1);
      expect(putCalls[0]).toEqual(
        expect.objectContaining({
          ingest: expect.objectContaining({
            lifecycle: expect.anything(),
            failure_store: expect.anything(),
          }),
        })
      );

      // Elasticsearch-direct routes are not used for wired streams.
      expect(mockUpdateDataLifecycle).not.toHaveBeenCalled();
      expect(mockUpdateDSFailureStore).not.toHaveBeenCalled();
      expect(mockUpdateDataStreamSettings).not.toHaveBeenCalled();
      expect(mockUpdateIndexSettings).not.toHaveBeenCalled();
    });

    it('preserves the wired lifecycle when only failed data is edited', async () => {
      const dataStream = createWiredDataStream();
      const lifecycle = { ilm: { policy: 'historical-policy' } } as const;

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const streamsGetResponse = createWiredStreamsGetResponse({
        lifecycle,
        failureStore: { disabled: {} },
        effectiveLifecycle: { ...lifecycle, from: WIRED_STREAM_NAME },
        effectiveFailureStore: { lifecycle: { disabled: {} }, from: WIRED_STREAM_NAME },
      });
      const putCalls: any[] = [];
      mockSendRequest.mockImplementation(async ({ path, method, body }: any) => {
        if (path === `/api/streams/${WIRED_STREAM_NAME}` && method === 'get') {
          return { data: streamsGetResponse } as any;
        }
        if (path === `/api/streams/${WIRED_STREAM_NAME}/_ingest` && method === 'put') {
          putCalls.push(body);
          return { data: {} } as any;
        }
        return { data: undefined } as any;
      });

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName={WIRED_STREAM_NAME} onClose={onCloseMock} />
      );

      await waitFor(() => expect(getByTestId('manageDataStreamButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));
      await userEvent.click(getByTestId('flyoutTab-failed_data'));
      await userEvent.click(getByTestId('editFailedDataLifecycle-enableFailureStoreCheckbox'));
      await userEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

      await waitFor(() => expect(putCalls).toHaveLength(1));
      expect(putCalls[0].ingest.lifecycle).toEqual(lifecycle);
    });

    it('preserves the failure store when applying via the inspect-policy shortcut (no failedData)', async () => {
      const dataStream = createWiredDataStream();

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      // The stream has an explicit (non-inherited) failure store override.
      const explicitFailureStore = { lifecycle: { enabled: { data_retention: '14d' } } };
      const streamsGetResponse = createWiredStreamsGetResponse({
        lifecycle: { ilm: { policy: 'my_policy' } },
        failureStore: explicitFailureStore,
        effectiveLifecycle: { ilm: { policy: 'my_policy' }, from: WIRED_STREAM_NAME },
        effectiveFailureStore: {
          lifecycle: { enabled: { data_retention: '14d' } },
          from: WIRED_STREAM_NAME,
        },
      });

      const putCalls: any[] = [];
      mockSendRequest.mockImplementation(async ({ path, method, body }: any) => {
        if (path === `/api/streams/${WIRED_STREAM_NAME}` && method === 'get') {
          return { data: streamsGetResponse } as any;
        }
        if (path === `/api/streams/${WIRED_STREAM_NAME}/_ingest` && method === 'put') {
          putCalls.push(body);
          return { data: {} } as any;
        }
        if (typeof path === 'string' && path.endsWith('/data_streams/ilm_policies')) {
          return {
            data: {
              hasManageIlm: true,
              policies: [
                {
                  name: 'my_policy',
                  phases: {},
                  serializedPolicy: { name: 'my_policy', phases: {} },
                },
              ],
            },
          } as any;
        }
        return { data: undefined } as any;
      });

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName={WIRED_STREAM_NAME} onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('manageDataStreamButton')).toBeInTheDocument();
      });

      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));

      // Open the inspect-policy flyout from the successful-data tab and use its "Apply" shortcut,
      // which applies only the successful lifecycle (no failedData).
      await waitFor(() =>
        expect(getByTestId('retentionSelectableRowInspect-my_policy')).toBeInTheDocument()
      );
      await userEvent.click(getByTestId('retentionSelectableRowInspect-my_policy'));
      await waitFor(() =>
        expect(getByTestId('inspectIlmPolicyFlyoutSelectAndApplyButton')).toBeInTheDocument()
      );
      await userEvent.click(getByTestId('inspectIlmPolicyFlyoutSelectAndApplyButton'));

      await waitFor(() => {
        expect(putCalls).toHaveLength(1);
      });

      // The failure store must be preserved as-is, not reset to `{ inherit: {} }`.
      expect(putCalls[0].ingest.failure_store).toEqual(explicitFailureStore);
    });

    it('does not offer inheritance for a wired root stream', async () => {
      const rootName = 'logs';
      const dataStream = createMockDataStream({
        name: rootName,
        _meta: { managed_by: 'streams', managed: true } as any,
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
      });

      mockUseLoadDataStream.mockReturnValue({
        data: dataStream,
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const streamsGetResponse = createWiredStreamsGetResponse({
        lifecycle: { dsl: { data_retention: '7d' } },
        failureStore: { lifecycle: { enabled: { data_retention: '14d' } } },
        effectiveLifecycle: { dsl: { data_retention: '7d' }, from: rootName },
        effectiveFailureStore: {
          lifecycle: { enabled: { data_retention: '14d' } },
          from: rootName,
        },
      });

      mockSendRequest.mockImplementation(async ({ path, method }: any) => {
        if (path === `/api/streams/${rootName}` && method === 'get') {
          return { data: streamsGetResponse } as any;
        }
        return { data: undefined } as any;
      });

      const { getByTestId, queryByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName={rootName} onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('manageDataStreamButton')).toBeInTheDocument();
      });

      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));

      await userEvent.click(getByTestId('flyoutTab-failed_data'));

      // A wired root has no parent: no inheritance affordance is rendered.
      await waitFor(() => {
        expect(getByTestId('flyoutTab-failed_data')).toBeInTheDocument();
      });
      expect(queryByTestId('dataLifecycleInheritCheckbox')).not.toBeInTheDocument();
    });
  });

  describe('lookup data stream', () => {
    const loadLookupDataStream = () => {
      mockUseLoadDataStream.mockReturnValue({
        data: createMockDataStream({
          indexMode: 'lookup',
          indices: [
            { name: 'indexName', uuid: 'indexId', preferILM: false, managedBy: 'Unmanaged' },
          ],
        }),
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);
    };

    it('shows "Not applicable" for the successful ingest lifecycle instead of retention', async () => {
      loadLookupDataStream();

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(
          within(getByTestId('successfulIngestLifecycleDetail')).getByTestId(
            'lookupLifecycleNotApplicable'
          )
        ).toBeInTheDocument();
      });
      expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent(/7 days/);
      expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent(
        'Data stream lifecycle'
      );
      expect(getByTestId('indexModeDetail')).toHaveTextContent('Lookup');
    });

    it('keeps lifecycle applicable when a lookup stream has a managed backing index', async () => {
      mockUseLoadDataStream.mockReturnValue({
        data: createMockDataStream({ indexMode: 'lookup' }),
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent(
          'Not applicable'
        );
      });
      expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent(
        'Data stream lifecycle'
      );
    });

    it('shows ILM when a lookup stream only has an ILM-managed backing index', async () => {
      mockUseLoadDataStream.mockReturnValue({
        data: createMockDataStream({
          indexMode: 'lookup',
          indices: [
            {
              name: 'indexName',
              uuid: 'indexId',
              preferILM: true,
              managedBy: 'Index Lifecycle Management',
              ilmPolicyName: 'historical-policy',
            },
          ],
          nextGenerationManagedBy: 'Unmanaged',
          ilmPolicyName: 'current-template-policy',
          lifecycle: undefined,
        }),
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);
      mockSendRequest.mockImplementation(async ({ path }: any) => {
        if (typeof path === 'string' && path.endsWith('/data_streams/ilm_policies')) {
          return {
            data: {
              hasManageIlm: true,
              policies: [
                {
                  name: 'historical-policy',
                  phases: {
                    hot: { actions: {} },
                    delete: { min_age: '30d', actions: { delete: {} } },
                  },
                  serializedPolicy: {
                    name: 'historical-policy',
                    phases: {
                      hot: { actions: {} },
                      delete: { min_age: '30d', actions: { delete: {} } },
                    },
                  },
                },
              ],
            },
          } as any;
        }
        return { data: undefined } as any;
      });

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent(
          'Not applicable'
        );
      });
      expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent(
        'ILM: historical-policy'
      );
      expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent(
        'current-template-policy'
      );
      await waitFor(() => {
        expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent('30 days');
      });
    });

    it('prefers DSL when a lookup stream has DSL and ILM-managed historical indices', async () => {
      mockUseLoadDataStream.mockReturnValue({
        data: createMockDataStream({
          indexMode: 'lookup',
          indices: [
            {
              name: 'indexName1',
              uuid: 'indexId1',
              preferILM: true,
              managedBy: 'Index Lifecycle Management',
            },
            {
              name: 'indexName2',
              uuid: 'indexId2',
              preferILM: false,
              managedBy: 'Data stream lifecycle',
            },
          ],
          nextGenerationManagedBy: 'Index Lifecycle Management',
        }),
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent(
          'Data stream lifecycle'
        );
      });
      expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent('7 days');
      expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent('ILM:');
    });

    it('keeps the successful ingest lifecycle applicable for a standard data stream', async () => {
      mockUseLoadDataStream.mockReturnValue({
        data: createMockDataStream({ indexMode: 'standard' }),
        isLoading: false,
        error: null,
        resendRequest: jest.fn(),
        isInitialRequest: false,
      } as unknown as ReturnType<typeof useLoadDataStream>);

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('successfulIngestLifecycleDetail')).not.toHaveTextContent(
          'Not applicable'
        );
      });
      expect(getByTestId('successfulIngestLifecycleDetail')).toHaveTextContent(
        'Data stream lifecycle'
      );
    });

    it('keeps "Edit data lifecycle" available (failure store lifecycle still applies) and shows the lookup notice in the flyout', async () => {
      loadLookupDataStream();

      const { getByTestId } = renderWithI18n(
        <DataStreamDetailPanel dataStreamName="test-data-stream" onClose={onCloseMock} />
      );

      await waitFor(() => {
        expect(getByTestId('manageDataStreamButton')).toBeInTheDocument();
      });
      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));

      await waitFor(() => {
        expect(getByTestId('lookupLifecycleWarning')).toBeInTheDocument();
      });
    });

    it('does not show the lookup notice when a backing index is lifecycle-managed', async () => {
      mockUseLoadDataStream.mockReturnValue({
        data: createMockDataStream({ indexMode: 'lookup' }),
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
      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));

      expect(queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument();
    });

    it('does not show the DSL notice for an ILM-managed historical standard index', async () => {
      mockUseLoadDataStream.mockReturnValue({
        data: createMockDataStream({
          indexMode: 'lookup',
          indices: [
            {
              name: 'indexName',
              uuid: 'indexId',
              preferILM: true,
              managedBy: 'Index Lifecycle Management',
              indexMode: 'standard',
            },
          ],
        }),
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
      await userEvent.click(getByTestId('manageDataStreamButton'));
      await waitFor(() => expect(getByTestId('editDataLifecycleButton')).toBeInTheDocument());
      await userEvent.click(getByTestId('editDataLifecycleButton'));

      expect(queryByTestId('lookupLifecycleWarning')).not.toBeInTheDocument();
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
