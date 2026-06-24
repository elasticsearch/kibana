/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleKind, RecoveryStrategy, NoDataStrategy } from '@kbn/alerting-v2-schemas';
import type { ActionFormValue } from '../actions_form';

export type { RuleKind, RecoveryStrategy, NoDataStrategy };

/** Alert / recovery delay segment control (matches `AlertDelayField` / `RecoveryDelayField`). */
export const DELAY_MODE = {
  immediate: 'immediate',
  breaches: 'breaches',
  recoveries: 'recoveries',
  duration: 'duration',
} as const;

export type StateTransitionDelayMode = (typeof DELAY_MODE)[keyof typeof DELAY_MODE];

// ---------------------------------------------------------------------------
// RuleQuery — composed/standalone query schema matching the API.
// ---------------------------------------------------------------------------

export interface ComposedQuery {
  format: 'composed';
  base: string;
  breach: { segment: string };
  recovery?: { segment: string };
}

export interface StandaloneQuery {
  format: 'standalone';
  no_data?: { query: string };
  breach: { query: string };
  recovery?: { query: string };
}

export type RuleQuery = ComposedQuery | StandaloneQuery;

// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

export interface RuleMetadata {
  name: string;
  enabled: boolean;
  description?: string;
  owner?: string;
  tags?: string[];
}

export interface RuleSchedule {
  every: string;
  lookback: string;
}

export interface RuleGrouping {
  fields: string[];
}

export interface RuleArtifact {
  id: string;
  type: string;
  value: string;
}

export interface RuleNotificationsValue {
  workflows: ActionFormValue;
}

export interface StateTransition {
  pendingCount?: number | null;
  pendingTimeframe?: string | null;
  recoveringCount?: number | null;
  recoveringTimeframe?: string | null;
}

// ---------------------------------------------------------------------------
// FormValues — the single canonical form type for rule creation/editing.
//
// Matches the API schema structurally (same `query` discriminated union,
// same field semantics). Only diverges in casing (camelCase for RHF) and
// UI-only fields (delay modes, metadata.enabled, split artifact arrays).
// ---------------------------------------------------------------------------

export interface FormValues {
  kind: RuleKind;
  metadata: RuleMetadata;
  timeField: string;
  schedule: RuleSchedule;
  query: RuleQuery;
  recoveryStrategy?: RecoveryStrategy;
  noDataStrategy?: NoDataStrategy;
  grouping?: RuleGrouping;
  stateTransition?: StateTransition;
  stateTransitionAlertDelayMode: StateTransitionDelayMode;
  stateTransitionRecoveryDelayMode: StateTransitionDelayMode;
  artifacts?: RuleArtifact[];
  notifications?: RuleNotificationsValue;
  runbookArtifacts?: RuleArtifact[];
  dashboardArtifacts?: RuleArtifact[];
}
