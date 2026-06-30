/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiBadge,
  EuiButton,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { useKibana } from '../../../../../hooks/use_kibana';
import type { EnhancedFailureStoreStats } from '../hooks/use_data_stream_stats';
import type { useFailureStoreConfig } from '../hooks/use_failure_store_config';
import { formatBytes } from '../helpers/format_bytes';
import { useIlmPhasesColorAndDescription } from '../hooks/use_ilm_phases_color_and_description';
import { HeaderActionsSeparator } from '../common/header_actions_separator';
import { DataLifecycleSummary } from '../common/data_lifecycle/data_lifecycle_summary';
import { useLifecyclePreview } from '../common/hooks/lifecycle_preview';
import {
  buildLifecyclePhases,
  type LifecyclePhase,
} from '../common/data_lifecycle/lifecycle_types';

interface FailureStoreSummaryProps {
  stats?: EnhancedFailureStoreStats;
  failureStoreConfig: ReturnType<typeof useFailureStoreConfig>;
  canManageLifecycle: boolean;
  onEditFailedLifecycle?: () => void;
  onAddDeletePhase?: () => void;
  onEditDeletePhase?: () => void;
  onRemoveDeletePhase?: () => void;
  isExternalFlyoutOpen?: boolean;
  isDeletePhaseFlyoutOpen?: boolean;
  previewInheritLifecycle?: boolean;
}

const deletePhaseAlreadyInUseTooltip = i18n.translate(
  'xpack.streams.failureStoreSummary.deletePhaseAlreadyInUseTooltip',
  { defaultMessage: 'Delete phase is already in use' }
);

