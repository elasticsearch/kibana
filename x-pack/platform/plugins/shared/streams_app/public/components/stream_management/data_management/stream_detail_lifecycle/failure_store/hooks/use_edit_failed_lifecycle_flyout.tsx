/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Streams, EffectiveFailureStore } from '@kbn/streams-schema';
import { isEnabledFailureStore, isEnabledLifecycleFailureStore } from '@kbn/streams-schema';
import { useGeneratedHtmlId } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import {
  buildFailedDataLifecycleApplyPayload,
  EditFailedDataLifecycleFlyoutBody,
  FlyoutFooterWithRetentionWarning,
} from '@kbn/data-lifecycle-phases';
import type { useDataStreamStats } from '../../hooks/use_data_stream_stats';
import type { useFailureStoreConfig } from '../../hooks/use_failure_store_config';
import type { EditDeletePhaseFlyoutValue } from '../../data_phases/edit_delete_phase_flyout';
import { EditDeletePhaseFlyout } from '../../data_phases/edit_delete_phase_flyout';
import { useStreamsAppFetch } from '../../../../../../hooks/use_streams_app_fetch';
import { useLifecyclePreview } from '../../common/hooks/lifecycle_preview';
import type { EditFlyoutPreviewModel } from '../../common/hooks/use_edit_flyout_preview_sync';
import { useEditFlyoutPreviewSyncFromModel } from '../../common/hooks/use_edit_flyout_preview_sync';
import { useInheritLink } from '../../common/hooks/use_inherit_link';
import { useOverrideSettingsConfirmation } from '../../common/hooks/use_override_settings_confirmation';
import { LifecycleFlyout } from '../../common/lifecycle_flyout';
import type { useKibana } from '../../../../../../hooks/use_kibana';
import { getFormattedError } from '../../../../../../util/errors';

type FailureStoreConfig = ReturnType<typeof useFailureStoreConfig>;
type KibanaContext = ReturnType<typeof useKibana>;

export interface UseEditFailedLifecycleFlyoutArgs {
  definition: Streams.ingest.all.GetResponse;
  data: ReturnType<typeof useDataStreamStats>;
  refreshDefinition: () => void;
  failureStoreConfig: FailureStoreConfig;
  kibana: KibanaContext;
  manageFailureStorePrivilege: boolean;
  updateFailureStore: (
    streamName: string,
    failureStore: Streams.ingest.all.GetResponse['stream']['ingest']['failure_store']
  ) => Promise<unknown>;
  isExternalFlyoutOpen?: boolean;
  onFlyoutOpenChange?: (isOpen: boolean) => void;
}

const getInheritedFailureStoreEnabled = (
  inheritedFailureStore: EffectiveFailureStore | null
): boolean => {
  return Boolean(inheritedFailureStore && isEnabledFailureStore(inheritedFailureStore));
};

const getInheritedFailureStoreRetention = (
  inheritedFailureStore: EffectiveFailureStore
): string | undefined => {
  if (isEnabledLifecycleFailureStore(inheritedFailureStore)) {
    return inheritedFailureStore.lifecycle.enabled.data_retention;
  }
  return undefined;
};

