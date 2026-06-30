/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Streams } from '@kbn/streams-schema';
import type { useFailureStoreConfig } from '../../hooks/use_failure_store_config';
import {
  LifecyclePreviewProvider,
  useLifecyclePreview,
} from '../../common/hooks/lifecycle_preview';
import { useEditFailedLifecycleFlyout } from './use_edit_failed_lifecycle_flyout';

let mockInheritedValue: unknown = null;
let mockInheritedLoading = false;

jest.mock('../../../../../../hooks/use_streams_app_fetch', () => ({
  useStreamsAppFetch: () => ({
    value: mockInheritedValue,
    loading: mockInheritedLoading,
    refresh: jest.fn(),
  }),
}));

jest.mock('../../common/hooks/use_inherit_link', () => ({
  useInheritLink: () => undefined,
}));

type FailureStoreConfig = ReturnType<typeof useFailureStoreConfig>;

const createFailureStoreConfig = (
  overrides: Partial<FailureStoreConfig> = {}
): FailureStoreConfig => ({
  failureStoreEnabled: false,
  defaultRetentionPeriod: undefined,
  clusterDefaultRetention: undefined,
  customRetentionPeriod: undefined,
  retentionDisabled: false,
  inheritOptions: {
    canShowInherit: false,
    isWired: false,
    isCurrentlyInherited: false,
  },
  ...overrides,
});

const createDefinition = (): Streams.ingest.all.GetResponse =>
  ({
    stream: {
      name: 'logs-test',
      ingest: { failure_store: { disabled: {} } },
    },
  } as unknown as Streams.ingest.all.GetResponse);

