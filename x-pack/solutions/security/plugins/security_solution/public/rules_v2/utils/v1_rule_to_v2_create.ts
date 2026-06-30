/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CreateRuleData, RuleParams } from '@kbn/alerting-v2-schemas';
import type { Filter } from '@kbn/es-query';
import type { Rule } from '../../detection_engine/rule_management/logic/types';
import { buildThresholdEsqlQuery } from './threshold_to_esql';

const DURATION_MULTIPLIERS: Record<string, number> = { s: 1 / 60, m: 1, h: 60, d: 1440 };

const parseDateMathToMinutes = (dateMath: string | undefined): number | null => {
  if (!dateMath) return null;
  const match = dateMath.match(/^now-(\d+)([smhd])$/);
  if (!match) return null;
  const [, val, unit] = match;
  return parseInt(val, 10) * (DURATION_MULTIPLIERS[unit] ?? 1);
};

const parseDurationToMinutes = (duration: string | undefined): number | null => {
  if (!duration) return null;
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  const [, val, unit] = match;
  return parseInt(val, 10) * (DURATION_MULTIPLIERS[unit] ?? 1);
};

const filterToKql = (filter: Filter): string | null => {
  if (filter.meta.disabled) return null;
  const { key, type, negate, params } = filter.meta;
  if (!key) return null;

  let expr: string;
  switch (type) {
    case 'phrase':
    case 'match_phrase':
      expr = `${key}: "${filter.meta.value ?? (params as Record<string, unknown>)?.query ?? ''}"`;
      break;
    case 'phrases':
      expr = `${key}: (${(params as string[]).map((v) => `"${v}"`).join(' OR ')})`;
      break;
    case 'exists':
      expr = `${key}: *`;
      break;
    case 'range': {
      const r = params as Record<string, number>;
      const parts: string[] = [];
      if (r.gte != null) parts.push(`${key} >= ${r.gte}`);
      if (r.gt != null) parts.push(`${key} > ${r.gt}`);
      if (r.lte != null) parts.push(`${key} <= ${r.lte}`);
      if (r.lt != null) parts.push(`${key} < ${r.lt}`);
      expr = parts.join(' AND ');
      break;
    }
    default:
      return null;
  }
  return negate ? `NOT (${expr})` : expr;
};

export const filtersToKqlString = (filters: Filter[]): string =>
  filters
    .map(filterToKql)
    .filter((s): s is string => s != null)
    .join(' AND ');

/**
 * Fields from a v1 rule that cannot be represented in v2 and will be lost
 * during conversion.
 */
export interface UnsupportedV1Fields {
  severity: boolean;
  riskScore: boolean;
  severityMapping: boolean;
  riskScoreMapping: boolean;
  actions: boolean;
  responseActions: boolean;
  timelineTemplate: boolean;
  maxSignals: boolean;
  ruleNameOverride: boolean;
  missingFieldsStrategy: boolean;
  dataViewId: boolean;
  luceneQuery: boolean;
}

/**
 * Fields that make conversion impossible (would produce an invalid v2 rule).
 * When any of these are `true`, the Convert button should be disabled.
 */
export const BLOCKING_FIELDS: ReadonlySet<keyof UnsupportedV1Fields> = new Set(['luceneQuery']);

export const getUnsupportedFields = (rule: Rule): UnsupportedV1Fields => ({
  severity: rule.severity !== 'low',
  riskScore: rule.risk_score > 0,
  severityMapping: (rule.severity_mapping?.length ?? 0) > 0,
  riskScoreMapping: (rule.risk_score_mapping?.length ?? 0) > 0,
  actions: (rule.actions?.length ?? 0) > 0,
  responseActions: 'response_actions' in rule && (rule.response_actions?.length ?? 0) > 0,
  timelineTemplate: 'timeline_id' in rule && rule.timeline_id != null,
  maxSignals: (rule.max_signals ?? 100) !== 100,
  ruleNameOverride: 'rule_name_override' in rule && rule.rule_name_override != null,
  missingFieldsStrategy:
    'alert_suppression' in rule &&
    rule.alert_suppression != null &&
    'missing_fields_strategy' in rule.alert_suppression &&
    rule.alert_suppression.missing_fields_strategy != null &&
    rule.alert_suppression.missing_fields_strategy !== 'doNotSuppress',
  dataViewId: false,
  luceneQuery:
    rule.type === 'threshold' &&
    Boolean(rule.query?.trim()) &&
    'language' in rule &&
    rule.language === 'lucene',
});

export const hasUnsupportedFields = (unsupported: UnsupportedV1Fields): boolean =>
  Object.values(unsupported).some(Boolean);

export const hasBlockingFields = (unsupported: UnsupportedV1Fields): boolean =>
  Object.entries(unsupported).some(
    ([key, val]) => val && BLOCKING_FIELDS.has(key as keyof UnsupportedV1Fields)
  );

interface ConvertOptions {
  /**
   * Index patterns resolved from the rule's data view. When provided these
   * are used instead of `rule.index` so that data-view-only threshold rules
   * can be converted.
   */
  resolvedIndexPatterns?: string[];
}

/**
 * Converts a v1 Detection Engine rule (esql or threshold) into a v2
 * CreateRuleData payload suitable for `POST /api/alerting/v2/rules`.
 *
 * Only `type: 'esql'` and `type: 'threshold'` are supported. Throws for
 * other rule types.
 */
