/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse, stringify } from 'query-string';
import { useCallback, useMemo } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import type { LayoutDirection } from '@kbn/workflows';
import {
  getStoredEditorView,
  getStoredGraphDirection,
  setStoredEditorView,
  setStoredGraphDirection,
} from '../lib/workflow_editor_preferences';

export type WorkflowUrlStateTabType = 'workflow' | 'executions';
export type WorkflowEditorView = 'yaml' | 'graph';

export interface WorkflowUrlState {
  tab?: WorkflowUrlStateTabType;
  view?: WorkflowEditorView;
  direction?: LayoutDirection;
  executionId?: string;
  stepExecutionId?: string;
  stepId?: string;
  resume?: boolean;
  replayExecutionId?: string;
}

/**
 * Normalise a `query-string` value (which may be `string | string[] | null`)
 * to `string | undefined`, taking the first element of any array.
 */
function firstString(value: string | string[] | null | undefined): string | undefined {
  if (Array.isArray(value)) return value[0] ?? undefined;
  return value ?? undefined;
}

export function useWorkflowUrlState() {
  const history = useHistory();
  const location = useLocation();

  const urlState = useMemo((): {
    tab: WorkflowUrlStateTabType;
    view: WorkflowEditorView;
    direction: LayoutDirection;
    executionId: string | undefined;
    stepExecutionId: string | undefined;
    stepId: string | undefined;
    shouldAutoResume: boolean;
    replayExecutionId: string | undefined;
  } => {
    const params = parse(location.search);
    return {
      tab: (firstString(params.tab) as WorkflowUrlStateTabType) || 'workflow',
      view:
        getStoredEditorView() ??
        (params.view === 'graph' || params.view === 'yaml'
          ? (params.view as WorkflowEditorView)
          : 'yaml'),
      direction:
        getStoredGraphDirection() ??
        (params.direction === 'LR' || params.direction === 'TB'
          ? (params.direction as LayoutDirection)
          : 'TB'),
      executionId: firstString(params.executionId),
      stepExecutionId: firstString(params.stepExecutionId),
      stepId: firstString(params.stepId),
      shouldAutoResume: firstString(params.resume) === 'true',
      replayExecutionId: firstString(params.replayExecutionId),
    };
  }, [location.search]);

  const updateUrlState = useCallback(
    (updates: Partial<WorkflowUrlState>) => {
      const currentParams = parse(history.location.search);

      // Update the params with new values
      const newParams = {
        ...currentParams,
        ...updates,
      };

      // Remove undefined/null values to keep URL clean
      const cleanParams: Record<string, string | boolean> = {};
      Object.entries(newParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          cleanParams[key] = value as string | boolean;
        }
      });

      // Update the URL without causing a full page reload
      const newSearch = stringify(cleanParams, { encode: false });
      const nextSearch = newSearch ? `?${newSearch}` : '';
      if (nextSearch === history.location.search) {
        return;
      }

      history.replace({
        ...history.location,
        search: nextSearch,
      });
    },
    [history]
  );

  const setActiveTab = useCallback(
    (tab: 'workflow' | 'executions') => {
      // When switching to other tab, clear execution selection
      updateUrlState({
        executionId: undefined,
        stepExecutionId: undefined,
        stepId: undefined,
        tab,
      });
    },
    [updateUrlState]
  );

  const setSelectedExecution = useCallback(
    (executionId: string | null) => {
      updateUrlState({
        executionId: executionId || undefined,
        stepExecutionId: undefined,
        stepId: undefined,
      });
    },
    [updateUrlState]
  );

  const setSelectedStepExecution = useCallback(
    (stepExecutionId: string | null) => {
      updateUrlState({
        stepExecutionId: stepExecutionId || undefined,
        stepId: undefined,
      });
    },
    [updateUrlState]
  );

  const setSelectedStep = useCallback(
    (stepId: string | null) => {
      updateUrlState({
        stepId: stepId || undefined,
      });
    },
    [updateUrlState]
  );

  const clearResumeParam = useCallback(() => {
    updateUrlState({ resume: undefined });
  }, [updateUrlState]);

  const clearReplayExecutionId = useCallback(() => {
    updateUrlState({ replayExecutionId: undefined });
  }, [updateUrlState]);

  const setEditorView = useCallback(
    (view: WorkflowEditorView) => {
      setStoredEditorView(view);
      updateUrlState({
        view,
        // Clear the flyout selection when switching views
        stepId: undefined,
      });
    },
    [updateUrlState]
  );

  const setGraphDirection = useCallback(
    (direction: LayoutDirection) => {
      setStoredGraphDirection(direction);
      updateUrlState({ direction });
    },
    [updateUrlState]
  );

  return {
    // Current state
    activeTab: urlState.tab,
    editorView: urlState.view,
    graphDirection: urlState.direction,
    selectedExecutionId: urlState.executionId,
    selectedStepExecutionId: urlState.stepExecutionId,
    selectedStepId: urlState.stepId,
    shouldAutoResume: urlState.shouldAutoResume,
    replayExecutionId: urlState.replayExecutionId,

    // State setters
    setActiveTab,
    setEditorView,
    setGraphDirection,
    setSelectedExecution,
    setSelectedStepExecution,
    setSelectedStep,
    updateUrlState,
    clearResumeParam,
    clearReplayExecutionId,
  };
}