const createKibana = (
  isServerless: boolean,
  toasts: { addSuccess: jest.Mock; addError: jest.Mock }
) =>
  ({
    core: {
      notifications: { toasts },
      http: {},
    },
    dependencies: {
      start: {
        streams: { streamsRepositoryClient: { fetch: jest.fn() } },
      },
    },
    isServerless,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

const Harness = ({
  isServerless,
  updateFailureStore,
  failureStoreConfig,
  refreshDefinition = jest.fn(),
  toasts = { addSuccess: jest.fn(), addError: jest.fn() },
}: {
  isServerless: boolean;
  updateFailureStore: jest.Mock;
  failureStoreConfig: FailureStoreConfig;
  refreshDefinition?: jest.Mock;
  toasts?: { addSuccess: jest.Mock; addError: jest.Mock };
}) => {
  const { mainFlyout, deletePhaseFlyout, openMainFlyout, openDeletePhaseFlyout } =
    useEditFailedLifecycleFlyout({
      definition: createDefinition(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { refresh: jest.fn() } as any,
      refreshDefinition,
      failureStoreConfig,
      kibana: createKibana(isServerless, toasts),
      manageFailureStorePrivilege: true,
      updateFailureStore,
    });

  return (
    <>
      <button type="button" data-test-subj="openMainFlyout" onClick={openMainFlyout}>
        open
      </button>
      <button type="button" data-test-subj="openDeletePhaseFlyout" onClick={openDeletePhaseFlyout}>
        open delete phase
      </button>
      <PreviewProbe />
      {mainFlyout}
      {deletePhaseFlyout}
    </>
  );
};

const PreviewProbe = () => {
  const { isActive, retentionPeriod, dataPhasesCount } = useLifecyclePreview();
  return (
    <div
      data-test-subj="previewProbe"
      data-active={String(isActive)}
      data-retention={retentionPeriod ?? 'null'}
      data-phases={dataPhasesCount ?? 'null'}
    />
  );
};

const renderHarness = (
  isServerless: boolean,
  failureStoreConfigOverrides: Partial<FailureStoreConfig> = {}
) => {
  const updateFailureStore = jest.fn().mockResolvedValue(undefined);
  render(
    <LifecyclePreviewProvider>
      <Harness
        isServerless={isServerless}
        updateFailureStore={updateFailureStore}
        failureStoreConfig={createFailureStoreConfig(failureStoreConfigOverrides)}
      />
    </LifecyclePreviewProvider>
  );
  return { updateFailureStore };
};

describe('useEditFailedLifecycleFlyout - saveMainFlyout', () => {
  beforeEach(() => {
    mockInheritedValue = null;
    mockInheritedLoading = false;
  });

  it('enables the failure store with the default (materialized) lifecycle in Serverless, matching the previewed delete phase', async () => {
    const { updateFailureStore } = renderHarness(true);

    fireEvent.click(screen.getByTestId('openMainFlyout'));
    fireEvent.click(screen.getByTestId('editFailedDataLifecycle-enableFailureStoreCheckbox'));
    fireEvent.click(screen.getByTestId('dataLifecycleFlyoutApplyButton'));

    await waitFor(() => {
      expect(updateFailureStore).toHaveBeenCalledWith('logs-test', {
        lifecycle: { enabled: {} },
      });
    });
  });

  it('enables the failure store with a disabled lifecycle in stateful, matching the previewed infinite retention (no delete phase)', async () => {
    const { updateFailureStore } = renderHarness(false);

    fireEvent.click(screen.getByTestId('openMainFlyout'));
    fireEvent.click(screen.getByTestId('editFailedDataLifecycle-enableFailureStoreCheckbox'));
    fireEvent.click(screen.getByTestId('dataLifecycleFlyoutApplyButton'));

    await waitFor(() => {
      expect(updateFailureStore).toHaveBeenCalledWith('logs-test', {
        lifecycle: { disabled: {} },
      });
    });
  });

  it('previews the cluster default retention (delete phase) when enabling the failure store in Serverless, matching the persisted result', async () => {
    renderHarness(true, { defaultRetentionPeriod: '30d' });

    fireEvent.click(screen.getByTestId('openMainFlyout'));
    fireEvent.click(screen.getByTestId('editFailedDataLifecycle-enableFailureStoreCheckbox'));

    await waitFor(() => {
      const probe = screen.getByTestId('previewProbe');
      expect(probe).toHaveAttribute('data-active', 'true');
      expect(probe).toHaveAttribute('data-retention', '30d');
      expect(probe).toHaveAttribute('data-phases', '2');
    });
  });

  it('previews infinite retention (no delete phase) when enabling the failure store in stateful, matching the persisted result', async () => {
    renderHarness(false, { defaultRetentionPeriod: undefined });

    fireEvent.click(screen.getByTestId('openMainFlyout'));
    fireEvent.click(screen.getByTestId('editFailedDataLifecycle-enableFailureStoreCheckbox'));

    await waitFor(() => {
      const probe = screen.getByTestId('previewProbe');
      expect(probe).toHaveAttribute('data-active', 'true');
      expect(probe).toHaveAttribute('data-phases', '1');
    });
  });

  it('previews infinite retention (no delete phase) when toggling inherit off in stateful, instead of keeping the inherited retention', async () => {
    // The stream currently inherits an enabled failure store with a retention.
    mockInheritedValue = {
      lifecycle: { enabled: { data_retention: '45d', is_default_retention: false } },
    };

    renderHarness(false, {
      failureStoreEnabled: true,
      defaultRetentionPeriod: undefined,
      inheritOptions: {
        canShowInherit: true,
        isWired: false,
        isCurrentlyInherited: true,
      },
    });

    fireEvent.click(screen.getByTestId('openMainFlyout'));

    // While inheriting, the preview mirrors the inherited retention (delete phase).
    await waitFor(() => {
      const probe = screen.getByTestId('previewProbe');
      expect(probe).toHaveAttribute('data-retention', '45d');
      expect(probe).toHaveAttribute('data-phases', '2');
    });

    // Toggling inherit off must immediately reflect the local result: infinite
    // retention (no delete phase) in stateful, not the inherited retention.
    fireEvent.click(screen.getByTestId('dataLifecycleInheritCheckbox'));

    await waitFor(() => {
      const probe = screen.getByTestId('previewProbe');
      expect(probe).toHaveAttribute('data-active', 'true');
      expect(probe).toHaveAttribute('data-phases', '1');
      expect(probe).toHaveAttribute('data-retention', 'null');
    });
  });

  describe('performSaveDeletePhase - Restore default', () => {
    it('hides the "Restore default" button in Serverless when the cluster default is unknown', async () => {
      // In Serverless `cluster.getSettings` is not available, so the real default
      // is unknown (`clusterDefaultRetention` undefined). Rather than show an
      // invented retention, the button is hidden.
      renderHarness(true, {
        failureStoreEnabled: true,
        defaultRetentionPeriod: '30d',
        clusterDefaultRetention: undefined,
        customRetentionPeriod: '10d',
      });

      fireEvent.click(screen.getByTestId('openDeletePhaseFlyout'));

      expect(
        screen.queryByTestId('streamsEditFailedDeletePhaseFlyoutRestoreDefaultButton')
      ).not.toBeInTheDocument();
    });

    it('persists an empty enabled lifecycle when restoring a known cluster default in Serverless so Elasticsearch materializes it', async () => {
      // When the cluster default is known the button is shown; restoring it in
      // Serverless persists `{ lifecycle: { enabled: {} } }` and ES resolves the
      // default retention.
      const { updateFailureStore } = renderHarness(true, {
        failureStoreEnabled: true,
        defaultRetentionPeriod: '30d',
        clusterDefaultRetention: '30d',
        customRetentionPeriod: '10d',
      });

      fireEvent.click(screen.getByTestId('openDeletePhaseFlyout'));
      fireEvent.click(screen.getByTestId('streamsEditFailedDeletePhaseFlyoutRestoreDefaultButton'));
      fireEvent.click(screen.getByTestId('streamsEditFailedDeletePhaseFlyoutApplyButton'));

      await waitFor(() => {
        expect(updateFailureStore).toHaveBeenCalledWith('logs-test', {
          lifecycle: { enabled: {} },
        });
      });
    });

    it('persists the cluster default retention explicitly in stateful, since an empty lifecycle would mean infinite retention', async () => {
      // Stateful: `{ lifecycle: { enabled: {} } }` means infinite retention (no
      // delete phase), so "Restore default" must persist the cluster default value
      // explicitly to keep the delete phase the user chose.
      const { updateFailureStore } = renderHarness(false, {
        failureStoreEnabled: true,
        defaultRetentionPeriod: undefined,
        clusterDefaultRetention: '90d',
        customRetentionPeriod: '10d',
      });

      fireEvent.click(screen.getByTestId('openDeletePhaseFlyout'));
      fireEvent.click(screen.getByTestId('streamsEditFailedDeletePhaseFlyoutRestoreDefaultButton'));
      fireEvent.click(screen.getByTestId('streamsEditFailedDeletePhaseFlyoutApplyButton'));

      await waitFor(() => {
        expect(updateFailureStore).toHaveBeenCalledWith('logs-test', {
          lifecycle: { enabled: { data_retention: '90d' } },
        });
      });
    });
  });

  it('disables Apply while inherited failure store is loading', async () => {
    mockInheritedLoading = true;
    mockInheritedValue = null;

    renderHarness(false, {
      inheritOptions: {
        canShowInherit: true,
        isWired: false,
        isCurrentlyInherited: true,
      },
    });

    fireEvent.click(screen.getByTestId('openMainFlyout'));

    expect(screen.getByTestId('dataLifecycleFlyoutApplyButton')).toBeDisabled();
  });

  it('keeps the main flyout open and shows an error when the save fails', async () => {
    const updateFailureStore = jest.fn().mockRejectedValue(new Error('boom'));
    const toasts = { addSuccess: jest.fn(), addError: jest.fn() };

    render(
      <LifecyclePreviewProvider>
        <Harness
          isServerless={false}
          updateFailureStore={updateFailureStore}
          failureStoreConfig={createFailureStoreConfig()}
          toasts={toasts}
        />
      </LifecyclePreviewProvider>
    );

    fireEvent.click(screen.getByTestId('openMainFlyout'));
    fireEvent.click(screen.getByTestId('editFailedDataLifecycle-enableFailureStoreCheckbox'));
    fireEvent.click(screen.getByTestId('dataLifecycleFlyoutApplyButton'));

    await waitFor(() => {
      expect(updateFailureStore).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(toasts.addError).toHaveBeenCalled();
    });
    // The flyout must stay open so the user can fix the issue and retry without
    // losing their in-progress edits.
    expect(screen.getByTestId('dataLifecycleFlyoutApplyButton')).toBeInTheDocument();
    expect(toasts.addSuccess).not.toHaveBeenCalled();
  });

  it('reports success (not an error) when refreshing the definition fails after a successful save', async () => {
    const updateFailureStore = jest.fn().mockResolvedValue(undefined);
    const refreshDefinition = jest.fn(() => {
      throw new Error('refresh failed');
    });
    const toasts = { addSuccess: jest.fn(), addError: jest.fn() };

    render(
      <LifecyclePreviewProvider>
        <Harness
          isServerless={false}
          updateFailureStore={updateFailureStore}
          failureStoreConfig={createFailureStoreConfig()}
          refreshDefinition={refreshDefinition}
          toasts={toasts}
        />
      </LifecyclePreviewProvider>
    );

    fireEvent.click(screen.getByTestId('openMainFlyout'));
    fireEvent.click(screen.getByTestId('editFailedDataLifecycle-enableFailureStoreCheckbox'));
    fireEvent.click(screen.getByTestId('dataLifecycleFlyoutApplyButton'));

    await waitFor(() => {
      expect(toasts.addSuccess).toHaveBeenCalled();
    });
    // A refresh failure after a successful ES update must not be surfaced as a
    // failed save.
    expect(toasts.addError).not.toHaveBeenCalled();
  });
});
