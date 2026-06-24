/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { RuleFormServices } from '../../form/contexts/rule_form_context';
import type { ComposeFormValues } from './compose_form_types';
import type { BuilderState } from './rule_builder/types';

export type ComposeDiscoverMode = 'create' | 'edit' | 'clone';

export type RecoveryType = 'default' | 'custom';

export type QueryTab = 'base' | 'alert' | 'recovery';

export type StepId =
  | 'alertCondition'
  | 'builderCondition'
  | 'recoveryCondition'
  | 'details'
  | 'notifications';

export const isAlertConditionStepId = (id: StepId): boolean =>
  id === 'alertCondition' || id === 'builderCondition';

export interface CustomRecoveryRenderProps {
  state: ComposeDiscoverState;
  dispatch: React.Dispatch<ComposeDiscoverAction>;
}

export interface StepRenderProps {
  state: ComposeDiscoverState;
  dispatch: React.Dispatch<ComposeDiscoverAction>;
  services: RuleFormServices;
  onRecoveryTypeChange: (type: RecoveryType) => void;
  isEditing: boolean;
  ruleId?: string;
  renderCustomRecovery?: (props: CustomRecoveryRenderProps) => React.ReactNode;
}

export interface StepDefinition {
  id: StepId;
  title: string;
  render: (props: StepRenderProps) => React.ReactNode;
  validate?: (
    methods: UseFormReturn<ComposeFormValues>,
    state: ComposeDiscoverState,
    services?: RuleFormServices,
    builderState?: BuilderState
  ) => Promise<boolean> | boolean;
}

/**
 * UI-only state for the ComposeDiscover flyout.
 *
 * Query content lives in RHF (committed state) and local useState in the parent flyout (editing buffer).
 * This reducer owns navigation, Sandbox open/close, tab selection, and mode flags only —
 * no query strings are stored here.
 *
 * Whether the rule is signal vs alert is read directly from RHF `kind` — it is NOT
 * mirrored here. Pass `isAlert` explicitly to any reducer action or helper that needs it.
 */
export interface ComposeDiscoverState {
  mode: ComposeDiscoverMode;
  step: number;
  /** How recovery is detected. 'default' = invert alert block; 'custom' = separate recovery block. */
  recoveryType: RecoveryType;
  activeTab: QueryTab;
  childOpen: boolean;
  queryCommitted: boolean;
  /** When true the stepped form is replaced by a full YAML editor. */
  yamlMode: boolean;
}

export type ComposeDiscoverAction =
  | { type: 'SET_RECOVERY_TYPE'; recoveryType: RecoveryType; isBuilderMode?: boolean }
  | { type: 'KIND_CHANGE'; kind: 'signal' | 'alert' }
  | { type: 'SET_TAB'; tab: QueryTab }
  | { type: 'SET_STEP'; step: number }
  | { type: 'GO_NEXT'; isAlert: boolean }
  | { type: 'GO_BACK' }
  | { type: 'OPEN_CHILD'; isAlert: boolean }
  | { type: 'OPEN_CHILD_FOR_STEP'; step: number; isAlert: boolean }
  | { type: 'CLOSE_CHILD' }
  | { type: 'COMMIT_QUERY' }
  | { type: 'INVALIDATE_QUERY' }
  | { type: 'SET_YAML_MODE'; enabled: boolean };