export const useEditFailedLifecycleFlyout = ({
  definition,
  data,
  refreshDefinition,
  failureStoreConfig,
  kibana,
  manageFailureStorePrivilege,
  updateFailureStore,
  isExternalFlyoutOpen = false,
  onFlyoutOpenChange,
}: UseEditFailedLifecycleFlyoutArgs) => {
  const {
    core: { notifications },
    dependencies: {
      start: {
        streams: { streamsRepositoryClient },
      },
    },
    isServerless,
  } = kibana;

  const {
    failureStoreEnabled,
    defaultRetentionPeriod,
    clusterDefaultRetention,
    customRetentionPeriod,
    inheritOptions,
    retentionDisabled,
  } = failureStoreConfig;

  // Used only to *preview* the delete phase that Elasticsearch will materialize when
  // the failure store is enabled without an explicit retention; the persisted payload
  // never uses it. `defaultRetentionPeriod` is intentionally undefined when a custom
  // retention is active, so fall back to the raw cluster default, and finally to the
  // failure store default of 30d when the cluster default is unknown (e.g. in
  // Serverless `cluster.getSettings` is not available).
  const effectiveDefaultRetentionPeriod =
    defaultRetentionPeriod ?? clusterDefaultRetention ?? '30d';

  const {
    setIsActive: setPreviewIsActive,
    setRetentionPeriod: setPreviewRetentionPeriod,
    setDataPhasesCount: setPreviewDataPhasesCount,
    clearPreview: clearLifecyclePreview,
  } = useLifecyclePreview();

  const titleId = useGeneratedHtmlId({ prefix: 'streamsEditFailedDataLifecycleFlyoutTitle' });

  const { confirmOverride, modal: overrideModal } = useOverrideSettingsConfirmation({
    definition,
    isCurrentlyInherited: inheritOptions.isCurrentlyInherited,
    forceDlm: true,
  });

  const [isMainFlyoutOpen, setIsMainFlyoutOpen] = useState(false);
  const [isDeletePhaseFlyoutOpen, setIsDeletePhaseFlyoutOpen] = useState(false);
  const [inheritLifecycle, setInheritLifecycle] = useState(inheritOptions.isCurrentlyInherited);
  const [failureStoreEnabledDraft, setFailureStoreEnabledDraft] = useState(failureStoreEnabled);
  const [isSaving, setIsSaving] = useState(false);

  const inheritedFetchEnabled =
    isMainFlyoutOpen && inheritOptions.canShowInherit && inheritLifecycle;

  const {
    value: inheritedFailureStore,
    loading: isLoadingInheritedFailureStore,
    refresh: resetInheritedFailureStore,
  } = useStreamsAppFetch(
    async ({ signal }) => {
      if (!inheritedFetchEnabled) {
        return null;
      }
      const { failure_store: failureStore } = await streamsRepositoryClient.fetch(
        'GET /internal/streams/{name}/failure_store/_inherited',
        {
          signal,
          params: { path: { name: definition.stream.name } },
        }
      );
      return failureStore;
    },
    [inheritedFetchEnabled, streamsRepositoryClient, definition.stream.name],
    { withTimeRange: false, withRefresh: false }
  );

  const inheritedFailureStoreOrNull = inheritedFetchEnabled
    ? isLoadingInheritedFailureStore
      ? null
      : inheritedFailureStore ?? null
    : null;

  const isAnyFlyoutOpenInternal = isMainFlyoutOpen || isDeletePhaseFlyoutOpen;
  const isAnyFlyoutOpen = isAnyFlyoutOpenInternal || Boolean(isExternalFlyoutOpen);

  const failureStoreEnabledForUi = isMainFlyoutOpen
    ? inheritLifecycle
      ? inheritedFailureStoreOrNull
        ? getInheritedFailureStoreEnabled(inheritedFailureStoreOrNull)
        : failureStoreEnabled
      : failureStoreEnabledDraft
    : failureStoreEnabled;

  const openMainFlyout = useCallback(() => {
    if (isDeletePhaseFlyoutOpen || isExternalFlyoutOpen) {
      return;
    }
    setInheritLifecycle(inheritOptions.isCurrentlyInherited);
    setFailureStoreEnabledDraft(failureStoreEnabled);
    resetInheritedFailureStore();
    setIsMainFlyoutOpen(true);
  }, [
    failureStoreEnabled,
    inheritOptions.isCurrentlyInherited,
    isDeletePhaseFlyoutOpen,
    isExternalFlyoutOpen,
    resetInheritedFailureStore,
  ]);

  const closeMainFlyout = useCallback(() => {
    setIsMainFlyoutOpen(false);
  }, []);

  const onChangeInheritLifecycle = useCallback(
    (next: boolean) => {
      setInheritLifecycle(next);
      if (next) {
        resetInheritedFailureStore();
      }
    },
    [resetInheritedFailureStore]
  );

  useEffect(() => {
    if (!isMainFlyoutOpen || !inheritLifecycle || !inheritedFailureStoreOrNull) {
      return;
    }
    setFailureStoreEnabledDraft(getInheritedFailureStoreEnabled(inheritedFailureStoreOrNull));
  }, [inheritLifecycle, inheritedFailureStoreOrNull, isMainFlyoutOpen]);

  const syncDeletePhasePreview = useCallback(
    (retention: string | null) => {
      setPreviewIsActive(true);
      setPreviewRetentionPeriod(retention);
      setPreviewDataPhasesCount(retention ? 2 : 1);
    },
    [setPreviewDataPhasesCount, setPreviewIsActive, setPreviewRetentionPeriod]
  );

  const mainFlyoutPreviewModel = useMemo<EditFlyoutPreviewModel>(() => {
    if (inheritLifecycle) {
      if (!inheritedFailureStoreOrNull) {
        return { action: 'clear' };
      }
      const lifecycleEnabled = isEnabledLifecycleFailureStore(inheritedFailureStoreOrNull);
      const retention = lifecycleEnabled
        ? getInheritedFailureStoreRetention(inheritedFailureStoreOrNull) ??
          effectiveDefaultRetentionPeriod
        : null;
      return { action: 'apply', retentionPeriod: retention, dataPhasesCount: retention ? 2 : 1 };
    }
    if (!failureStoreEnabledDraft) {
      return { action: 'clear' };
    }

    if (!isServerless) {
      return { action: 'apply', retentionPeriod: null, dataPhasesCount: 1 };
    }
    return {
      action: 'apply',
      retentionPeriod: effectiveDefaultRetentionPeriod,
      dataPhasesCount: 2,
    };
  }, [
    effectiveDefaultRetentionPeriod,
    failureStoreEnabledDraft,
    inheritLifecycle,
    inheritedFailureStoreOrNull,
    isServerless,
  ]);

  useEditFlyoutPreviewSyncFromModel({
    isFlyoutOpen: isMainFlyoutOpen && !isDeletePhaseFlyoutOpen,
    isExternalFlyoutOpen: isDeletePhaseFlyoutOpen || Boolean(isExternalFlyoutOpen),
    preview: mainFlyoutPreviewModel,
  });

  const failedInheritLabel = inheritOptions.isWired
    ? i18n.translate('xpack.streams.editFailedLifecycle.inheritFromParentLabel', {
        defaultMessage: 'Inherit lifecycle from parent stream',
      })
    : i18n.translate('xpack.streams.editFailedLifecycle.inheritFromIndexTemplateLabel', {
        defaultMessage: 'Inherit lifecycle from index template',
      });

  const failedInheritLink = useInheritLink(definition, {
    classicIndexTemplate: i18n.translate(
      'xpack.streams.editFailedLifecycle.viewIndexTemplateLinkLabel',
      { defaultMessage: 'View index template' }
    ),
    wiredParentStream: i18n.translate(
      'xpack.streams.editFailedLifecycle.viewParentStreamLinkLabel',
      { defaultMessage: 'View parent stream' }
    ),
  });

  const saveFailureStore = useCallback(
    async (
      next: Streams.ingest.all.GetResponse['stream']['ingest']['failure_store'],
      {
        successMessage,
        errorMessage,
        onSuccess,
      }: {
        successMessage: string;
        errorMessage?: string;
        onSuccess?: () => void;
      }
    ) => {
      try {
        setIsSaving(true);
        await updateFailureStore(definition.stream.name, next);
      } catch (error) {
        notifications.toasts.addError(getFormattedError(error), {
          title:
            errorMessage ??
            i18n.translate('xpack.streams.streamDetailFailureStore.updateFailureStoreFailed', {
              defaultMessage: "We couldn't update the failure store settings.",
            }),
        });
        // Keep the flyout open (no onSuccess) so the user can fix the issue and
        // retry without losing their in-progress edits.
        return;
      } finally {
        setIsSaving(false);
        data.refresh();
      }
      notifications.toasts.addSuccess({ title: successMessage });
      onSuccess?.();
      try {
        refreshDefinition();
      } catch {
        // The save already succeeded; a stale view will recover on the next refresh.
      }
    },
    [data, definition.stream.name, notifications.toasts, refreshDefinition, updateFailureStore]
  );

  const saveSuccessMessage = i18n.translate(
    'xpack.streams.streamDetailFailureStore.updateFailureStoreSuccess',
    { defaultMessage: 'Failure store settings saved' }
  );

  const performSaveMainFlyout = () => {
    const payload = buildFailedDataLifecycleApplyPayload({
      inheritLifecycle,
      failureStoreEnabled: failureStoreEnabledDraft,
    });

    // Persist exactly what the preview shows. When enabling the failure store
    // without an explicit retention, the preview differs by deployment:
    // - Stateful: infinite retention / 1 data phase. That maps to a disabled
    //   lifecycle (`{ lifecycle: { disabled: {} } }`); persisting
    //   `{ lifecycle: { enabled: {} } }` would instead let Elasticsearch
    //   materialize the cluster default (e.g. 30d / 2 phases), contradicting the
    //   preview.
    // - Serverless: the cluster default retention / 2 data phases, which is what
    //   `{ lifecycle: { enabled: {} } }` materializes.
    const enabledWithoutRetention = isServerless
      ? { lifecycle: { enabled: {} } }
      : { lifecycle: { disabled: {} } };

    const nextFailureStore =
      payload.inheritLifecycle === true
        ? { inherit: {} }
        : payload.failureStoreEnabled
        ? payload.retention
          ? { lifecycle: { enabled: { data_retention: payload.retention } } }
          : enabledWithoutRetention
        : { disabled: {} };

    return saveFailureStore(nextFailureStore, {
      successMessage: saveSuccessMessage,
      onSuccess: closeMainFlyout,
    });
  };

  const saveMainFlyout = () => {
    if (inheritLifecycle) {
      performSaveMainFlyout();
      return;
    }
    confirmOverride(() => performSaveMainFlyout());
  };

  const failedDeletePhaseInitialValue: EditDeletePhaseFlyoutValue = useMemo(() => {
    if (!failureStoreEnabled || retentionDisabled) {
      return { deletePhaseEnabled: false };
    }
    const retention = customRetentionPeriod ?? defaultRetentionPeriod;
    if (!retention) {
      return { deletePhaseEnabled: false };
    }
    return {
      deletePhaseEnabled: true,
      dataRetention: retention,
      isDefaultRetention: customRetentionPeriod == null,
    };
  }, [customRetentionPeriod, defaultRetentionPeriod, failureStoreEnabled, retentionDisabled]);

  const failedDeletePhaseInitialRetention = useMemo(() => {
    return failedDeletePhaseInitialValue.deletePhaseEnabled
      ? failedDeletePhaseInitialValue.dataRetention
      : undefined;
  }, [failedDeletePhaseInitialValue]);

  const closeDeletePhaseFlyout = useCallback(() => {
    setIsDeletePhaseFlyoutOpen(false);
  }, []);

  useEffect(() => {
    if (!isDeletePhaseFlyoutOpen) {
      // The delete-phase flyout is closed, so it no longer owns the preview. Only
      // clear it when the main flyout is also closed: while the main flyout is open
      // its own model (`mainFlyoutPreviewModel`) drives the preview, and clearing it
      // here would wipe that result (e.g. show the inherited retention after toggling
      // inherit off).
      if (!isMainFlyoutOpen) {
        clearLifecyclePreview();
      }
      return;
    }

    // When the delete phase is enabled but the concrete retention isn't known on
    // the client (e.g. a default retention that ES will materialize), fall back
    // to the effective default so the preview keeps showing a delete phase
    // (2 data phases) instead of collapsing to infinite retention (1 data phase).
    const nextRetention = failedDeletePhaseInitialValue.deletePhaseEnabled
      ? failedDeletePhaseInitialRetention ?? effectiveDefaultRetentionPeriod
      : effectiveDefaultRetentionPeriod;
    syncDeletePhasePreview(nextRetention ?? null);
  }, [
    clearLifecyclePreview,
    effectiveDefaultRetentionPeriod,
    failedDeletePhaseInitialRetention,
    failedDeletePhaseInitialValue.deletePhaseEnabled,
    isDeletePhaseFlyoutOpen,
    isMainFlyoutOpen,
    syncDeletePhasePreview,
  ]);

  const performSaveDeletePhase = (next: EditDeletePhaseFlyoutValue) => {
    // `isDefaultRetention` means "use the cluster default". In Serverless,
    // persisting `{ lifecycle: { enabled: {} } }` lets Elasticsearch materialize
    // that default as the delete phase. In stateful, the same payload means
    // infinite retention (no delete phase), so a delete phase set via "Restore
    // default" must persist the cluster default value explicitly to keep the
    // delete phase the user just chose.
    const nextFailureStore = next.deletePhaseEnabled
      ? next.isDefaultRetention && isServerless
        ? { lifecycle: { enabled: {} } }
        : { lifecycle: { enabled: { data_retention: next.dataRetention } } }
      : { lifecycle: { disabled: {} } };

    if (inheritOptions.isCurrentlyInherited) {
      setInheritLifecycle(false);
    }

    return saveFailureStore(nextFailureStore, {
      successMessage: saveSuccessMessage,
      onSuccess: closeDeletePhaseFlyout,
    });
  };

  const saveDeletePhase = (next: EditDeletePhaseFlyoutValue) => {
    confirmOverride(() => performSaveDeletePhase(next));
  };

  const performRemoveDeletePhase = () => {
    if (inheritOptions.isCurrentlyInherited) {
      setInheritLifecycle(false);
    }
    return saveFailureStore(
      { lifecycle: { disabled: {} } },
      {
        successMessage: i18n.translate('xpack.streams.failureStore.removeDeletePhaseSuccess', {
          defaultMessage: 'Delete phase removed',
        }),
        errorMessage: i18n.translate('xpack.streams.failureStore.removeDeletePhaseError', {
          defaultMessage: 'Failed to remove delete phase',
        }),
      }
    );
  };

  const removeDeletePhase = () => {
    confirmOverride(() => performRemoveDeletePhase());
  };

  const openDeletePhaseFlyout = useCallback(() => {
    if (isMainFlyoutOpen || isExternalFlyoutOpen) {
      return;
    }
    setInheritLifecycle(inheritOptions.isCurrentlyInherited);
    setIsDeletePhaseFlyoutOpen(true);
  }, [inheritOptions.isCurrentlyInherited, isExternalFlyoutOpen, isMainFlyoutOpen]);

  const onChangeDeletePhase = (next: EditDeletePhaseFlyoutValue) => {
    const nextRetention = next.deletePhaseEnabled ? next.dataRetention : null;
    syncDeletePhasePreview(nextRetention);
  };

  useEffect(() => {
    onFlyoutOpenChange?.(isAnyFlyoutOpenInternal);
  }, [isAnyFlyoutOpenInternal, onFlyoutOpenChange]);

  const mainFlyout =
    isMainFlyoutOpen && manageFailureStorePrivilege ? (
      <LifecycleFlyout
        onClose={closeMainFlyout}
        ownFocus={false}
        paddingSize="none"
        data-test-subj="streamsEditFailedDataLifecycleFlyout"
        titleId={titleId}
        title={i18n.translate('xpack.streams.editFailedLifecycle.title', {
          defaultMessage: 'Edit failed data lifecycle',
        })}
      >
        <EditFailedDataLifecycleFlyoutBody
          inherit={
            inheritOptions.canShowInherit
              ? {
                  value: inheritLifecycle,
                  onChange: onChangeInheritLifecycle,
                  label: failedInheritLabel,
                  link: failedInheritLink,
                }
              : undefined
          }
          failureStore={{
            value: failureStoreEnabledDraft,
            onChange: setFailureStoreEnabledDraft,
          }}
        />

        <FlyoutFooterWithRetentionWarning
          onCancel={closeMainFlyout}
          onApply={saveMainFlyout}
          isApplyDisabled={
            isSaving ||
            (inheritLifecycle && inheritedFetchEnabled && inheritedFailureStoreOrNull === null) ||
            (inheritLifecycle === inheritOptions.isCurrentlyInherited &&
              failureStoreEnabledDraft === failureStoreEnabled)
          }
          showWarning={false}
        />
      </LifecycleFlyout>
    ) : null;

  const deletePhaseFlyout =
    isDeletePhaseFlyoutOpen && manageFailureStorePrivilege ? (
      <EditDeletePhaseFlyout
        initialValue={failedDeletePhaseInitialValue}
        defaultRetentionPeriod={clusterDefaultRetention}
        showRestoreDefaultButton
        allowRemoveDeletePhase={!isServerless}
        onChange={onChangeDeletePhase}
        onSave={saveDeletePhase}
        onClose={closeDeletePhaseFlyout}
        isSaving={isSaving}
        data-test-subj="streamsEditFailedDeletePhaseFlyout"
      />
    ) : null;

  return {
    mainFlyout,
    deletePhaseFlyout,
    overrideModal,
    openMainFlyout,
    openDeletePhaseFlyout,
    removeDeletePhase,
    isMainFlyoutOpen,
    isDeletePhaseFlyoutOpen,
    isAnyFlyoutOpen,
    failureStoreEnabledForUi,
    previewInheritLifecycle: isAnyFlyoutOpen ? inheritLifecycle : undefined,
    previewFailureStoreEnabled: isAnyFlyoutOpen ? failureStoreEnabledForUi : undefined,
  };
};
