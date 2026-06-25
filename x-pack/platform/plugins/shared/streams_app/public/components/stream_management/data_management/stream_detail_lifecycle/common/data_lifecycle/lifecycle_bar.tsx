/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGrid, EuiFlexItem, EuiPanel, EuiSpacer, EuiText, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { LifecyclePhase } from './lifecycle_types';
import { LifecyclePhase as LifecyclePhaseComponent } from './lifecycle_phase';

export interface LifecycleBarProps {
  phases: LifecyclePhase[];
  gridTemplateColumns: string;
  phaseColumnSpans: number[];
  onPhaseClick?: (phase: LifecyclePhase, index: number) => void;
  testSubjPrefix?: string;
  showPhaseActions?: boolean;
  onRemovePhase?: (phaseName: string) => void;
  onEditPhase?: (phaseName: string) => void;
  shouldShowEditPhaseAction?: (phaseName: string) => boolean;
  shouldShowRemovePhaseAction?: (phaseName: string) => boolean;
  editedPhaseName?: string;
  canManageLifecycle: boolean;
  isEditLifecycleFlyoutOpen?: boolean;
}

const renderLifecyclePhase = (
  index: number,
  phase: LifecyclePhase,
  onPhaseClick?: (phase: LifecyclePhase, index: number) => void,
  showPhaseActions?: boolean,
  onRemovePhase?: (phaseName: string) => void,
  onEditPhase?: (phaseName: string) => void,
  shouldShowEditPhaseAction?: (phaseName: string) => boolean,
  shouldShowRemovePhaseAction?: (phaseName: string) => boolean,
  editedPhaseName?: string,
  canManageLifecycle?: boolean,
  isEditLifecycleFlyoutOpen?: boolean,
  testSubjPrefix?: string
) => {
  const shouldShowEdit = shouldShowEditPhaseAction ? shouldShowEditPhaseAction(phase.label) : true;
  const shouldShowRemove = shouldShowRemovePhaseAction
    ? shouldShowRemovePhaseAction(phase.label)
    : true;
  const commonProps = {
    description: phase.description,
    isReadOnly: phase.isReadOnly,
    isRemoveDisabled: phase.isRemoveDisabled,
    removeDisabledReason: phase.removeDisabledReason,
    label: phase.label,
    onClick: () => {
      onPhaseClick?.(phase, index);
    },
    showActions: showPhaseActions,
    minAge: phase.min_age,
    testSubjPrefix,
    onRemovePhase: shouldShowRemove ? onRemovePhase : undefined,
    onEditPhase: shouldShowEdit ? onEditPhase : undefined,
    isBeingEdited: Boolean(editedPhaseName && editedPhaseName === phase.label),
    canManageLifecycle: canManageLifecycle ?? false,
    isEditLifecycleFlyoutOpen,
  };

  return phase.isDelete ? (
    <LifecyclePhaseComponent isDelete {...commonProps} />
  ) : (
    <LifecyclePhaseComponent
      {...commonProps}
      color={phase.color}
      docsCount={phase.docsCount}
      size={phase.size}
      sizeInBytes={phase.sizeInBytes}
      searchableSnapshot={phase.searchableSnapshot}
    />
  );
};

export const LifecycleBar: React.FC<LifecycleBarProps> = ({
  phases,
  gridTemplateColumns,
  phaseColumnSpans,
  onPhaseClick,
  testSubjPrefix,
  showPhaseActions,
  onRemovePhase,
  onEditPhase,
  shouldShowEditPhaseAction,
  shouldShowRemovePhaseAction,
  editedPhaseName,
  canManageLifecycle,
  isEditLifecycleFlyoutOpen,
}) => {
  const { euiTheme } = useEuiTheme();

  return (
    <>
      <EuiText size="xs" color="subdued">
        {i18n.translate('xpack.streams.dataLifecycleSummary.panelLabel', {
          defaultMessage: 'Data phases',
        })}
      </EuiText>
      <EuiSpacer size="xs" />
      <EuiPanel
        hasShadow={false}
        hasBorder={false}
        css={{
          backgroundColor: euiTheme.colors.backgroundBaseSubdued,
          borderRadius: '8px',
          padding: '4px 2px',
        }}
      >
        <EuiFlexGrid
          columns={1}
          gutterSize="none"
          responsive={false}
          css={{
            gridTemplateColumns,
            paddingInline: euiTheme.size.xxs,
            boxSizing: 'border-box',
          }}
        >
          {phases.map((phase, index) => (
            <EuiFlexItem
              key={phase.label ?? index}
              grow={phase.grow}
              css={{
                display: 'flex',
                flexBasis: 0,
                minWidth: 0,
                gridColumn: `span ${phaseColumnSpans[index]}`,
                paddingBlock: euiTheme.size.xxs,
                paddingInline: euiTheme.size.xxs,
                boxSizing: 'border-box',
                justifyContent: 'center',
              }}
            >
              {renderLifecyclePhase(
                index,
                phase,
                onPhaseClick,
                showPhaseActions,
                onRemovePhase,
                onEditPhase,
                shouldShowEditPhaseAction,
                shouldShowRemovePhaseAction,
                editedPhaseName,
                canManageLifecycle,
                isEditLifecycleFlyoutOpen,
                testSubjPrefix
              )}
            </EuiFlexItem>
          ))}
        </EuiFlexGrid>
      </EuiPanel>
    </>
  );
};
