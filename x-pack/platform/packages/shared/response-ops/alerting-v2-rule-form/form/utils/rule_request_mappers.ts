/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  RuleResponse,
  CreateRuleData,
  Query,
  UpdateRuleData,
  RecoveryStrategy,
  NoDataStrategy,
} from '@kbn/alerting-v2-schemas';
import { DELAY_MODE } from '../types';
import type { FormValues, StateTransition } from '../types';
import {
  deriveAlertDelayModeFromStateTransition,
  deriveRecoveryDelayModeFromStateTransition,
} from './state_transition_helpers';
import { ruleQueryToApiQuery, apiQueryToFormQuery } from './query_mappers';
import {
  mapArtifacts,
  mergeArtifactsByType,
  splitArtifactsByType,
  type RuleArtifactPayload,
} from './artifact_mappers';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the recovery_strategy for an API request.
 * Non-representable strategies (no_breach, none) are preserved as-is.
 * 'query' is always derived from the recovery block presence — never
 * kept as a stale value — because the form can add/remove recovery
 * without updating the recoveryStrategy field.
 */
export const resolveRecoveryStrategy = (
  formValues: Pick<FormValues, 'recoveryStrategy' | 'query'>
): RecoveryStrategy | undefined => {
  if (formValues.recoveryStrategy && formValues.recoveryStrategy !== 'query') {
    return formValues.recoveryStrategy;
  }
  return formValues.query.recovery != null ? ('query' as const) : undefined;
};

// ---------------------------------------------------------------------------
// FormValues → API request
// ---------------------------------------------------------------------------

const mapMetadata = (metadata: FormValues['metadata']) => ({
  name: metadata.name,
  description: metadata.description,
  owner: metadata.owner,
  ...(metadata.tags?.length ? { tags: metadata.tags } : {}),
});

const mapSchedule = (schedule: FormValues['schedule']) => ({
  every: schedule.every,
  lookback: schedule.lookback,
});

const mapGrouping = (grouping: FormValues['grouping']) =>
  grouping?.fields?.length ? { fields: grouping.fields } : undefined;

const mapStateTransition = (formValues: FormValues) => {
  const { kind, stateTransition } = formValues;
  if (kind !== 'alert') return undefined;

  const alertMode =
    formValues.stateTransitionAlertDelayMode ??
    deriveAlertDelayModeFromStateTransition(stateTransition);
  const recoveryMode =
    formValues.stateTransitionRecoveryDelayMode ??
    deriveRecoveryDelayModeFromStateTransition(stateTransition);

  const out: NonNullable<RuleRequestCommon['state_transition']> = {};

  if (alertMode === DELAY_MODE.immediate) {
    out.pending_count = 0;
  } else if (alertMode === DELAY_MODE.breaches && stateTransition?.pendingCount != null) {
    out.pending_count = stateTransition.pendingCount;
  } else if (alertMode === DELAY_MODE.duration) {
    if (stateTransition?.pendingTimeframe != null) {
      out.pending_timeframe = stateTransition.pendingTimeframe;
    }
    if (stateTransition?.pendingCount != null) {
      out.pending_count = stateTransition.pendingCount;
    }
  }

  if (recoveryMode === DELAY_MODE.immediate) {
    out.recovering_count = 0;
  } else if (recoveryMode !== DELAY_MODE.duration && stateTransition?.recoveringCount != null) {
    out.recovering_count = stateTransition.recoveringCount;
  } else if (recoveryMode === DELAY_MODE.duration) {
    if (stateTransition?.recoveringTimeframe != null) {
      out.recovering_timeframe = stateTransition.recoveringTimeframe;
    }
    if (stateTransition?.recoveringCount != null) {
      out.recovering_count = stateTransition.recoveringCount;
    }
  }

  if (Object.keys(out).length === 0) return undefined;
  return out;
};

/**
 * Common rule request shape shared between create and update payloads.
 * Contains all fields except `kind` (only required for create).
 */
export interface RuleRequestCommon {
  metadata: { name: string; description?: string; owner?: string; tags?: string[] };
  time_field: string;
  schedule: { every: string; lookback?: string };
  query: Query;
  recovery_strategy?: RecoveryStrategy;
  no_data_strategy?: NoDataStrategy;
  grouping?: { fields: string[] };
  state_transition?: {
    pending_count?: number;
    pending_timeframe?: string;
    recovering_count?: number;
    recovering_timeframe?: string;
  };
  artifacts?: RuleArtifactPayload;
}

export const mapFormValuesToRuleRequest = (formValues: FormValues): RuleRequestCommon => {
  const { metadata, timeField, schedule, query, grouping } = formValues;
  const mappedArtifacts = mapArtifacts(mergeArtifactsByType(formValues));
  const recoveryStrategy = resolveRecoveryStrategy(formValues);

  return {
    metadata: mapMetadata(metadata),
    time_field: timeField,
    schedule: mapSchedule(schedule),
    query: ruleQueryToApiQuery(query),
    ...(recoveryStrategy ? { recovery_strategy: recoveryStrategy } : {}),
    ...(formValues.noDataStrategy ? { no_data_strategy: formValues.noDataStrategy } : {}),
    grouping: mapGrouping(grouping),
    state_transition: mapStateTransition(formValues),
    ...(mappedArtifacts ? { artifacts: mappedArtifacts } : {}),
  };
};

export const mapFormValuesToCreateRequest = (formValues: FormValues): CreateRuleData => ({
  kind: formValues.kind,
  ...mapFormValuesToRuleRequest(formValues),
});

export const mapFormValuesToUpdateRequest = (formValues: FormValues): UpdateRuleData => {
  const { grouping, state_transition, artifacts, recovery_strategy, no_data_strategy, ...rest } =
    mapFormValuesToRuleRequest(formValues);

  return {
    ...rest,
    recovery_strategy: resolveRecoveryStrategy(formValues) ?? null,
    no_data_strategy: no_data_strategy ?? null,
    grouping: grouping ?? null,
    state_transition: state_transition ?? null,
    artifacts: artifacts ?? null,
  };
};

// ---------------------------------------------------------------------------
// API response → FormValues
// ---------------------------------------------------------------------------

export const mapRuleResponseToFormValues = (rule: RuleResponse): Partial<FormValues> => {
  const stateTransition: StateTransition = {
    pendingCount: rule.state_transition?.pending_count ?? null,
    pendingTimeframe: rule.state_transition?.pending_timeframe ?? null,
    recoveringCount: rule.state_transition?.recovering_count ?? null,
    recoveringTimeframe: rule.state_transition?.recovering_timeframe ?? null,
  };

  return {
    kind: rule.kind,
    metadata: {
      name: rule.metadata.name,
      description: rule.metadata.description,
      enabled: rule.enabled,
      owner: rule.metadata.owner,
      tags: rule.metadata.tags,
    },
    timeField: rule.time_field,
    schedule: {
      every: rule.schedule.every,
      lookback: rule.schedule.lookback ?? '1m',
    },
    query: apiQueryToFormQuery(rule.query, rule.recovery_strategy),
    recoveryStrategy: rule.recovery_strategy ?? undefined,
    noDataStrategy: rule.no_data_strategy ?? undefined,
    ...(rule.grouping ? { grouping: { fields: rule.grouping.fields } } : {}),
    stateTransition,
    stateTransitionAlertDelayMode: deriveAlertDelayModeFromStateTransition(stateTransition),
    stateTransitionRecoveryDelayMode: deriveRecoveryDelayModeFromStateTransition(stateTransition),
    ...splitArtifactsByType(rule.artifacts),
  };
};
