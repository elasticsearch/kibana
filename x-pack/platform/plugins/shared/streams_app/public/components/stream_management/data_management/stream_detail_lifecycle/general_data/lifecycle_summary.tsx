/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { Streams, IngestStreamLifecycle, IngestStreamLifecycleILM } from '@kbn/streams-schema';
import {
  Streams as StreamsSchema,
  effectiveToIngestLifecycle,
  isDslLifecycle,
  isIlmLifecycle,
  isInheritLifecycle,
  isRoot,
} from '@kbn/streams-schema';
import type { PhaseName } from '@kbn/streams-schema';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonIcon,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import type { DataStreamStats } from '../hooks/use_data_stream_stats';
import { DataLifecycleSummary } from '../common/data_lifecycle/data_lifecycle_summary';
import { useUpdateStreamLifecycle } from '../hooks/use_update_stream_lifecycle';
import { useIlmLifecycleSummary } from '../hooks/use_ilm_lifecycle_summary';
import { useDslLifecycleSummary } from '../hooks/use_dsl_lifecycle_summary';
import { MAX_DOWNSAMPLE_STEPS } from '../data_phases/edit_dsl_steps_flyout/form';
import { useLifecyclePreview } from '../common/hooks/lifecycle_preview';
import { useEditFlyoutPreviewSync } from '../common/hooks/use_edit_flyout_preview_sync';
import { useOverrideSettingsConfirmation } from '../common/hooks/use_override_settings_confirmation';
import { useKibana } from '../../../../../hooks/use_kibana';
import type {
  IlmPhaseSelectOption,
  IlmPhaseSelectRenderButtonProps,
} from '../data_phases/ilm_phase_select/ilm_phase_select';
import { IlmPhaseSelect } from '../data_phases/ilm_phase_select/ilm_phase_select';

const addPhaseButtonLabel = i18n.translate(
  'xpack.streams.dataLifecycleSummary.addPhaseButtonLabel',
  {
    defaultMessage: 'Add data phase',
  }
);

const allPhasesInUseTooltip = i18n.translate(
  'xpack.streams.dataLifecycleSummary.allPhasesInUseTooltip',
  { defaultMessage: 'All data phases are in use' }
);

const addPhaseAndDownsamplingButtonLabel = i18n.translate(
  'xpack.streams.dataLifecycleSummary.addPhaseAndDownsamplingButtonLabel',
  {
    defaultMessage: 'Add data phase and downsampling',
  }
);

const addDownsampleStepButtonLabel = i18n.translate(
  'xpack.streams.dataLifecycleSummary.addDownsampleStepButtonLabel',
  {
    defaultMessage: 'Add downsample step',
  }
);

const maxDownsampleStepsTooltip = i18n.translate(
  'xpack.streams.dataLifecycleSummary.maxDownsampleStepsTooltip',
  {
    defaultMessage: 'Maximum of {max} downsampling steps',
    values: { max: MAX_DOWNSAMPLE_STEPS },
  }
);

const deletePhaseAlreadyInUseTooltip = i18n.translate(
  'xpack.streams.dataLifecycleSummary.deletePhaseAlreadyInUseTooltip',
  { defaultMessage: 'Delete phase is already in use' }
);

const HeaderActionsSeparator = () => {
  const { euiTheme } = useEuiTheme();

  return (
    <span
      aria-hidden="true"
      css={css({
        display: 'block',
        width: euiTheme.border.width.thin,
        height: euiTheme.size.l,
        backgroundColor: euiTheme.border.color,
        marginBlock: 'auto',
      })}
    />
  );
};

const renderAddPhaseButton = (label: string) => (buttonProps: IlmPhaseSelectRenderButtonProps) => {
  const button = (
    <EuiButton {...buttonProps} color="text" size="s" iconType="chevronSingleDown" iconSide="right">
      {label}
    </EuiButton>
  );

  if (!buttonProps.disabled) return button;

  return (
    <EuiToolTip position="top" content={allPhasesInUseTooltip}>
      {button}
    </EuiToolTip>
  );
};

