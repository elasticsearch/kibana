/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useReducer } from 'react';
import {
  Streams,
  effectiveToIngestLifecycle,
  isDisabledLifecycle,
  isDslLifecycle,
  isInheritLifecycle,
  isRoot,
  type IngestStreamLifecycleDSL,
  type IngestStreamLifecycle,
} from '@kbn/streams-schema';
import { i18n } from '@kbn/i18n';
import { useEuiTheme } from '@elastic/eui';
import { isEqual } from 'lodash';
import { useKibana } from '../../../../../hooks/use_kibana';
import { useIlmPhasesColorAndDescription } from './use_ilm_phases_color_and_description';
import type { DataStreamStats } from './use_data_stream_stats';
import { formatBytes } from '../helpers/format_bytes';
import { useLifecyclePreview } from '../common/hooks/lifecycle_preview';
import { OverrideSettingsModal } from '../data_phases/override_settings_modal/override_settings_modal';
import { EditDslStepsFlyout } from '../data_phases/edit_dsl_steps_flyout/edit_dsl_steps_flyout';
import { MAX_DOWNSAMPLE_STEPS } from '../data_phases/edit_dsl_steps_flyout/form';
import type { LifecyclePhase } from '../common/data_lifecycle/lifecycle_types';
import { buildLifecyclePhases } from '../common/data_lifecycle/lifecycle_types';
import {
  dslLifecycleSummaryUiReducer,
  initialDslLifecycleSummaryUiState,
  type OverrideSettingsContext,
} from './use_dsl_lifecycle_summary_state';

interface UseDslLifecycleSummaryProps {
  definition: Streams.ingest.all.GetResponse;
  stats?: DataStreamStats;
  refreshDefinition?: () => void;
  updateStreamLifecycle: (lifecycle: IngestStreamLifecycle) => Promise<void>;
}

interface UseDslLifecycleSummaryResult {
  phases: LifecyclePhase[];
  downsampleSteps?: IngestStreamLifecycleDSL['dsl']['downsample'];
  onRemoveDownsampleStep?: (stepNumber: number) => void;
  onEditDownsampleStep?: (stepNumber: number) => void;
  onAddDownsampleStep?: () => void;
  selectedStepIndex?: number;
  isEditLifecycleFlyoutOpen: boolean;
  flyoutInvalidStepIndices: number[];
  modals: React.ReactNode;
}

