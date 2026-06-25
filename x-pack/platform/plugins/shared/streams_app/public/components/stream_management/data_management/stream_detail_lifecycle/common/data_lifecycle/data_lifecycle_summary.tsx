/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiFlexGroup,
  EuiPanel,
  EuiSkeletonRectangle,
  EuiSpacer,
  EuiText,
  EuiFlexItem,
} from '@elastic/eui';
import type { DownsampleStep } from '@kbn/streams-schema/src/models/ingest/lifecycle';
import type { PhaseName } from '@kbn/streams-schema';
import { DataLifecycleTimeline } from './data_lifecycle_timeline';
import {
  buildDslSegments,
  buildPhaseTimelineSegments,
  getGridTemplateColumns,
  getPhaseColumnSpans,
  buildDownsamplingSegments,
} from './data_lifecycle_segments';
import { LifecycleBar } from './lifecycle_bar';
import { DownsamplingBar } from './downsampling_bar';
import { type LifecyclePhase } from './lifecycle_types';

export interface DataLifecycleSummaryModel {
  phases: LifecyclePhase[];
  loading?: boolean;
  downsampleSteps?: DownsampleStep[];
  testSubjPrefix?: string;
}

export interface DataLifecycleSummaryCapabilities {
  canManageLifecycle: boolean;
}

export interface DataLifecycleSummaryPhaseActions {
  onPhaseClick?: (phase: LifecyclePhase, index: number) => void;
  onRemovePhase?: (phaseName: string) => void;
  onEditPhase?: (phaseName: string) => void;
  shouldShowEditPhaseAction?: (phaseName: string) => boolean;
  shouldShowRemovePhaseAction?: (phaseName: string) => boolean;
  showPhaseActions?: boolean;
}

export interface DataLifecycleSummaryDownsamplingActions {
  onRemoveDownsampleStep?: (stepNumber: number) => void;
  onEditDownsampleStep?: (stepNumber: number, phaseName?: string) => void;
}

export interface DataLifecycleSummaryUiState {
  editedPhaseName?: string;
  editedDownsampleStepIndex?: number;
  isEditLifecycleFlyoutOpen?: boolean;
  invalidPhases?: PhaseName[];
  invalidStepIndices?: number[];
}

interface DataLifecycleSummaryProps {
  model: DataLifecycleSummaryModel;
  showDownsampling: boolean;
  capabilities: DataLifecycleSummaryCapabilities;
  title: React.ReactNode;
  titleBadge?: React.ReactNode;
  headerActions?: React.ReactNode;
  phaseActions?: DataLifecycleSummaryPhaseActions;
  downsamplingActions?: DataLifecycleSummaryDownsamplingActions;
  uiState?: DataLifecycleSummaryUiState;
}

export const DataLifecycleSummary = ({
  model,
  showDownsampling,
  capabilities,
  title,
  titleBadge,
  headerActions,
  phaseActions,
  downsamplingActions,
  uiState,
}: DataLifecycleSummaryProps) => {
  const { phases, downsampleSteps, loading = false, testSubjPrefix } = model;
  const { canManageLifecycle } = capabilities;
  const {
    editedPhaseName,
    editedDownsampleStepIndex,
    isEditLifecycleFlyoutOpen = false,
    invalidPhases,
    invalidStepIndices,
  } = uiState ?? {};

  const showPhaseActions =
    phaseActions?.showPhaseActions ??
    Boolean(phaseActions?.onEditPhase || phaseActions?.onRemovePhase);

  const isRetentionInfinite = !phases.some((p) => p.isDelete);
  const showSkeleton = loading && phases.length === 0;

  const hasDslDownsampling = showDownsampling && Boolean(downsampleSteps?.length);
  const dslSegments =
    hasDslDownsampling && downsampleSteps ? buildDslSegments(phases, downsampleSteps) : null;
  const timelineSegments = dslSegments?.timelineSegments ?? buildPhaseTimelineSegments(phases);
  const downsamplingSegments = showDownsampling
    ? buildDownsamplingSegments(phases, dslSegments)
    : null;
  const gridTemplateColumns = getGridTemplateColumns(timelineSegments);
  const phaseColumnSpans = getPhaseColumnSpans(phases, timelineSegments);

  return (
    <EuiPanel
      hasShadow={false}
      hasBorder
      grow={false}
      paddingSize="s"
      css={{ height: '100%', borderTopLeftRadius: '0', borderBottomLeftRadius: '0' }}
    >
      <EuiFlexGroup direction="column" gutterSize="s" css={{ height: '100%' }}>
        <EuiPanel hasShadow={false} hasBorder={false} paddingSize="s" grow={false}>
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiText>
                <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <h5 data-test-subj="dataLifecycleSummary-title">{title}</h5>
                  </EuiFlexItem>
                  {titleBadge && <EuiFlexItem grow={false}>{titleBadge}</EuiFlexItem>}
                </EuiFlexGroup>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>{headerActions}</EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>

        <EuiPanel grow hasShadow={false} hasBorder={false} paddingSize="s">
          <EuiFlexGroup
            direction="column"
            gutterSize="none"
            justifyContent="center"
            css={{ height: '100%' }}
          >
            {showSkeleton ? (
              <EuiSkeletonRectangle
                width="100%"
                height={50}
                borderRadius="s"
                css={{ marginBottom: 35 }}
                data-test-subj="dataLifecycleSummary-skeleton"
              />
            ) : (
              <EuiFlexItem grow={false}>
                <LifecycleBar
                  phases={phases}
                  gridTemplateColumns={gridTemplateColumns}
                  phaseColumnSpans={phaseColumnSpans}
                  onPhaseClick={phaseActions?.onPhaseClick}
                  showPhaseActions={showPhaseActions}
                  onRemovePhase={phaseActions?.onRemovePhase}
                  onEditPhase={phaseActions?.onEditPhase}
                  shouldShowEditPhaseAction={phaseActions?.shouldShowEditPhaseAction}
                  shouldShowRemovePhaseAction={phaseActions?.shouldShowRemovePhaseAction}
                  editedPhaseName={editedPhaseName}
                  testSubjPrefix={testSubjPrefix}
                  canManageLifecycle={canManageLifecycle}
                  isEditLifecycleFlyoutOpen={isEditLifecycleFlyoutOpen}
                />
                {showDownsampling && downsamplingSegments && (
                  <DownsamplingBar
                    segments={downsamplingSegments}
                    gridTemplateColumns={gridTemplateColumns}
                    onRemoveStep={downsamplingActions?.onRemoveDownsampleStep}
                    onEditStep={downsamplingActions?.onEditDownsampleStep}
                    editedPhaseName={editedPhaseName}
                    editedDownsampleStepIndex={editedDownsampleStepIndex}
                    canManageLifecycle={canManageLifecycle}
                    isEditLifecycleFlyoutOpen={isEditLifecycleFlyoutOpen}
                  />
                )}
                <EuiSpacer size="xs" />
                <DataLifecycleTimeline
                  phases={phases}
                  isRetentionInfinite={isRetentionInfinite}
                  timelineSegments={timelineSegments}
                  gridTemplateColumns={gridTemplateColumns}
                  invalidPhases={invalidPhases}
                  invalidStepIndices={invalidStepIndices}
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiPanel>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
