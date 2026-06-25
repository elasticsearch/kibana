/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect } from 'react';
import type { DownsampleStep } from '@kbn/streams-schema/src/models/ingest/lifecycle';
import type { LifecyclePhase } from '../data_lifecycle/lifecycle_types';
import { useLifecyclePreview } from './lifecycle_preview';

export interface UseEditFlyoutPreviewSyncArgs {
  isFlyoutOpen: boolean;
  isExternalFlyoutOpen: boolean;
  phases: LifecyclePhase[];
  downsampleSteps?: DownsampleStep[] | null;
  isMetricsStream: boolean;
  hasUnsavedChangesInFlyout?: boolean;
  onDataPhaseFlyoutOpenChange?: (isOpen: boolean) => void;
  includeDownsampleStepsInTimeline?: boolean;
  countDownsampleFromPhases?: boolean;
}

export const useEditFlyoutPreviewSync = ({
  isFlyoutOpen,
  isExternalFlyoutOpen,
  phases,
  downsampleSteps = null,
  isMetricsStream,
  hasUnsavedChangesInFlyout,
  onDataPhaseFlyoutOpenChange,
  includeDownsampleStepsInTimeline = false,
  countDownsampleFromPhases = true,
}: UseEditFlyoutPreviewSyncArgs): void => {
  const {
    clearPreview,
    setDataPhasesCount,
    setDownsampleStepsCount,
    setHasUnsavedChanges,
    setIsActive,
    setRetentionPeriod,
    setTimelineModel,
  } = useLifecyclePreview();

  useEffect(() => {
    onDataPhaseFlyoutOpenChange?.(isFlyoutOpen);
    return () => {
      if (isFlyoutOpen) {
        onDataPhaseFlyoutOpenChange?.(false);
      }
    };
  }, [isFlyoutOpen, onDataPhaseFlyoutOpenChange]);

  useEffect(() => {
    if (!isFlyoutOpen) {
      if (!isExternalFlyoutOpen) {
        clearPreview();
      }
      return;
    }

    setIsActive(true);
    if (hasUnsavedChangesInFlyout !== undefined) {
      setHasUnsavedChanges(hasUnsavedChangesInFlyout);
    } else {
      setHasUnsavedChanges(false);
    }
  }, [
    clearPreview,
    hasUnsavedChangesInFlyout,
    isExternalFlyoutOpen,
    isFlyoutOpen,
    setHasUnsavedChanges,
    setIsActive,
  ]);

  useEffect(() => {
    if (!isFlyoutOpen) {
      return;
    }

    const retentionPeriod = phases.find((phase) => Boolean(phase.isDelete))?.min_age ?? null;

    setTimelineModel({
      phases,
      downsampleSteps: includeDownsampleStepsInTimeline ? downsampleSteps ?? null : null,
    });
    setRetentionPeriod(retentionPeriod);
    setDataPhasesCount(phases.length);
  }, [
    downsampleSteps,
    includeDownsampleStepsInTimeline,
    isFlyoutOpen,
    phases,
    setDataPhasesCount,
    setRetentionPeriod,
    setTimelineModel,
  ]);

  useEffect(() => {
    if (!isFlyoutOpen) {
      return;
    }

    if (!isMetricsStream) {
      setDownsampleStepsCount(null);
      return;
    }

    const downsampleCount = countDownsampleFromPhases
      ? phases.filter((phase) => Boolean(phase.downsample)).length
      : downsampleSteps?.length ?? 0;

    setDownsampleStepsCount(downsampleCount);
  }, [
    countDownsampleFromPhases,
    downsampleSteps,
    isFlyoutOpen,
    isMetricsStream,
    phases,
    setDownsampleStepsCount,
  ]);
};

/**
 * Normalized preview model produced by a flyout controller. `null` means "nothing
 * to push yet" (e.g. the preview is still resolving), `'clear'` resets the preview,
 * and `apply` pushes a fully-computed model into the shared store.
 */
export type EditFlyoutPreviewModel =
  | null
  | { action: 'clear'; hasUnsavedChanges?: boolean }
  | {
      action: 'apply';
      timelineModel?: {
        phases: LifecyclePhase[];
        downsampleSteps: DownsampleStep[] | null;
      };
      retentionPeriod: string | null;
      dataPhasesCount: number | null;
      downsampleStepsCount?: number | null;
      hasUnsavedChanges?: boolean;
    };

export interface UseEditFlyoutPreviewSyncFromModelArgs {
  isFlyoutOpen: boolean;
  isExternalFlyoutOpen: boolean;
  preview: EditFlyoutPreviewModel;
}

/**
 * Variant of {@link useEditFlyoutPreviewSync} for controllers that already compute
 * a rich preview model themselves (e.g. ILM/DLM or failure-store flyouts). It
 * centralizes the store-pushing and the close-vs-other-flyout clear semantics so
 * the three controllers cannot drift.
 */
export const useEditFlyoutPreviewSyncFromModel = ({
  isFlyoutOpen,
  isExternalFlyoutOpen,
  preview,
}: UseEditFlyoutPreviewSyncFromModelArgs): void => {
  const {
    clearPreview,
    setDataPhasesCount,
    setDownsampleStepsCount,
    setHasUnsavedChanges,
    setIsActive,
    setRetentionPeriod,
    setTimelineModel,
  } = useLifecyclePreview();

  useEffect(() => {
    if (!isFlyoutOpen) {
      if (!isExternalFlyoutOpen) {
        clearPreview();
      }
      return;
    }

    if (!preview) {
      return;
    }

    setIsActive(true);

    if (preview.action === 'clear') {
      clearPreview();
      setHasUnsavedChanges(Boolean(preview.hasUnsavedChanges));
      return;
    }

    if (preview.timelineModel) {
      setTimelineModel(preview.timelineModel);
    }
    setRetentionPeriod(preview.retentionPeriod);
    setDataPhasesCount(preview.dataPhasesCount);
    if (preview.downsampleStepsCount !== undefined) {
      setDownsampleStepsCount(preview.downsampleStepsCount);
    }
    setHasUnsavedChanges(Boolean(preview.hasUnsavedChanges));
  }, [
    clearPreview,
    isExternalFlyoutOpen,
    isFlyoutOpen,
    preview,
    setDataPhasesCount,
    setDownsampleStepsCount,
    setHasUnsavedChanges,
    setIsActive,
    setRetentionPeriod,
    setTimelineModel,
  ]);
};
