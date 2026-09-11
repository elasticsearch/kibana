/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useReducer } from 'react';
import type { RuleKind } from '../../form/types';
import type {
  StepId,
  ComposeDiscoverState,
  ComposeDiscoverAction,
  ComposeDiscoverMode,
  QueryTab,
} from './types';

export const getStepIds = (isAlert: boolean): StepId[] =>
  isAlert
    ? ['alertCondition', 'outcome', 'details', 'notifications']
    : ['alertCondition', 'outcome', 'details'];

export const getBuilderStepIds = (isAlert: boolean): StepId[] =>
  isAlert
    ? ['builderCondition', 'outcome', 'details', 'notifications']
    : ['builderCondition', 'outcome', 'details'];

export interface InitialStateConfig {
  mode: ComposeDiscoverMode;
  initialKind?: RuleKind;
  /** When true, the query is already populated (e.g. from Discover) and the sandbox gate is skipped. */
  isQueryPrePopulated?: boolean;
  /** When true, the flyout opens directly in YAML mode with the sandbox open. */
  forceYamlMode?: boolean;
}

export const createInitialState = ({
  mode,
  initialKind = 'alert',
  isQueryPrePopulated = false,
  forceYamlMode = false,
}: InitialStateConfig): ComposeDiscoverState => ({
  step: 0,
  activeTab: defaultTabForTabs(
    getSandboxTabs(initialKind === 'alert', {
      step: 0,
      hasCustomRecovery: false,
      manualSplitEnabled: false,
    })
  ),
  childOpen: forceYamlMode,
  queryCommitted: mode === 'edit' || mode === 'clone' || isQueryPrePopulated,
  yamlMode: forceYamlMode,
  manualSplitEnabled: false,
});

/**
 * Returns the tabs to show in the Sandbox for the current step.
 *
 * alertCondition + manualSplitEnabled → ['base', 'alert']
 * alertCondition                      → undefined (unified editor; heuristic split on Apply)
 * isAlert + outcome + hasCustomRecovery → ['recovery']
 * everything else                     → undefined (single editor)
 */
export function getSandboxTabs(
  isAlert: boolean,
  state: Pick<ComposeDiscoverState, 'step' | 'manualSplitEnabled'> & {
    hasCustomRecovery: boolean;
  }
): QueryTab[] | undefined {
  if (!isAlert) return undefined;

  const stepId = getStepIds(isAlert)[state.step];

  if (stepId === 'alertCondition') {
    return state.manualSplitEnabled ? ['base', 'alert'] : undefined;
  }
  if (stepId === 'outcome' && state.hasCustomRecovery) return ['recovery'];
  return undefined;
}

function defaultTabForTabs(tabs: QueryTab[] | undefined): QueryTab {
  if (tabs?.includes('recovery')) return 'recovery';
  if (tabs?.includes('base')) return 'base';
  return 'alert';
}

/**
 * Resolves the tab the Sandbox should land on for the given state, for callers
 * that open the Sandbox without a fixed target (e.g. reopen or the YAML button).
 */
export const getDefaultOpenTab = (
  isAlert: boolean,
  step: number,
  hasCustomRecovery: boolean,
  manualSplitEnabled: boolean
): QueryTab =>
  defaultTabForTabs(getSandboxTabs(isAlert, { step, hasCustomRecovery, manualSplitEnabled }));

export function reducer(
  state: ComposeDiscoverState,
  action: ComposeDiscoverAction
): ComposeDiscoverState {
  switch (action.type) {
    case 'KIND_CHANGE':
      return action.kind === 'alert'
        ? { ...state, activeTab: 'base', manualSplitEnabled: false }
        : { ...state, activeTab: 'alert', manualSplitEnabled: false };
    case 'SET_TAB':
      return { ...state, activeTab: action.tab };
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'GO_NEXT': {
      const stepCount = (
        action.isBuilderMode ? getBuilderStepIds(action.isAlert) : getStepIds(action.isAlert)
      ).length;
      const nextStep = Math.min(state.step + 1, stepCount - 1);
      return {
        ...state,
        step: nextStep,
        childOpen: action.isBuilderMode ? state.childOpen : false,
      };
    }
    case 'GO_BACK': {
      const prevStep = Math.max(state.step - 1, 0);
      return {
        ...state,
        step: prevStep,
        childOpen: action.isBuilderMode ? state.childOpen : false,
      };
    }
    case 'OPEN_CHILD':
      return {
        ...state,
        childOpen: true,
        activeTab:
          action.focusedTab ??
          getDefaultOpenTab(action.isAlert, state.step, false, state.manualSplitEnabled),
      };
    case 'OPEN_CHILD_FOR_STEP':
      return {
        ...state,
        step: action.step,
        childOpen: true,
        activeTab:
          action.focusedTab ??
          getDefaultOpenTab(action.isAlert, action.step, false, state.manualSplitEnabled),
      };
    case 'CLOSE_CHILD':
      return { ...state, childOpen: false };
    case 'COMMIT_QUERY':
      return {
        ...state,
        queryCommitted: true,
      };
    case 'INVALIDATE_QUERY':
      return { ...state, queryCommitted: false };
    case 'SET_YAML_MODE':
      return {
        ...state,
        yamlMode: action.enabled,
        childOpen: action.enabled,
        // GUI manual split does not carry over into YAML editing.
        ...(action.enabled ? { manualSplitEnabled: false } : {}),
      };
    case 'ENABLE_MANUAL_SPLIT':
      return { ...state, manualSplitEnabled: true, activeTab: 'base' };
    case 'DISABLE_MANUAL_SPLIT':
      return { ...state, manualSplitEnabled: false, activeTab: 'alert' };
    default:
      return state;
  }
}

export const useComposeDiscoverState = (config: InitialStateConfig) => {
  return useReducer(reducer, undefined, () => createInitialState(config));
};
