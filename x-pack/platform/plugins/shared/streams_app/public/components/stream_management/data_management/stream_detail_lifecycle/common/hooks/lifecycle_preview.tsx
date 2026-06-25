/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { DownsampleStep } from '@kbn/streams-schema/src/models/ingest/lifecycle';
import { isEqual } from 'lodash';
import type { LifecyclePhase } from '../data_lifecycle/lifecycle_types';

/** Preview state shared between retention card and timeline. */
export interface LifecyclePreviewState {
  isActive: boolean;
  hasUnsavedChanges: boolean;
  isDslDownsampleFlyoutOpen: boolean;
  retentionPeriod: string | null;
  dataPhasesCount: number | null;
  downsampleStepsCount: number | null;
  timelinePhases: LifecyclePhase[] | null;
  timelineDownsampleSteps: DownsampleStep[] | null;
}

export interface LifecyclePreviewApi extends LifecyclePreviewState {
  setIsActive: (isActive: boolean) => void;
  setHasUnsavedChanges: (hasUnsavedChanges: boolean) => void;
  setRetentionPeriod: (retentionPeriod: string | null) => void;
  setDataPhasesCount: (count: number | null) => void;
  setDownsampleStepsCount: (count: number | null) => void;
  setTimelineModel: (model: {
    phases: LifecyclePhase[];
    downsampleSteps: DownsampleStep[] | null;
  }) => void;
  setIsDslDownsampleFlyoutOpen: (isOpen: boolean) => void;
  clearPreview: () => void;
}

const LifecyclePreviewContext = createContext<LifecyclePreviewApi | undefined>(undefined);

const defaultState: LifecyclePreviewState = {
  isActive: false,
  hasUnsavedChanges: false,
  isDslDownsampleFlyoutOpen: false,
  retentionPeriod: null,
  dataPhasesCount: null,
  downsampleStepsCount: null,
  timelinePhases: null,
  timelineDownsampleSteps: null,
};

export const LifecyclePreviewProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<LifecyclePreviewState>(defaultState);

  const setIsActive = useCallback((isActive: boolean) => {
    setState((prev) => {
      if (prev.isActive === isActive) return prev;
      return { ...prev, isActive };
    });
  }, []);

  const setHasUnsavedChanges = useCallback((hasUnsavedChanges: boolean) => {
    setState((prev) => {
      if (prev.hasUnsavedChanges === hasUnsavedChanges) return prev;
      return { ...prev, hasUnsavedChanges };
    });
  }, []);

  const setRetentionPeriod = useCallback((retentionPeriod: string | null) => {
    setState((prev) => {
      if (prev.retentionPeriod === retentionPeriod) return prev;
      return { ...prev, retentionPeriod };
    });
  }, []);

  const setDataPhasesCount = useCallback((dataPhasesCount: number | null) => {
    setState((prev) => {
      if (prev.dataPhasesCount === dataPhasesCount) return prev;
      return { ...prev, dataPhasesCount };
    });
  }, []);

  const setDownsampleStepsCount = useCallback((downsampleStepsCount: number | null) => {
    setState((prev) => {
      if (prev.downsampleStepsCount === downsampleStepsCount) return prev;
      return { ...prev, downsampleStepsCount };
    });
  }, []);

  const setTimelineModel = useCallback(
    (model: { phases: LifecyclePhase[]; downsampleSteps: DownsampleStep[] | null }) => {
      setState((prev) => {
        if (
          isEqual(prev.timelinePhases, model.phases) &&
          isEqual(prev.timelineDownsampleSteps, model.downsampleSteps)
        ) {
          return prev;
        }
        return {
          ...prev,
          timelinePhases: model.phases,
          timelineDownsampleSteps: model.downsampleSteps,
        };
      });
    },
    []
  );

  const setIsDslDownsampleFlyoutOpen = useCallback((isDslDownsampleFlyoutOpen: boolean) => {
    setState((prev) =>
      prev.isDslDownsampleFlyoutOpen === isDslDownsampleFlyoutOpen
        ? prev
        : { ...prev, isDslDownsampleFlyoutOpen }
    );
  }, []);

  const clearPreview = useCallback(() => {
    setState((prev) => {
      const next = {
        ...defaultState,
        isDslDownsampleFlyoutOpen: prev.isDslDownsampleFlyoutOpen,
      };

      if (isEqual(prev, next)) {
        return prev;
      }

      return next;
    });
  }, []);

  const value = useMemo<LifecyclePreviewApi>(() => {
    return {
      ...state,
      setIsActive,
      setHasUnsavedChanges,
      setRetentionPeriod,
      setDataPhasesCount,
      setDownsampleStepsCount,
      setTimelineModel,
      setIsDslDownsampleFlyoutOpen,
      clearPreview,
    };
  }, [
    clearPreview,
    setDataPhasesCount,
    setDownsampleStepsCount,
    setHasUnsavedChanges,
    setIsDslDownsampleFlyoutOpen,
    setRetentionPeriod,
    setIsActive,
    setTimelineModel,
    state,
  ]);

  return (
    <LifecyclePreviewContext.Provider value={value}>{children}</LifecyclePreviewContext.Provider>
  );
};

/** Access lifecycle preview state (requires `LifecyclePreviewProvider`). */
export const useLifecyclePreview = (): LifecyclePreviewApi => {
  const ctx = useContext(LifecyclePreviewContext);
  if (!ctx) {
    // Provider is expected to be placed at the section/page level.
    throw new Error('useLifecyclePreview must be used within a LifecyclePreviewProvider');
  }
  return ctx;
};