export const FailureStoreSummary = ({
  stats,
  failureStoreConfig,
  canManageLifecycle,
  onEditFailedLifecycle,
  onAddDeletePhase,
  onEditDeletePhase,
  onRemoveDeletePhase,
  isExternalFlyoutOpen = false,
  isDeletePhaseFlyoutOpen = false,
  previewInheritLifecycle,
}: FailureStoreSummaryProps) => {
  const { isServerless } = useKibana();
  const { euiTheme } = useEuiTheme();
  const { ilmPhases } = useIlmPhasesColorAndDescription();
  const { isActive: isPreviewActive, retentionPeriod: previewRetentionPeriod } =
    useLifecyclePreview();

  const shouldShowInheritedBadgeFromConfig =
    failureStoreConfig.inheritOptions.canShowInherit &&
    failureStoreConfig.inheritOptions.isCurrentlyInherited;

  const shouldShowInheritedBadgeFromPreview =
    failureStoreConfig.inheritOptions.canShowInherit && previewInheritLifecycle === true;

  const shouldShowInheritedBadge =
    isExternalFlyoutOpen && previewInheritLifecycle !== undefined
      ? shouldShowInheritedBadgeFromPreview
      : shouldShowInheritedBadgeFromConfig;

  const storageSize = stats?.size ? formatBytes(stats.size) : undefined;

  const retentionPeriodFromConfig = failureStoreConfig.retentionDisabled
    ? undefined
    : failureStoreConfig.customRetentionPeriod ?? failureStoreConfig.defaultRetentionPeriod;

  const retentionPeriod =
    isPreviewActive && isExternalFlyoutOpen
      ? previewRetentionPeriod ?? undefined
      : retentionPeriodFromConfig;
  const hasDeletePhase = Boolean(retentionPeriod);

  // Removing the delete phase disables the failure store lifecycle (infinite
  // retention), which is not supported in Serverless. Hide the action there.
  const canRemoveDeletePhase = Boolean(onRemoveDeletePhase) && !isServerless;

  const phases: LifecyclePhase[] = buildLifecyclePhases({
    label: isServerless
      ? i18n.translate('xpack.streams.streamDetailLifecycle.failedIngest', {
          defaultMessage: 'Failed ingest',
        })
      : i18n.translate('xpack.streams.streamDetailLifecycle.hot', {
          defaultMessage: 'Hot',
        }),
    color: isServerless ? euiTheme.colors.severity.danger : ilmPhases.hot.color,
    description: isServerless ? '' : ilmPhases.hot.description,
    size: storageSize,
    retentionPeriod,
    sizeInBytes: stats?.size,
    docsCount: stats?.count,
    deletePhaseDescription: ilmPhases.delete.description,
    deletePhaseColor: ilmPhases.delete.color,
  });

  const editFailedLifecycleLabel = i18n.translate(
    'xpack.streams.failureStoreSummary.editFailedLifecycleAriaLabel',
    {
      defaultMessage: 'Edit failed data lifecycle',
    }
  );

  const shouldShowHeaderSeparator = Boolean(onEditFailedLifecycle) && Boolean(onAddDeletePhase);
  const isAddDeletePhaseButtonDisabled =
    hasDeletePhase || !canManageLifecycle || isExternalFlyoutOpen;
  const addDeletePhaseButtonLabel = i18n.translate(
    'xpack.streams.failureStoreSummary.addDeletePhaseLabel',
    { defaultMessage: 'Add delete phase' }
  );
  const addDeletePhaseButtonElement = onAddDeletePhase ? (
    <EuiButton
      color="text"
      size="s"
      data-test-subj="failureStoreSummaryAddDeletePhase"
      onClick={onAddDeletePhase}
      disabled={isAddDeletePhaseButtonDisabled}
    >
      {addDeletePhaseButtonLabel}
    </EuiButton>
  ) : null;

  const headerActions = (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      {onEditFailedLifecycle ? (
        <EuiFlexItem grow={false}>
          <EuiToolTip content={editFailedLifecycleLabel} disableScreenReaderOutput>
            <EuiButtonIcon
              iconType="controlsHorizontal"
              size="s"
              color="text"
              display="base"
              aria-label={editFailedLifecycleLabel}
              data-test-subj="failureStoreSummaryEditFailedLifecycle"
              onClick={onEditFailedLifecycle}
              isDisabled={!canManageLifecycle}
              disabled={isExternalFlyoutOpen}
            />
          </EuiToolTip>
        </EuiFlexItem>
      ) : null}

      {shouldShowHeaderSeparator ? (
        <EuiFlexItem grow={false}>
          <HeaderActionsSeparator />
        </EuiFlexItem>
      ) : null}

      {onAddDeletePhase ? (
        <EuiFlexItem grow={false}>
          {addDeletePhaseButtonElement && hasDeletePhase ? (
            <EuiToolTip position="top" content={deletePhaseAlreadyInUseTooltip}>
              {addDeletePhaseButtonElement}
            </EuiToolTip>
          ) : (
            addDeletePhaseButtonElement
          )}
        </EuiFlexItem>
      ) : null}
    </EuiFlexGroup>
  );

  return (
    <DataLifecycleSummary
      model={{ phases, testSubjPrefix: 'failureStore' }}
      capabilities={{ canManageLifecycle: canManageLifecycle && !isExternalFlyoutOpen }}
      title={i18n.translate('xpack.streams.dataLifecycleSummary.title.dlm', {
        defaultMessage: 'Data stream lifecycle',
      })}
      titleBadge={
        shouldShowInheritedBadge ? (
          <EuiBadge>
            {i18n.translate('xpack.streams.dataLifecycleSummary.inheritedBadge', {
              defaultMessage: 'Inherited',
            })}
          </EuiBadge>
        ) : undefined
      }
      showDownsampling={false}
      headerActions={headerActions}
      uiState={{
        editedPhaseName: isDeletePhaseFlyoutOpen ? 'delete' : undefined,
        isEditLifecycleFlyoutOpen: isDeletePhaseFlyoutOpen,
      }}
      phaseActions={
        onEditDeletePhase || canRemoveDeletePhase
          ? {
              onRemovePhase: canRemoveDeletePhase
                ? (phaseName) => {
                    if (phaseName === 'delete') {
                      onRemoveDeletePhase?.();
                    }
                  }
                : undefined,
              onEditPhase: onEditDeletePhase
                ? (phaseName) => {
                    if (phaseName === 'delete') {
                      onEditDeletePhase();
                    }
                  }
                : undefined,
              shouldShowEditPhaseAction: (phaseName) =>
                phaseName === 'delete' && Boolean(onEditDeletePhase),
              shouldShowRemovePhaseAction: (phaseName) =>
                phaseName === 'delete' && canRemoveDeletePhase,
              showPhaseActions: true,
            }
          : undefined
      }
    />
  );
};