interface LifecycleSummaryProps {
  definition: Streams.ingest.all.GetResponse;
  isMetricsStream: boolean;
  stats?: DataStreamStats;
  refreshDefinition?: () => void;
  onEditSuccessfulLifecycle?: () => void;
  onAddDeletePhase?: () => void;
  isExternalFlyoutOpen?: boolean;
  isDataPhaseFlyoutOpen?: boolean;
  onDataPhaseFlyoutOpenChange?: (isOpen: boolean) => void;
  previewHeader?: {
    inheritLifecycle: boolean;
    method: 'dlm' | 'ilm';
    ilmPolicyName?: string;
    canShowInheritBadge: boolean;
  };
}

interface InternalLifecycleSummaryProps extends LifecycleSummaryProps {
  editLifecycleMethodButton?: React.ReactNode;
}

const dataStreamLifecycleTitle = i18n.translate('xpack.streams.dataLifecycleSummary.title.dlm', {
  defaultMessage: 'Data stream lifecycle',
});

const getIlmTitle = (policyName: string) =>
  i18n.translate('xpack.streams.dataLifecycleSummary.title.ilm', {
    defaultMessage: 'ILM: {policyName}',
    values: { policyName },
  });

const inheritedBadgeLabel = i18n.translate('xpack.streams.dataLifecycleSummary.inheritedBadge', {
  defaultMessage: 'Inherited',
});

const getPreviewTitle = (
  savedTitle: string,
  previewHeader?: LifecycleSummaryProps['previewHeader']
) => {
  if (!previewHeader) return undefined;
  if (previewHeader.method === 'ilm' && previewHeader.ilmPolicyName) {
    return getIlmTitle(previewHeader.ilmPolicyName);
  }
  return dataStreamLifecycleTitle;
};

const getSummaryTitleAndBadge = ({
  savedTitle,
  shouldShowInheritedBadge,
  previewHeader,
  isPreviewActive,
  isExternalFlyoutOpen,
}: {
  savedTitle: string;
  shouldShowInheritedBadge: boolean;
  previewHeader?: LifecycleSummaryProps['previewHeader'];
  isPreviewActive: boolean;
  isExternalFlyoutOpen: boolean;
}): { title: string; titleBadge?: React.ReactNode } => {
  const previewTitle = getPreviewTitle(savedTitle, previewHeader);
  const title = isPreviewActive && isExternalFlyoutOpen && previewTitle ? previewTitle : savedTitle;

  const savedBadge = shouldShowInheritedBadge ? (
    <EuiBadge>{inheritedBadgeLabel}</EuiBadge>
  ) : undefined;
  const previewBadge =
    previewHeader && previewHeader.canShowInheritBadge && previewHeader.inheritLifecycle ? (
      <EuiBadge>{inheritedBadgeLabel}</EuiBadge>
    ) : undefined;
  const titleBadge = isPreviewActive && isExternalFlyoutOpen ? previewBadge : savedBadge;

  return { title, titleBadge };
};

const getEditLifecycleMethodButton = ({
  onEditSuccessfulLifecycle,
  canManageLifecycle,
  isDisabled,
}: {
  onEditSuccessfulLifecycle?: () => void;
  canManageLifecycle: boolean;
  isDisabled: boolean;
}) => {
  if (!onEditSuccessfulLifecycle || !canManageLifecycle) return null;
  const tooltipLabel = i18n.translate(
    'xpack.streams.dataLifecycleSummary.editLifecycleMethodAriaLabel',
    {
      defaultMessage: 'Edit lifecycle method',
    }
  );
  return (
    <EuiToolTip content={tooltipLabel} disableScreenReaderOutput>
      <EuiButtonIcon
        iconType="controlsHorizontal"
        size="s"
        display="base"
        color="text"
        aria-label={tooltipLabel}
        data-test-subj="dataLifecycleSummaryEditLifecycleMethod"
        onClick={onEditSuccessfulLifecycle}
        disabled={isDisabled}
      />
    </EuiToolTip>
  );
};

