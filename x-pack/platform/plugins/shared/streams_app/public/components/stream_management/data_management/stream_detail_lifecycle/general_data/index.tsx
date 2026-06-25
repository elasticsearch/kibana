/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiTitle, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useAbortController } from '@kbn/react-hooks';
import { type IngestStreamLifecycle, type Streams } from '@kbn/streams-schema';
import {
  Streams as StreamsSchema,
  effectiveToIngestLifecycle,
  isIlmLifecycle,
  isInheritLifecycle,
  isRoot,
} from '@kbn/streams-schema';
import { useUnsavedChangesPrompt } from '@kbn/unsaved-changes-prompt';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isEqual, omit } from 'lodash';
import { useKibana } from '../../../../../hooks/use_kibana';
import { useTimefilter } from '../../../../../hooks/use_timefilter';
import { getFormattedError } from '../../../../../util/errors';
import { getStreamTypeFromDefinition } from '../../../../../util/get_stream_type_from_definition';
import type { useDataStreamStats } from '../hooks/use_data_stream_stats';
import {
  LifecycleAfterSaveProvider,
  useLifecycleAfterSave,
} from '../common/hooks/lifecycle_after_save';
import { LifecyclePreviewProvider, useLifecyclePreview } from '../common/hooks/lifecycle_preview';
import { useOverrideSettingsConfirmation } from '../common/hooks/use_override_settings_confirmation';
import { SectionPanel } from '../common/section_panel';
import { buildDlmPreviewModel, type IlmPhasesMap } from '../common/data_lifecycle/preview_models';
import type { EditDeletePhaseFlyoutValue } from '../data_phases/edit_delete_phase_flyout';
import { EditDeletePhaseFlyout } from '../data_phases/edit_delete_phase_flyout';
import { useIlmPhasesColorAndDescription } from '../hooks/use_ilm_phases_color_and_description';
import { RetentionCard } from './cards/retention_card';
import { StorageSizeCard } from './cards/storage_size_card';
import { IngestionCard } from './cards/ingestion_card';
import { LifecycleSummary } from './lifecycle_summary';
import { IngestionRate } from './ingestion_rate';
import { useEditSuccessfulLifecycleFlyout } from './hooks/use_edit_successful_lifecycle_flyout';

