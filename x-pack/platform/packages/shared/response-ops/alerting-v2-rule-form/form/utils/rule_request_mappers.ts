/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleResponse, CreateRuleData, Query, UpdateRuleData } from '@kbn/alerting-v2-schemas';
import { DELAY_MODE } from '../types';
import type { FormValues, StateTransition, RuleQuery } from '../types';
import {
  deriveAlertDelayModeFromStateTransition,
  deriveRecoveryDelayModeFromStateTransition,
} from '../types';
import {
  mapArtifacts,
  mergeArtifactsByType,
  splitArtifactsByType,
  type RuleArtifactPayload,
} from './artifact_mappers';

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

const mapQuery = (query: RuleQuery): Query => {
  if (query.format === 'composed') {
    return {
      format: 'composed',
      base: query.base,
      breach: { segment: query.breach.segment },
      ...(query.recovery ? { recovery: { segment: query.recovery.segment } } : {}),
    };
  }
  return {
    format: 'standalone',
    breach: { query: query.breach.query },
    ...(query.recovery ? { recovery: { query: query.recovery.query } } : {}),
  };
};

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
  recovery_strategy?: 'query';
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
  const hasRecovery = query.recovery != null;

  return {
    metadata: mapMetadata(metadata),
    time_field: timeField,
    schedule: mapSchedule(schedule),
    query: mapQuery(query),
    ...(hasRecovery ? { recovery_strategy: 'query' as const } : {}),
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
  const { grouping, state_transition, artifacts, ...rest } = mapFormValuesToRuleRequest(formValues);

  return {
    ...rest,
    grouping: grouping ?? null,
    state_transition: state_transition ?? null,
    artifacts: artifacts ?? null,
  };
};

// ---------------------------------------------------------------------------
// API response → FormValues
// ---------------------------------------------------------------------------

const apiQueryToRuleQuery = (
  q: RuleResponse['query'],
  recoveryStrategy?: RuleResponse['recovery_strategy']
): RuleQuery => {
  if (q.format === 'composed') {
    return {
      format: 'composed',
      base: q.base,
      breach: { segment: q.breach.segment },
      ...(recoveryStrategy === 'query' && q.recovery
        ? { recovery: { segment: q.recovery.segment } }
        : {}),
    };
  }
  return {
    format: 'standalone',
    breach: { query: q.breach.query },
    ...(recoveryStrategy === 'query' && q.recovery
      ? { recovery: { query: q.recovery.query } }
      : {}),
  };
};

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
    query: apiQueryToRuleQuery(rule.query, rule.recovery_strategy),
    ...(rule.grouping ? { grouping: { fields: rule.grouping.fields } } : {}),
    stateTransition,
    stateTransitionAlertDelayMode: deriveAlertDelayModeFromStateTransition(stateTransition),
    stateTransitionRecoveryDelayMode: deriveRecoveryDelayModeFromStateTransition(stateTransition),
    ...splitArtifactsByType(rule.artifacts),
  };
};