const composeHeaderActions = (...items: Array<React.ReactNode | undefined | null>) => {
  const filtered = items.filter(Boolean);
  if (filtered.length === 0) return undefined;

  return (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      {filtered.map((item, index) => (
        <EuiFlexItem key={index} grow={false}>
          {item}
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};

const shouldShowLifecycleInheritedBadge = (definition: Streams.ingest.all.GetResponse): boolean => {
  const isClassicStream = StreamsSchema.ClassicStream.GetResponse.is(definition);
  const isWiredStream = StreamsSchema.WiredStream.GetResponse.is(definition);
  const isInheritingFromIndexTemplate =
    isClassicStream && isInheritLifecycle(definition.stream.ingest.lifecycle);
  const isInheritingFromParent =
    isWiredStream &&
    !isRoot(definition.stream.name) &&
    isInheritLifecycle(definition.stream.ingest.lifecycle);
  return isInheritingFromIndexTemplate || isInheritingFromParent;
};

const IlmLifecycleSummary = ({
  definition,
  isMetricsStream,
  stats,
  refreshDefinition,
  isExternalFlyoutOpen = false,
  onDataPhaseFlyoutOpenChange,
  previewHeader,
  editLifecycleMethodButton,
}: InternalLifecycleSummaryProps) => {
  const {
    isActive: isPreviewActive,
    timelineDownsampleSteps: previewTimelineDownsampleSteps,
    timelinePhases: previewTimelinePhases,
  } = useLifecyclePreview();
  const shouldShowInheritedBadge = shouldShowLifecycleInheritedBadge(definition);

  const { updateStreamLifecycle } = useUpdateStreamLifecycle(definition);
  const ilmSummary = useIlmLifecycleSummary({
    definition,
    stats,
    refreshDefinition,
    updateStreamLifecycle,
    isMetricsStream,
  });

  const isEditLifecycleFlyoutOpen = ilmSummary.isEditLifecycleFlyoutOpen;
  const invalidPhases = ilmSummary.flyoutInvalidPhases;

  useEditFlyoutPreviewSync({
    isFlyoutOpen: isEditLifecycleFlyoutOpen,
    isExternalFlyoutOpen,
    phases: ilmSummary.phases,
    isMetricsStream,
    hasUnsavedChangesInFlyout: ilmSummary.hasUnsavedEditLifecycleFlyoutChanges,
    onDataPhaseFlyoutOpenChange,
  });

  const headerActions =
    definition.privileges.lifecycle &&
    ilmSummary.ilmSelectedPhasesForAdd &&
    ilmSummary.onAddIlmPhase ? (
      <IlmPhaseSelect
        selectedPhases={ilmSummary.ilmSelectedPhasesForAdd}
        excludedPhases={ilmSummary.ilmExcludedPhasesForAdd}
        onSelect={(phase: IlmPhaseSelectOption) => ilmSummary.onAddIlmPhase?.(phase)}
        disabled={isExternalFlyoutOpen}
        data-test-subj="dataLifecycleSummaryAddPhase"
        anchorPosition="downRight"
        renderButton={renderAddPhaseButton(
          isMetricsStream ? addPhaseAndDownsamplingButtonLabel : addPhaseButtonLabel
        )}
      />
    ) : undefined;

  const headerActionsWithEditButton = composeHeaderActions(
    editLifecycleMethodButton,
    editLifecycleMethodButton && headerActions ? <HeaderActionsSeparator /> : undefined,
    headerActions
  );

  const { title, titleBadge } = getSummaryTitleAndBadge({
    savedTitle: isIlmLifecycle(definition.effective_lifecycle)
      ? getIlmTitle(definition.effective_lifecycle.ilm.policy)
      : dataStreamLifecycleTitle,
    shouldShowInheritedBadge,
    previewHeader,
    isPreviewActive,
    isExternalFlyoutOpen,
  });

  return (
    <>
      {ilmSummary.policyMissing && (
        <>
          <EuiCallOut
            announceOnMount
            title={i18n.translate('xpack.streams.lifecycleSummary.policyMissingTitle', {
              defaultMessage: 'ILM policy not found',
            })}
            color="warning"
            iconType="warning"
            data-test-subj="lifecycleSummary-policyMissingCallout"
          >
            {i18n.translate('xpack.streams.lifecycleSummary.policyMissingDescription', {
              defaultMessage:
                'The ILM policy "{policyName}" referenced by this data stream does not exist. Assign a valid ILM policy to restore lifecycle management.',
              values: {
                policyName: (definition.effective_lifecycle as IngestStreamLifecycleILM).ilm.policy,
              },
            })}
          </EuiCallOut>
          <EuiSpacer size="s" />
        </>
      )}
      {!ilmSummary.policyMissing && (
        <DataLifecycleSummary
          model={{
            phases: (isPreviewActive && previewTimelinePhases) || ilmSummary.phases,
            loading: ilmSummary.loading,
            downsampleSteps: previewTimelineDownsampleSteps ?? undefined,
          }}
          title={title}
          titleBadge={titleBadge}
          showDownsampling={isMetricsStream}
          capabilities={{
            canManageLifecycle: definition.privileges.lifecycle && !isExternalFlyoutOpen,
          }}
          headerActions={headerActionsWithEditButton}
          phaseActions={{
            onRemovePhase: ilmSummary.onRemovePhase,
            onEditPhase: (phaseName) => ilmSummary.onEditPhase?.(phaseName as PhaseName),
            showPhaseActions: true,
          }}
          downsamplingActions={{
            onRemoveDownsampleStep: ilmSummary.onRemoveDownsampleStep,
            onEditDownsampleStep: (stepNumber, phaseName) =>
              ilmSummary.onEditDownsampleStep?.(stepNumber, phaseName as PhaseName | undefined),
          }}
          uiState={{
            editedPhaseName: ilmSummary.editingPhase,
            isEditLifecycleFlyoutOpen,
            invalidPhases,
          }}
        />
      )}

      {ilmSummary.modals}
    </>
  );
};

const NonIlmLifecycleSummary = ({
  definition,
  isMetricsStream,
  stats,
  refreshDefinition,
  onAddDeletePhase,
  isExternalFlyoutOpen = false,
  isDataPhaseFlyoutOpen = false,
  onDataPhaseFlyoutOpenChange,
  previewHeader,
  editLifecycleMethodButton,
}: InternalLifecycleSummaryProps) => {
  const {
    core: { notifications },
  } = useKibana();
  const {
    isActive: isPreviewActive,
    isDslDownsampleFlyoutOpen,
    timelineDownsampleSteps: previewTimelineDownsampleSteps,
    timelinePhases: previewTimelinePhases,
  } = useLifecyclePreview();
  const shouldShowInheritedBadge = shouldShowLifecycleInheritedBadge(definition);

  const isDsl = isDslLifecycle(definition.effective_lifecycle);
  const { updateStreamLifecycle } = useUpdateStreamLifecycle(definition);
  const { confirmOverride, modal: overrideModal } = useOverrideSettingsConfirmation({
    definition,
  });
  const dslSummary = useDslLifecycleSummary({
    definition,
    stats,
    refreshDefinition,
    updateStreamLifecycle,
  });

  useEditFlyoutPreviewSync({
    isFlyoutOpen: dslSummary.isEditLifecycleFlyoutOpen,
    isExternalFlyoutOpen,
    phases: dslSummary.phases,
    downsampleSteps: dslSummary.downsampleSteps,
    isMetricsStream,
    onDataPhaseFlyoutOpenChange,
    includeDownsampleStepsInTimeline: isDsl,
    countDownsampleFromPhases: false,
  });

  const currentDslStepsCount = dslSummary.downsampleSteps?.length ?? 0;
  const isAddDownsampleStepDisabled = currentDslStepsCount >= MAX_DOWNSAMPLE_STEPS;
  const invalidStepIndices = dslSummary.flyoutInvalidStepIndices;
  const hasDeletePhase = dslSummary.phases.some((p) => p.isDelete);
  const isDslDownsampleFlyoutBlocking =
    isDslDownsampleFlyoutOpen || dslSummary.isEditLifecycleFlyoutOpen || isDataPhaseFlyoutOpen;
  const isAddDeletePhaseDisabled = isExternalFlyoutOpen || isDslDownsampleFlyoutBlocking;
  const isAddDeletePhaseAlreadyInUse = hasDeletePhase;
  const isAddDeletePhaseButtonDisabled = isAddDeletePhaseDisabled || isAddDeletePhaseAlreadyInUse;

  const addDownsampleStepButton = (
    <EuiButton
      color="text"
      size="s"
      data-test-subj="dataLifecycleSummaryAddDownsampleStep"
      onClick={() => dslSummary.onAddDownsampleStep?.()}
      disabled={isAddDownsampleStepDisabled || isExternalFlyoutOpen}
    >
      {addDownsampleStepButtonLabel}
    </EuiButton>
  );

  const addDeletePhaseButtonLabel = i18n.translate(
    'xpack.streams.dataLifecycleSummary.addDeletePhaseButtonLabel',
    { defaultMessage: 'Add delete phase' }
  );

  const addDeletePhaseButtonIsDisabled = isAddDeletePhaseAlreadyInUse
    ? true
    : isAddDeletePhaseButtonDisabled;

  const addDeletePhaseButtonElement =
    onAddDeletePhase && definition.privileges.lifecycle ? (
      <EuiButton
        color="text"
        size="s"
        data-test-subj="dataLifecycleSummaryAddDeletePhase"
        onClick={onAddDeletePhase}
        isDisabled={addDeletePhaseButtonIsDisabled}
      >
        {addDeletePhaseButtonLabel}
      </EuiButton>
    ) : null;

  const addDeletePhaseButton =
    addDeletePhaseButtonElement && isAddDeletePhaseAlreadyInUse && !isAddDeletePhaseDisabled ? (
      <EuiToolTip position="top" content={deletePhaseAlreadyInUseTooltip}>
        {addDeletePhaseButtonElement}
      </EuiToolTip>
    ) : (
      addDeletePhaseButtonElement
    );

  const dslHeaderActions =
    definition.privileges.lifecycle &&
    isDsl &&
    isMetricsStream &&
    dslSummary.onAddDownsampleStep ? (
      isAddDownsampleStepDisabled ? (
        <EuiToolTip position="top" content={maxDownsampleStepsTooltip}>
          {addDownsampleStepButton}
        </EuiToolTip>
      ) : (
        addDownsampleStepButton
      )
    ) : undefined;

  const headerActionsWithEditButton = composeHeaderActions(
    editLifecycleMethodButton,
    editLifecycleMethodButton && (addDeletePhaseButton || dslHeaderActions) ? (
      <HeaderActionsSeparator />
    ) : undefined,
    addDeletePhaseButton,
    dslHeaderActions
  );

  const { title, titleBadge } = getSummaryTitleAndBadge({
    savedTitle: dataStreamLifecycleTitle,
    shouldShowInheritedBadge,
    previewHeader,
    isPreviewActive,
    isExternalFlyoutOpen,
  });

  return (
    <>
      <DataLifecycleSummary
        model={{
          phases: (isPreviewActive && previewTimelinePhases) || dslSummary.phases,
          loading: false,
          downsampleSteps: isPreviewActive
            ? previewTimelineDownsampleSteps ?? undefined
            : isDsl
            ? dslSummary.downsampleSteps
            : undefined,
        }}
        title={title}
        titleBadge={titleBadge}
        showDownsampling={isMetricsStream}
        downsamplingActions={{
          onRemoveDownsampleStep: dslSummary.onRemoveDownsampleStep,
          onEditDownsampleStep: dslSummary.onEditDownsampleStep,
        }}
        capabilities={{
          canManageLifecycle: definition.privileges.lifecycle && !isExternalFlyoutOpen,
        }}
        headerActions={headerActionsWithEditButton}
        phaseActions={
          definition.privileges.lifecycle && hasDeletePhase
            ? {
                showPhaseActions: true,
                onEditPhase: (phaseName) => {
                  if (phaseName === 'delete' && onAddDeletePhase && !isAddDeletePhaseDisabled) {
                    onAddDeletePhase();
                  }
                },
                onRemovePhase: (phaseName) => {
                  if (phaseName !== 'delete' || isExternalFlyoutOpen) {
                    return;
                  }

                  if (!isDslLifecycle(definition.effective_lifecycle)) {
                    return;
                  }

                  const baseline = effectiveToIngestLifecycle(definition.effective_lifecycle);
                  if (!('dsl' in baseline)) return;

                  const { data_retention: _removed, ...rest } = baseline.dsl;
                  const nextLifecycle: IngestStreamLifecycle = { dsl: { ...rest } };

                  const performRemove = async () => {
                    try {
                      await updateStreamLifecycle(nextLifecycle);
                      notifications.toasts.addSuccess({
                        title: i18n.translate(
                          'xpack.streams.dataLifecycleSummary.removeDeletePhaseSuccess',
                          { defaultMessage: 'Delete phase removed' }
                        ),
                      });
                      await Promise.resolve(refreshDefinition?.());
                    } catch (error) {
                      notifications.toasts.addError(error as Error, {
                        title: i18n.translate(
                          'xpack.streams.dataLifecycleSummary.removeDeletePhaseError',
                          { defaultMessage: 'Failed to remove delete phase' }
                        ),
                      });
                    }
                  };

                  confirmOverride(() => performRemove());
                },
                shouldShowEditPhaseAction: (phaseName) => phaseName === 'delete',
                shouldShowRemovePhaseAction: (phaseName) => phaseName === 'delete',
              }
            : undefined
        }
        uiState={{
          editedPhaseName: undefined,
          editedDownsampleStepIndex: dslSummary.isEditLifecycleFlyoutOpen
            ? dslSummary.selectedStepIndex
            : undefined,
          isEditLifecycleFlyoutOpen: dslSummary.isEditLifecycleFlyoutOpen,
          invalidStepIndices,
        }}
      />

      {dslSummary.modals}
      {overrideModal}
    </>
  );
};

export const LifecycleSummary = (props: LifecycleSummaryProps) => {
  const { isServerless } = useKibana();
  const isIlm = isIlmLifecycle(props.definition.effective_lifecycle);

  const isServerlessWiredRootStream =
    isServerless &&
    StreamsSchema.WiredStream.GetResponse.is(props.definition) &&
    isRoot(props.definition.stream.name);

  const editLifecycleMethodButton = isServerlessWiredRootStream
    ? null
    : getEditLifecycleMethodButton({
        onEditSuccessfulLifecycle: props.onEditSuccessfulLifecycle,
        canManageLifecycle: Boolean(props.definition.privileges.lifecycle),
        isDisabled: Boolean(props.isExternalFlyoutOpen) || Boolean(props.isDataPhaseFlyoutOpen),
      });

  return isIlm ? (
    <IlmLifecycleSummary {...props} editLifecycleMethodButton={editLifecycleMethodButton} />
  ) : (
    <NonIlmLifecycleSummary {...props} editLifecycleMethodButton={editLifecycleMethodButton} />
  );
};