const StreamDetailGeneralDataInner = ({
  definition,
  refreshDefinition,
  data,
  isExternalFlyoutOpen = false,
  onFlyoutOpenChange,
}: {
  definition: Streams.ingest.all.GetResponse;
  refreshDefinition: () => void;
  data: ReturnType<typeof useDataStreamStats>;
  isExternalFlyoutOpen?: boolean;
  onFlyoutOpenChange?: (isOpen: boolean) => void;
}) => {
  const kibana = useKibana();
  const {
    core,
    isServerless,
    appParams,
    dependencies: {
      start: {
        streams: { streamsRepositoryClient },
      },
    },
    services: { telemetryClient },
  } = kibana;
  const { notifications, http, overlays, application } = core;

  const { timeState } = useTimefilter();

  const [updateInProgress, setUpdateInProgress] = useState(false);
  const {
    hasUnsavedChanges,
    setDataPhasesCount: setPreviewDataPhasesCount,
    setDownsampleStepsCount: setPreviewDownsampleStepsCount,
    setHasUnsavedChanges: setPreviewHasUnsavedChanges,
    setIsActive: setPreviewIsActive,
    setRetentionPeriod: setPreviewRetentionPeriod,
    setTimelineModel: setPreviewTimelineModel,
    clearPreview: clearLifecyclePreview,
    isDslDownsampleFlyoutOpen,
  } = useLifecyclePreview();
  const { notifyAfterSave } = useLifecycleAfterSave();
  const { euiTheme } = useEuiTheme();
  const { ilmPhases } = useIlmPhasesColorAndDescription();

  const [isEditSuccessfulDeletePhaseFlyoutOpen, setIsEditSuccessfulDeletePhaseFlyoutOpen] =
    useState(false);
  const [isEditDataPhasesFlyoutOpen, setIsEditDataPhasesFlyoutOpen] = useState(false);
  const closeSuccessfulLifecycleFlyoutRef = useRef<() => void>(() => {});

  useUnsavedChangesPrompt({
    hasUnsavedChanges,
    history: appParams.history,
    http,
    navigateToUrl: application.navigateToUrl,
    openConfirm: overlays.openConfirm,
    shouldPromptOnReplace: false,
    messageText: i18n.translate('xpack.streams.streamDetailLifecycle.unsavedChangesPrompt', {
      defaultMessage:
        'You have unsaved changes in the stream lifecycle. If you leave without saving, your changes will be lost.',
    }),
    titleText: i18n.translate('xpack.streams.streamDetailLifecycle.unsavedChangesPromptTitle', {
      defaultMessage: 'Unsaved changes',
    }),
    confirmButtonText: i18n.translate(
      'xpack.streams.streamDetailLifecycle.unsavedChangesPromptConfirmButton',
      {
        defaultMessage: 'Leave without saving',
      }
    ),
    cancelButtonText: i18n.translate(
      'xpack.streams.streamDetailLifecycle.unsavedChangesPromptCancelButton',
      {
        defaultMessage: 'Keep editing',
      }
    ),
  });

  const { signal } = useAbortController();

  const closeEditSuccessfulDeletePhaseFlyout = useCallback(() => {
    setIsEditSuccessfulDeletePhaseFlyoutOpen(false);
  }, []);

  const updateLifecycle = async (lifecycle: IngestStreamLifecycle): Promise<boolean> => {
    try {
      setUpdateInProgress(true);

      const body = {
        ingest: {
          ...definition.stream.ingest,
          processing: omit(definition.stream.ingest.processing, 'updated_at'),
          lifecycle,
        },
      };

      await streamsRepositoryClient.fetch('PUT /api/streams/{name}/_ingest 2023-10-31', {
        params: {
          path: { name: definition.stream.name },
          body,
        },
        signal,
      });

      notifyAfterSave();
      refreshDefinition();
      closeSuccessfulLifecycleFlyoutRef.current();
      closeEditSuccessfulDeletePhaseFlyout();

      telemetryClient.trackRetentionChanged(
        lifecycle,
        getStreamTypeFromDefinition(definition.stream)
      );
      notifications.toasts.addSuccess({
        title: i18n.translate('xpack.streams.streamDetailLifecycle.updated', {
          defaultMessage: 'Stream lifecycle updated',
        }),
      });
      return true;
    } catch (error) {
      notifications.toasts.addError(getFormattedError(error), {
        title: i18n.translate('xpack.streams.streamDetailLifecycle.failed', {
          defaultMessage: 'Failed to update lifecycle',
        }),
      });
      return false;
    } finally {
      setUpdateInProgress(false);
    }
  };

  const successfulLifecycleFlyout = useEditSuccessfulLifecycleFlyout({
    definition,
    stats: data.stats?.ds.stats,
    core,
    http,
    application,
    streamsRepositoryClient,
    isServerless,
    euiTheme,
    ilmPhases: ilmPhases as IlmPhasesMap,
    signal,
    updateLifecycle,
    updateInProgress,
    isExternalFlyoutOpen: isEditSuccessfulDeletePhaseFlyoutOpen || isEditDataPhasesFlyoutOpen,
  });
  closeSuccessfulLifecycleFlyoutRef.current = successfulLifecycleFlyout.closeFlyout;

  const baselinePreviewHeader = useMemo(() => {
    const inheritLifecycle = isInheritLifecycle(definition.stream.ingest.lifecycle);
    const method: 'dlm' | 'ilm' = isIlmLifecycle(definition.effective_lifecycle) ? 'ilm' : 'dlm';
    return {
      inheritLifecycle,
      method,
      ilmPolicyName:
        method === 'ilm' && isIlmLifecycle(definition.effective_lifecycle)
          ? definition.effective_lifecycle.ilm.policy
          : undefined,
      canShowInheritBadge: !(
        StreamsSchema.WiredStream.GetResponse.is(definition) && isRoot(definition.stream.name)
      ),
    };
  }, [definition]);

  const previewHeader = successfulLifecycleFlyout.isOpen
    ? successfulLifecycleFlyout.previewHeader ?? baselinePreviewHeader
    : baselinePreviewHeader;

  const openEditSuccessfulDeletePhaseFlyout = useCallback(() => {
    if (successfulLifecycleFlyout.isOpen || isEditDataPhasesFlyoutOpen || isExternalFlyoutOpen) {
      return;
    }
    setIsEditSuccessfulDeletePhaseFlyoutOpen(true);
  }, [successfulLifecycleFlyout.isOpen, isEditDataPhasesFlyoutOpen, isExternalFlyoutOpen]);

  const {
    confirmOverride: confirmSuccessfulDeletePhaseOverride,
    modal: successfulDeletePhaseOverrideModal,
  } = useOverrideSettingsConfirmation({ definition });

  const onSaveSuccessfulDeletePhase = (next: EditDeletePhaseFlyoutValue) => {
    const baseline = effectiveToIngestLifecycle(definition.effective_lifecycle);
    const baselineDsl = 'dsl' in baseline ? baseline.dsl : {};

    const applyDeletePhase = () => {
      if (next.deletePhaseEnabled) {
        updateLifecycle({
          dsl: {
            ...baselineDsl,
            data_retention: next.dataRetention,
          },
        });
        return;
      }

      const { data_retention: _removed, ...rest } = baselineDsl;
      updateLifecycle({ dsl: { ...rest } });
    };

    confirmSuccessfulDeletePhaseOverride(applyDeletePhase);
  };

  const successfulDeletePhaseInitialValue: EditDeletePhaseFlyoutValue = React.useMemo(() => {
    const baseline = effectiveToIngestLifecycle(definition.effective_lifecycle);
    if ('dsl' in baseline) {
      const dataRetention = baseline.dsl.data_retention;
      if (dataRetention) {
        return { deletePhaseEnabled: true, dataRetention, isDefaultRetention: false };
      }
    }

    return { deletePhaseEnabled: false };
  }, [definition.effective_lifecycle]);

  const successfulDeletePhaseInitialPreviewValue: EditDeletePhaseFlyoutValue = React.useMemo(() => {
    if (successfulDeletePhaseInitialValue.deletePhaseEnabled) {
      return successfulDeletePhaseInitialValue;
    }

    return { deletePhaseEnabled: true, dataRetention: '30d', isDefaultRetention: false };
  }, [successfulDeletePhaseInitialValue]);

  const setDeletePhasePreview = useCallback(
    (next: EditDeletePhaseFlyoutValue) => {
      const retentionPeriod = next.deletePhaseEnabled ? next.dataRetention : undefined;
      const baseline = effectiveToIngestLifecycle(definition.effective_lifecycle);
      const downsampleSteps = 'dsl' in baseline ? baseline.dsl.downsample ?? null : null;
      const model = buildDlmPreviewModel({
        isServerless,
        hotColor: isServerless ? euiTheme.colors.severity.success : ilmPhases.hot.color,
        hotDescription: ilmPhases.hot.description,
        deletePhaseColor: ilmPhases.delete.color,
        deletePhaseDescription: ilmPhases.delete.description,
        stats: {
          size: data.stats?.ds.stats?.size,
          sizeBytes: data.stats?.ds.stats?.sizeBytes,
          totalDocs: data.stats?.ds.stats?.totalDocs,
        },
        retentionPeriod,
        downsampleSteps,
        indexMode: definition.index_mode ?? 'standard',
      });

      setPreviewIsActive(true);
      setPreviewHasUnsavedChanges(!isEqual(next, successfulDeletePhaseInitialPreviewValue));
      setPreviewTimelineModel({ phases: model.phases, downsampleSteps: model.downsampleSteps });
      setPreviewRetentionPeriod(model.retentionPeriod);
      setPreviewDataPhasesCount(model.dataPhasesCount);
      setPreviewDownsampleStepsCount(model.downsampleStepsCount);
    },
    [
      data.stats?.ds.stats?.size,
      data.stats?.ds.stats?.sizeBytes,
      data.stats?.ds.stats?.totalDocs,
      definition.effective_lifecycle,
      definition.index_mode,
      euiTheme.colors.severity.success,
      ilmPhases.delete.color,
      ilmPhases.delete.description,
      ilmPhases.hot.color,
      ilmPhases.hot.description,
      isServerless,
      successfulDeletePhaseInitialPreviewValue,
      setPreviewDataPhasesCount,
      setPreviewDownsampleStepsCount,
      setPreviewHasUnsavedChanges,
      setPreviewIsActive,
      setPreviewRetentionPeriod,
      setPreviewTimelineModel,
    ]
  );

  useEffect(() => {
    if (isEditSuccessfulDeletePhaseFlyoutOpen) {
      setDeletePhasePreview(successfulDeletePhaseInitialPreviewValue);
      return;
    }

    if (isEditDataPhasesFlyoutOpen || isDslDownsampleFlyoutOpen) {
      return;
    }

    clearLifecyclePreview();
  }, [
    isEditSuccessfulDeletePhaseFlyoutOpen,
    isEditDataPhasesFlyoutOpen,
    isDslDownsampleFlyoutOpen,
    clearLifecyclePreview,
    setDeletePhasePreview,
    successfulDeletePhaseInitialPreviewValue,
  ]);

  const isAnySuccessfulFlyoutOpenInternal =
    successfulLifecycleFlyout.isOpen || isEditSuccessfulDeletePhaseFlyoutOpen;
  const isBlockingFlyoutOpenForCrossSection =
    isAnySuccessfulFlyoutOpenInternal || isEditDataPhasesFlyoutOpen;
  const isAnySuccessfulFlyoutOpen = isAnySuccessfulFlyoutOpenInternal || isExternalFlyoutOpen;

  useEffect(() => {
    onFlyoutOpenChange?.(isBlockingFlyoutOpenForCrossSection);
  }, [isBlockingFlyoutOpenForCrossSection, onFlyoutOpenChange]);

  return (
    <>
      <EuiFlexGroup direction="column" gutterSize="m" css={{ flexGrow: 0 }}>
        <EuiTitle size="xs">
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <h4>
                {i18n.translate('xpack.streams.streamDetailLifecycle.successfulData', {
                  defaultMessage: 'Successful data',
                })}
              </h4>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiTitle>

        {/* Retention Section */}
        <SectionPanel
          topCard={<RetentionCard definition={definition} />}
          bottomCard={
            <StorageSizeCard
              hasMonitorPrivileges={definition.privileges?.monitor}
              isTimeSeriesMode={definition.index_mode === 'time_series'}
              stats={data.stats?.ds.stats}
              statsError={data.error}
            />
          }
          isHighlighted={successfulLifecycleFlyout.isOpen}
        >
          {definition.privileges.lifecycle ? (
            <LifecycleSummary
              definition={definition}
              stats={data.stats?.ds.stats}
              isMetricsStream={definition.index_mode === 'time_series'}
              refreshDefinition={refreshDefinition}
              onEditSuccessfulLifecycle={successfulLifecycleFlyout.openFlyout}
              onAddDeletePhase={openEditSuccessfulDeletePhaseFlyout}
              isExternalFlyoutOpen={isAnySuccessfulFlyoutOpen}
              isDataPhaseFlyoutOpen={isEditDataPhasesFlyoutOpen}
              onDataPhaseFlyoutOpenChange={setIsEditDataPhasesFlyoutOpen}
              previewHeader={previewHeader}
            />
          ) : null}
        </SectionPanel>

        {/* Ingestion Section */}
        <SectionPanel
          topCard={
            <IngestionCard
              period="daily"
              hasMonitorPrivileges={definition.privileges?.monitor}
              stats={data.stats?.ds.stats}
              statsError={data.error}
            />
          }
          bottomCard={
            <IngestionCard
              period="monthly"
              hasMonitorPrivileges={definition.privileges?.monitor}
              stats={data.stats?.ds.stats}
              statsError={data.error}
            />
          }
        >
          <IngestionRate
            definition={definition}
            isLoadingStats={data.isLoading}
            stats={data.stats?.ds.stats}
            timeState={timeState}
            statsError={data.error}
            aggregations={data.stats?.ds.aggregations}
          />
        </SectionPanel>
      </EuiFlexGroup>

      {successfulLifecycleFlyout.flyout}

      {isEditSuccessfulDeletePhaseFlyoutOpen ? (
        <EditDeletePhaseFlyout
          initialValue={successfulDeletePhaseInitialValue}
          onChange={setDeletePhasePreview}
          onSave={onSaveSuccessfulDeletePhase}
          onClose={closeEditSuccessfulDeletePhaseFlyout}
          isSaving={updateInProgress}
          data-test-subj="streamsEditSuccessfulDeletePhaseFlyout"
        />
      ) : null}

      {successfulDeletePhaseOverrideModal}
    </>
  );
};

export const StreamDetailGeneralData = ({
  definition,
  refreshDefinition,
  data,
  isExternalFlyoutOpen,
  onFlyoutOpenChange,
}: {
  definition: Streams.ingest.all.GetResponse;
  refreshDefinition: () => void;
  data: ReturnType<typeof useDataStreamStats>;
  isExternalFlyoutOpen?: boolean;
  onFlyoutOpenChange?: (isOpen: boolean) => void;
}) => {
  return (
    <LifecycleAfterSaveProvider>
      <LifecyclePreviewProvider>
        <StreamDetailGeneralDataInner
          definition={definition}
          refreshDefinition={refreshDefinition}
          data={data}
          isExternalFlyoutOpen={isExternalFlyoutOpen}
          onFlyoutOpenChange={onFlyoutOpenChange}
        />
      </LifecyclePreviewProvider>
    </LifecycleAfterSaveProvider>
  );
};