export const useDslLifecycleSummary = ({
  definition,
  stats,
  refreshDefinition,
  updateStreamLifecycle,
}: UseDslLifecycleSummaryProps): UseDslLifecycleSummaryResult => {
  const {
    core: { notifications },
    isServerless,
  } = useKibana();

  const { euiTheme } = useEuiTheme();
  const { ilmPhases } = useIlmPhasesColorAndDescription();
  const { setIsDslDownsampleFlyoutOpen } = useLifecyclePreview();

  const [uiState, dispatchUi] = useReducer(
    dslLifecycleSummaryUiReducer,
    initialDslLifecycleSummaryUiState
  );

  const effectiveLifecycle = definition.effective_lifecycle;
  const isDsl = isDslLifecycle(effectiveLifecycle);
  const isDisabled = isDisabledLifecycle(effectiveLifecycle);

  const getPhases = (): LifecyclePhase[] => {
    if (!isDsl && !isDisabled) {
      return [];
    }

    const retentionPeriod = isDsl ? effectiveLifecycle.dsl.data_retention : undefined;
    const storageSize = stats?.sizeBytes ? formatBytes(stats.sizeBytes) : undefined;

    return buildLifecyclePhases({
      label: isServerless
        ? i18n.translate('xpack.streams.streamDetailLifecycle.successfulIngest', {
            defaultMessage: 'Successful ingest',
          })
        : i18n.translate('xpack.streams.streamDetailLifecycle.hot', {
            defaultMessage: 'Hot',
          }),
      color: isServerless ? euiTheme.colors.severity.success : ilmPhases.hot.color,
      size: storageSize,
      retentionPeriod,
      description: isServerless ? '' : ilmPhases.hot.description,
      sizeInBytes: stats?.sizeBytes,
      docsCount: stats?.totalDocs,
      deletePhaseDescription: ilmPhases.delete.description,
      deletePhaseColor: ilmPhases.delete.color,
    });
  };

  const closeOverrideSettingsModal = () => {
    dispatchUi({ type: 'closeOverrideModal' });
  };

  const removeDslDownsampleStep = async (stepNumber: number) => {
    if (!isDslLifecycle(definition.effective_lifecycle)) {
      return;
    }

    try {
      const ingestLifecycle = effectiveToIngestLifecycle(definition.effective_lifecycle);
      if (!('dsl' in ingestLifecycle)) {
        return;
      }

      const downsampleSteps = ingestLifecycle.dsl.downsample ?? [];
      const stepIndex = stepNumber - 1;
      if (stepIndex < 0 || stepIndex >= downsampleSteps.length) {
        return;
      }

      const updatedDownsample = downsampleSteps.filter((_step, index) => index !== stepIndex);

      const nextLifecycle: IngestStreamLifecycle = {
        dsl: {
          ...ingestLifecycle.dsl,
          downsample: updatedDownsample,
        },
      };

      await updateStreamLifecycle(nextLifecycle);

      notifications.toasts.addSuccess({
        title: i18n.translate('xpack.streams.lifecycleSummary.downsampleStepRemoved', {
          defaultMessage: 'Downsampling step removed',
        }),
      });

      await Promise.resolve(refreshDefinition?.());
      closeOverrideSettingsModal();
    } catch (error) {
      notifications.toasts.addError(error as Error, {
        title: i18n.translate('xpack.streams.lifecycleSummary.downsampleStepRemoveFailed', {
          defaultMessage: 'Failed to remove downsampling step',
        }),
      });
    }
  };

  const inheritsFromIndexTemplate = useCallback(() => {
    const ingestLifecycle = definition.stream.ingest?.lifecycle;
    const isLifecycleInherited = ingestLifecycle ? isInheritLifecycle(ingestLifecycle) : false;
    const isWiredStream = Streams.WiredStream.GetResponse.is(definition);
    const isRootStream = isRoot(definition.stream.name);
    return isLifecycleInherited && (!isWiredStream || isRootStream);
  }, [definition]);

  const handleRemoveDslDownsampleStep = (stepNumber: number) => {
    if (!isDslLifecycle(definition.effective_lifecycle)) {
      return;
    }

    if (inheritsFromIndexTemplate()) {
      dispatchUi({
        type: 'openOverrideModal',
        payload: { type: 'removeDownsampleStep', stepNumber },
      });
      return;
    }

    removeDslDownsampleStep(stepNumber);
  };

  const closeEditFlyout = useCallback(() => {
    setIsDslDownsampleFlyoutOpen(false);
    dispatchUi({ type: 'closeEditFlyout' });
  }, [setIsDslDownsampleFlyoutOpen]);

  const openEditFlyout = useCallback(
    ({ stepNumber }: { stepNumber?: number } = {}) => {
      if (!isDslLifecycle(definition.effective_lifecycle)) {
        return;
      }

      const nextSelectedIndex =
        stepNumber !== undefined && stepNumber >= 1 ? stepNumber - 1 : undefined;

      // If the flyout is already open, just navigate to the step tab.
      if (uiState.isEditDslStepsFlyoutOpen) {
        dispatchUi({ type: 'setSelectedStepIndex', payload: nextSelectedIndex });
        return;
      }

      dispatchUi({ type: 'setPendingEditFlyoutSave', payload: null });
      const ingestLifecycle = effectiveToIngestLifecycle(definition.effective_lifecycle);
      if (!('dsl' in ingestLifecycle)) {
        return;
      }

      setIsDslDownsampleFlyoutOpen(true);
      dispatchUi({
        type: 'openEditFlyout',
        payload: {
          initialSteps: ingestLifecycle as IngestStreamLifecycleDSL,
          selectedStepIndex: nextSelectedIndex,
        },
      });
    },
    [definition.effective_lifecycle, setIsDslDownsampleFlyoutOpen, uiState.isEditDslStepsFlyoutOpen]
  );

  const handleEditDslDownsampleStep = (stepNumber: number) => {
    if (!isDslLifecycle(definition.effective_lifecycle)) {
      return;
    }

    openEditFlyout({ stepNumber });
  };

  const downsampleSteps = isDsl
    ? uiState.isEditDslStepsFlyoutOpen
      ? uiState.previewSteps?.dsl.downsample ?? effectiveLifecycle.dsl.downsample
      : effectiveLifecycle.dsl.downsample
    : undefined;

  const handleAddDslDownsampleStep = useCallback(() => {
    if (!isDslLifecycle(definition.effective_lifecycle)) {
      return;
    }

    const currentStepsCount = downsampleSteps?.length ?? 0;
    if (currentStepsCount >= MAX_DOWNSAMPLE_STEPS) {
      return;
    }

    // This selects the next index, which the flyout interprets as "add a step".
    openEditFlyout({ stepNumber: currentStepsCount + 1 });
  }, [definition.effective_lifecycle, downsampleSteps?.length, openEditFlyout]);

  const handleConfirmOverrideSettings = () => {
    if (!uiState.overrideSettingsContext) {
      return;
    }

    const ctx: OverrideSettingsContext = uiState.overrideSettingsContext;
    const pending = uiState.pendingEditFlyoutSave;
    closeOverrideSettingsModal();

    if (ctx.type === 'removeDownsampleStep') {
      removeDslDownsampleStep(ctx.stepNumber);
      return;
    }

    if (pending) {
      saveFlyoutSteps(pending);
    }
  };

  const saveFlyoutSteps = async (next: IngestStreamLifecycleDSL) => {
    if (!isDslLifecycle(definition.effective_lifecycle)) {
      return;
    }

    try {
      dispatchUi({ type: 'setIsSavingEditFlyout', payload: true });
      await updateStreamLifecycle(next as IngestStreamLifecycle);

      notifications.toasts.addSuccess({
        title: i18n.translate('xpack.streams.lifecycleSummary.downsampleStepsUpdated', {
          defaultMessage: 'Applied changes to downsample steps',
        }),
      });

      await Promise.resolve(refreshDefinition?.());
      closeEditFlyout();
    } catch (error) {
      notifications.toasts.addError(error as Error, {
        title: i18n.translate('xpack.streams.lifecycleSummary.downsampleStepsUpdateFailed', {
          defaultMessage: 'Failed to update downsampling steps',
        }),
      });
    } finally {
      dispatchUi({ type: 'setIsSavingEditFlyout', payload: false });
    }
  };

  const handleFlyoutSave = async (next: IngestStreamLifecycleDSL) => {
    if (!isDslLifecycle(definition.effective_lifecycle)) {
      return;
    }

    if (inheritsFromIndexTemplate()) {
      dispatchUi({ type: 'setPendingEditFlyoutSave', payload: next });
      dispatchUi({ type: 'openOverrideModal', payload: { type: 'editDownsampleSteps' } });
      return;
    }

    saveFlyoutSteps(next);
  };

  const modals = isDsl ? (
    <>
      {uiState.overrideSettingsContext && (
        <OverrideSettingsModal
          onCancel={closeOverrideSettingsModal}
          onSave={handleConfirmOverrideSettings}
        />
      )}

      {uiState.isEditDslStepsFlyoutOpen && uiState.editFlyoutInitialSteps && (
        <EditDslStepsFlyout
          initialSteps={uiState.previewSteps ?? uiState.editFlyoutInitialSteps}
          selectedStepIndex={uiState.selectedStepIndex}
          setSelectedStepIndex={(index) =>
            dispatchUi({ type: 'setSelectedStepIndex', payload: index })
          }
          onChange={(next, meta) => {
            const currentPreview = uiState.previewSteps ?? uiState.editFlyoutInitialSteps;
            if (!isEqual(next, currentPreview)) {
              dispatchUi({ type: 'setPreviewSteps', payload: next });
            }
            dispatchUi({ type: 'setFlyoutInvalidStepIndices', payload: meta.invalidStepIndices });
          }}
          onSave={handleFlyoutSave}
          onClose={closeEditFlyout}
          isSaving={uiState.isSavingEditFlyout}
          data-test-subj="streamsEditDslStepsFlyoutFromSummary"
        />
      )}
    </>
  ) : null;

  return {
    phases: getPhases(),
    downsampleSteps,
    onRemoveDownsampleStep: isDsl ? handleRemoveDslDownsampleStep : undefined,
    onEditDownsampleStep: isDsl ? handleEditDslDownsampleStep : undefined,
    onAddDownsampleStep: isDsl ? handleAddDslDownsampleStep : undefined,
    selectedStepIndex: uiState.selectedStepIndex,
    isEditLifecycleFlyoutOpen: uiState.isEditDslStepsFlyoutOpen,
    flyoutInvalidStepIndices: uiState.flyoutInvalidStepIndices,
    modals,
  };
};
