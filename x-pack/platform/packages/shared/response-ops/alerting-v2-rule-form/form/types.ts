/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleKind } from '@kbn/alerting-v2-schemas';
import type { ActionFormValue } from '../actions_form';

export type { RuleKind };

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

const joinComposedQuerySegment = (base: string, segment: string): string => {
  const trimmedBase = base.trim();
  const trimmedSegment = segment.trim();

  if (!trimmedSegment) {
    return trimmedBase;
  }

  if (!trimmedBase) {
    return trimmedSegment.startsWith('|') ? trimmedSegment : `| ${trimmedSegment}`;
  }

  const normalizedSegment = trimmedSegment.startsWith('|') ? trimmedSegment : `| ${trimmedSegment}`;

  return `${trimmedBase}\n${normalizedSegment}`;
};

export function getBreachQuery(query: RuleQuery | undefined): string {
  if (!query) return '';
  if (query.format === 'standalone') return query.breach.query;
  return joinComposedQuerySegment(query.base, query.breach.segment);
}

export function getRecoverQuery(query: RuleQuery | undefined): string {
  if (!query) return '';
  if (query.format === 'standalone') return query.recovery?.query ?? '';
  if (!query.recovery?.segment.trim()) return '';
  return joinComposedQuerySegment(query.base, query.recovery.segment);
}

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
  grouping?: RuleGrouping;
  stateTransition?: StateTransition;
  stateTransitionAlertDelayMode: StateTransitionDelayMode;
  stateTransitionRecoveryDelayMode: StateTransitionDelayMode;
  artifacts?: RuleArtifact[];
  notifications?: RuleNotificationsValue;
  runbookArtifacts?: RuleArtifact[];
  dashboardArtifacts?: RuleArtifact[];
}

/** Derives alert-delay mode from persisted `state_transition`. */
export const deriveAlertDelayModeFromStateTransition = (
  stateTransition?: StateTransition | null
): FormValues['stateTransitionAlertDelayMode'] => {
  if (stateTransition?.pendingTimeframe != null) return DELAY_MODE.duration;
  if (stateTransition?.pendingCount != null && stateTransition.pendingCount > 0)
    return DELAY_MODE.breaches;
  return DELAY_MODE.immediate;
};

/** Derives recovery-delay mode from persisted `state_transition`. */
export const deriveRecoveryDelayModeFromStateTransition = (
  stateTransition?: StateTransition | null
): FormValues['stateTransitionRecoveryDelayMode'] => {
  if (stateTransition?.recoveringTimeframe != null) return DELAY_MODE.duration;
  if (stateTransition?.recoveringCount != null && stateTransition.recoveringCount > 0)
    return DELAY_MODE.recoveries;
  return DELAY_MODE.immediate;
};