export const toV2CreatePayload = (rule: Rule, options: ConvertOptions = {}): CreateRuleData => {
  if (rule.type !== 'esql' && rule.type !== 'threshold') {
    throw new Error(
      `Cannot convert rule type "${rule.type}" to v2. Only esql and threshold are supported.`
    );
  }

  const indexPatterns =
    options.resolvedIndexPatterns ?? ('index' in rule ? rule.index : undefined) ?? [];
  const evaluationQuery = buildEvaluationQuery(rule, indexPatterns);

  if (!evaluationQuery) {
    throw new Error(
      'Cannot convert rule: the resulting ES|QL query is empty. ' +
        'Ensure the rule has a valid query or index patterns configured.'
    );
  }

  const tags = buildTags(rule);

  const params = buildParams(rule);

  const exceptions =
    rule.exceptions_list?.map((ref) => ({
      id: ref.id,
      list_id: ref.list_id,
      type: ref.type as 'detection' | 'rule_default' | 'endpoint',
      namespace_type: ref.namespace_type as 'agnostic' | 'single',
    })) ?? [];

  const grouping = buildGrouping(rule);

  const interval = rule.interval ?? '5m';
  const schedule: CreateRuleData['schedule'] = { every: interval };

  const fromMinutes = parseDateMathToMinutes(rule.from);
  const intervalMinutes = parseDurationToMinutes(interval);
  if (fromMinutes != null && intervalMinutes != null) {
    const lookbackMinutes = fromMinutes - intervalMinutes;
    if (lookbackMinutes > 0) {
      schedule.lookback = `${lookbackMinutes}m`;
    }
  }

  const payload: CreateRuleData = {
    kind: 'alert',
    metadata: {
      name: rule.name,
      description: rule.description,
      owner: 'siem',
      tags,
    },
    time_field: ('timestamp_override' in rule && rule.timestamp_override) || '@timestamp',
    schedule,
    query: {
      format: 'standalone',
      breach: { query: evaluationQuery },
    },
    recovery_strategy: 'no_breach',
    state_transition: {
      pending_count: 0,
      recovering_count: 0,
    },
    ...(grouping ? { grouping } : {}),
    ...(exceptions.length > 0 ? { exceptions } : {}),
    ...(Object.keys(params).length > 0 ? { params } : {}),
  };

  return payload;
};

const buildEvaluationQuery = (rule: Rule, indexPatterns: string[]): string => {
  if (rule.type === 'esql') {
    return rule.query;
  }

  if (rule.type === 'threshold' && rule.threshold) {
    const filterKql = 'filters' in rule ? filtersToKqlString((rule.filters as Filter[]) ?? []) : '';
    const queryKql = rule.query?.trim() ?? '';
    const language = 'language' in rule ? (rule.language as string) : 'kuery';
    const isLucene = language === 'lucene';

    const combinedFilter = isLucene
      ? filterKql || undefined
      : [queryKql, filterKql].filter(Boolean).join(' AND ') || undefined;

    return buildThresholdEsqlQuery({
      indexPatterns,
      thresholdFields: Array.isArray(rule.threshold.field)
        ? rule.threshold.field
        : [rule.threshold.field],
      thresholdValue: rule.threshold.value,
      cardinalityField: rule.threshold.cardinality?.[0]?.field,
      cardinalityValue: rule.threshold.cardinality?.[0]?.value,
      filterQuery: combinedFilter,
      filterLanguage: isLucene ? undefined : 'kuery',
    });
  }

  return '';
};

const buildTags = (rule: Rule): string[] => {
  const baseTags = ['security', 'migrated_from_v1'];
  if (rule.type === 'threshold') {
    baseTags.push('threshold');
  } else {
    baseTags.push('esql');
  }
  const userTags = (rule.tags ?? []).filter((t) => !baseTags.includes(t.toLowerCase()));
  return [...baseTags, ...userTags];
};

const buildParams = (rule: Rule): RuleParams => {
  const params: RuleParams = {};

  if (rule.threat?.length) {
    params.threat = rule.threat.map((t) => ({
      framework: t.framework,
      tactic: { id: t.tactic.id, name: t.tactic.name, reference: t.tactic.reference },
      technique: t.technique?.map((tech) => ({
        id: tech.id,
        name: tech.name,
        reference: tech.reference,
        subtechnique: tech.subtechnique?.map((sub) => ({
          id: sub.id,
          name: sub.name,
          reference: sub.reference,
        })),
      })),
    }));
  }

  if ('note' in rule && rule.note) {
    params.note = rule.note;
  }

  if ('setup' in rule && rule.setup) {
    params.setup = rule.setup;
  }

  if (rule.related_integrations?.length) {
    params.related_integrations = rule.related_integrations.map((ri) => ({
      package: ri.package,
      version: ri.version,
      ...(ri.integration ? { integration: ri.integration } : {}),
    }));
  }

  if ('investigation_fields' in rule && rule.investigation_fields?.field_names?.length) {
    params.investigation_fields = {
      field_names: rule.investigation_fields.field_names,
    };
  }

  if (rule.references?.length) {
    params.references = rule.references;
  }

  return params;
};

const buildGrouping = (rule: Rule): { fields: string[]; duration?: string } | undefined => {
  if (
    'alert_suppression' in rule &&
    rule.alert_suppression != null &&
    'group_by' in rule.alert_suppression &&
    rule.alert_suppression.group_by?.length
  ) {
    const result: { fields: string[]; duration?: string } = {
      fields: rule.alert_suppression.group_by,
    };
    if (rule.alert_suppression.duration) {
      const { value, unit } = rule.alert_suppression.duration;
      result.duration = `${value}${unit}`;
    }
    return result;
  }

  return undefined;
};
