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
  } => {
    const params = parse(location.search);
    return {
      tab: (firstString(params.tab) as WorkflowUrlStateTabType) || 'workflow',
      view: params.view === 'graph' ? 'graph' : 'yaml',
      direction: params.direction === 'LR' ? 'LR' : 'TB',
      executionId: firstString(params.executionId),
      stepExecutionId: firstString(params.stepExecutionId),
      stepId: firstString(params.stepId),
      shouldAutoResume: firstString(params.resume) === 'true',
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
      const newLocation = {
        ...history.location,
        search: newSearch ? `?${newSearch}` : '',
      };

      history.replace(newLocation);
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

  const setEditorView = useCallback(
    (view: WorkflowEditorView) => {
      updateUrlState({
        // Omit default to keep the URL clean
        view: view === 'yaml' ? undefined : view,
        // Clear the flyout selection when switching views
        stepId: undefined,
      });
    },
    [updateUrlState]
  );

  const setGraphDirection = useCallback(
    (direction: LayoutDirection) => {
      // Omit default 'TB' to keep the URL clean
      updateUrlState({ direction: direction === 'TB' ? undefined : direction });
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

    // State setters
    setActiveTab,
    setEditorView,
    setGraphDirection,
    setSelectedExecution,
    setSelectedStepExecution,
    setSelectedStep,
    updateUrlState,
    clearResumeParam,
  };
}
