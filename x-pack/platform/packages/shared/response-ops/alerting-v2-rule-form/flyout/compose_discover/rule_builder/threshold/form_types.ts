/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertEventSeverity } from '@kbn/alerting-v2-schemas';
import { SEVERITY_LEVELS } from '@kbn/alerting-v2-schemas';

export enum Aggregation {
  COUNT = 'count',
  AVG = 'avg',
  SUM = 'sum',
  MIN = 'min',
  MAX = 'max',
  CARDINALITY = 'cardinality',
  P95 = 'p95',
  P99 = 'p99',
}

export enum Comparator {
  GT = '>',
  GTE = '>=',
  LT = '<',
  LTE = '<=',
  BETWEEN = 'between',
  NOT_BETWEEN = 'not_between',
}

export type ConditionOperator = 'AND' | 'OR';

export interface StatDefinition {
  id: string;
  label: string;
  aggregation: Aggregation;
  field?: string;
  filter?: string;
}

export interface EvaluationDefinition {
  id: string;
  label: string;
  expression: string;
}

export interface AlertCondition {
  id: string;
  metric: string;
  comparator: Comparator;
  threshold: number[];
}

export type RecoveryCondition = AlertCondition;

export interface RecoveryConfig {
  conditions: RecoveryCondition[];
  conditionOperator: ConditionOperator;
}

export type SeverityMode = 'single' | 'multi';

/** A single severity level with its own threshold (multi-severity mode). */
export interface SeverityLevel {
  id: string;
  severity: AlertEventSeverity;
  threshold: number;
}

/**
 * Optional severity configuration for the alert condition. Severity is only
 * available for a single alert condition; multi mode additionally requires a
 * non-range comparator (not `between`/`not_between`). The comparator is always
 * inherited from the alert condition, so it is not stored here.
 */
export interface SeverityConfig {
  mode: SeverityMode;
  /** Level applied to all alerts in single mode. */
  singleLevelSeverity: AlertEventSeverity;
  /** Ordered from least to most severe in multi mode. */
  levels: SeverityLevel[];
}

export interface ThresholdFormValues {
  indexPattern: string;
  timeField: string;
  filterQuery?: string;
  stats: StatDefinition[];
  evaluations: EvaluationDefinition[];
  alertConditions: AlertCondition[];
  conditionOperator: ConditionOperator;
  groupByFields: string[];
  recovery?: RecoveryConfig;
  severity?: SeverityConfig;
}

export const AGGREGATIONS_REQUIRING_FIELD: Aggregation[] = [
  Aggregation.AVG,
  Aggregation.SUM,
  Aggregation.MIN,
  Aggregation.MAX,
  Aggregation.CARDINALITY,
  Aggregation.P95,
  Aggregation.P99,
];

export const deriveStatLabel = (agg: Aggregation, field?: string): string => {
  if (agg === Aggregation.COUNT) return 'count';
  if (!field) return agg;
  const safe = field.replace(/[^a-zA-Z0-9_]/g, '_');
  return `${agg}_${safe}`;
};

export const DEFAULT_STAT: Omit<StatDefinition, 'id'> = {
  label: 'count',
  aggregation: Aggregation.COUNT,
};

const EVAL_LABEL_CHARS = 'abcdefghijklmnopqrstuvwxyz';

export const nextEvalLabel = (existingLabels: string[]): string => {
  const used = new Set(existingLabels);
  for (const ch of EVAL_LABEL_CHARS) {
    const candidate = `eval_${ch}`;
    if (!used.has(candidate)) return candidate;
  }
  return `eval_${existingLabels.length}`;
};

export const nextStatLabel = (
  existingLabels: string[],
  agg: Aggregation,
  field?: string
): string => {
  const base = deriveStatLabel(agg, field);
  const used = new Set(existingLabels);
  if (!used.has(base)) {
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}_${suffix}`)) {
    suffix++;
  }
  return `${base}_${suffix}`;
};

export const getAvailableMetricLabels = (
  stats: StatDefinition[],
  evaluations: EvaluationDefinition[]
): string[] => [
  ...stats.filter((s) => s.label.trim()).map((s) => s.label),
  ...evaluations.filter((e) => e.label.trim()).map((e) => e.label),
];

/** Re-point conditions at the first available metric when their metric is missing. */
export const reconcileAlertConditionMetrics = (
  conditions: AlertCondition[],
  stats: StatDefinition[],
  evaluations: EvaluationDefinition[]
): AlertCondition[] => {
  const availableLabels = getAvailableMetricLabels(stats, evaluations);
  const defaultMetric = availableLabels[0] ?? '';
  return conditions.map((c) => {
    if (c.metric.trim() && availableLabels.includes(c.metric)) {
      return c;
    }
    return { ...c, metric: defaultMetric };
  });
};

export const shouldSyncConditionMetricOnLabelChange = (
  labels: string[],
  index: number,
  oldLabel: string,
  newLabel: string
): boolean => {
  if (oldLabel === newLabel) {
    return false;
  }
  const owners = labels.filter((label) => label === oldLabel);
  return owners.length === 1 && labels[index] === oldLabel;
};

export const syncConditionsForLabelChange = (
  conditions: AlertCondition[],
  labels: string[],
  index: number,
  oldLabel: string,
  newLabel: string,
  stats: StatDefinition[],
  evaluations: EvaluationDefinition[]
): AlertCondition[] => {
  const synced = shouldSyncConditionMetricOnLabelChange(labels, index, oldLabel, newLabel)
    ? conditions.map((c) => (c.metric === oldLabel ? { ...c, metric: newLabel } : c))
    : conditions;
  return reconcileAlertConditionMetrics(synced, stats, evaluations);
};

export const clearConditionsForRemovedMetric = (
  conditions: AlertCondition[],
  removedLabel: string,
  remainingStats: StatDefinition[],
  evaluations: EvaluationDefinition[]
): AlertCondition[] => {
  const remainingLabels = new Set([
    ...remainingStats.filter((s) => s.label.trim()).map((s) => s.label),
    ...evaluations.filter((e) => e.label.trim()).map((e) => e.label),
  ]);
  if (remainingLabels.has(removedLabel)) {
    return conditions;
  }
  return conditions.map((c) => (c.metric === removedLabel ? { ...c, metric: '' } : c));
};

export const isStatLabelValid = (stat: StatDefinition): boolean => Boolean(stat.label.trim());

export const isStatFieldValid = (stat: StatDefinition): boolean =>
  !AGGREGATIONS_REQUIRING_FIELD.includes(stat.aggregation) || Boolean(stat.field?.trim());

export const areAllStatsValid = (stats: StatDefinition[]): boolean =>
  stats.length > 0 && stats.every((s) => isStatLabelValid(s) && isStatFieldValid(s));

export const DEFAULT_ALERT_CONDITION: Omit<AlertCondition, 'id'> = {
  metric: 'count',
  comparator: Comparator.GT,
  threshold: [100],
};

export const DEFAULT_RECOVERY_CONDITION: Omit<RecoveryCondition, 'id'> = {
  metric: 'count',
  comparator: Comparator.LTE,
  threshold: [100],
};

let idCounter = 0;
export const generateId = (): string => `_${Date.now()}_${++idCounter}`;

export const DEFAULT_SINGLE_SEVERITY_LEVEL: AlertEventSeverity = 'high';

/** Severity requires exactly one alert condition. */
export const isSeveritySupported = (alertConditions: AlertCondition[]): boolean =>
  alertConditions.length === 1;

/** Multi-severity is unsupported for range comparators. */
export const isMultiSeveritySupported = (comparator: Comparator): boolean =>
  comparator !== Comparator.BETWEEN && comparator !== Comparator.NOT_BETWEEN;

export const createDefaultSeverityConfig = (): SeverityConfig => ({
  mode: 'single',
  singleLevelSeverity: DEFAULT_SINGLE_SEVERITY_LEVEL,
  levels: [],
});

/**
 * Seed multi-severity levels from an alert condition: the least-severe level
 * inherits the condition's threshold, plus one more severe level to start from.
 */
export const createDefaultSeverityLevels = (condition: AlertCondition): SeverityLevel[] => {
  const [baseThreshold = 0] = condition.threshold;
  return [
    { id: generateId(), severity: 'low', threshold: baseThreshold },
    { id: generateId(), severity: 'medium', threshold: baseThreshold },
  ];
};

/** Since duplicate severity levels are invalid, at most one level per severity can exist. */
export const MAX_SEVERITY_LEVELS = SEVERITY_LEVELS.length;

/**
 * Suggest the severity for a newly added multi-severity level: the first unused
 * level above the most severe one already used, falling back to the lowest unused
 * level (filling gaps). Never returns a severity already in use unless all are
 * taken, which the {@link MAX_SEVERITY_LEVELS} cap prevents.
 */
export const nextSeverityLevel = (levels: SeverityLevel[]): AlertEventSeverity => {
  const used = new Set(levels.map((lvl) => lvl.severity));
  const maxIndex = levels.length
    ? Math.max(...levels.map((lvl) => SEVERITY_LEVELS.indexOf(lvl.severity)))
    : -1;
  const above = SEVERITY_LEVELS.slice(maxIndex + 1).find((severity) => !used.has(severity));
  if (above) return above;
  return SEVERITY_LEVELS.find((severity) => !used.has(severity)) ?? SEVERITY_LEVELS[0];
};

/**
 * Drop or downgrade severity config that is no longer applicable to the current
 * conditions: severity is cleared for multiple conditions, and multi mode falls
 * back to single mode when the comparator is range-based.
 */
export const reconcileSeverity = (
  severity: SeverityConfig | undefined,
  alertConditions: AlertCondition[]
): SeverityConfig | undefined => {
  if (!severity || !isSeveritySupported(alertConditions)) return undefined;
  const [condition] = alertConditions;
  if (severity.mode === 'multi' && !isMultiSeveritySupported(condition.comparator)) {
    return { ...severity, mode: 'single' };
  }
  return severity;
};

const hasMultiLevels = (severity: SeverityConfig | undefined): severity is SeverityConfig =>
  severity?.mode === 'multi' && severity.levels.length > 0;

/**
 * Mirror the alert condition threshold onto the lowest multi-severity level,
 * so editing the condition keeps the lowest level — which defines the breach
 * threshold — in sync.
 */
export const syncSeverityToConditionThreshold = (
  severity: SeverityConfig | undefined,
  conditionThreshold: number | undefined
): SeverityConfig | undefined => {
  if (!hasMultiLevels(severity) || conditionThreshold === undefined) return severity;
  return {
    ...severity,
    levels: severity.levels.map((lvl, i) =>
      i === 0 ? { ...lvl, threshold: conditionThreshold } : lvl
    ),
  };
};

/**
 * Mirror the lowest multi-severity level threshold onto the single alert condition,
 * so editing that level keeps the generated breach WHERE in sync with the UI.
 */
export const syncConditionToSeverityThreshold = (
  alertConditions: AlertCondition[],
  severity: SeverityConfig | undefined
): AlertCondition[] => {
  if (alertConditions.length !== 1 || !hasMultiLevels(severity)) return alertConditions;
  const [condition] = alertConditions;
  const lowestThreshold = severity.levels[0].threshold;
  return [{ ...condition, threshold: [lowestThreshold, ...condition.threshold.slice(1)] }];
};

/** Order two severity levels by ascending severity (info < low < ... < critical). */
export const compareSeverity = (a: AlertEventSeverity, b: AlertEventSeverity): number =>
  SEVERITY_LEVELS.indexOf(a) - SEVERITY_LEVELS.indexOf(b);

/**
 * Sort multi-severity levels least-to-most severe so `levels[0]` is always the
 * least-severe (fallback) level. ES|QL generation, threshold coupling and the
 * round-trip parser all rely on this ordering, but the level dropdowns let the
 * user pick any level per row — normalize on every mutation so the stored order
 * can never drift from severity order.
 */
export const normalizeSeverityOrder = (
  severity: SeverityConfig | undefined
): SeverityConfig | undefined => {
  if (!severity || severity.mode !== 'multi') return severity;
  return {
    ...severity,
    levels: [...severity.levels].sort((a, b) => compareSeverity(a.severity, b.severity)),
  };
};

export type SeverityValidationError =
  | 'invalid_threshold'
  | 'duplicate_level'
  | 'duplicate_threshold'
  | 'threshold_order';

/**
 * Validate a multi-severity config against the inherited comparator. Returns the
 * first validation error, or `null` when valid. Single mode and disabled
 * severity are always valid.
 */
export const getSeverityValidationError = (
  severity: SeverityConfig | undefined,
  comparator: Comparator
): SeverityValidationError | null => {
  if (!severity || severity.mode === 'single') return null;

  const { levels } = severity;
  if (levels.length === 0) return 'invalid_threshold';

  if (levels.some((lvl) => !Number.isFinite(lvl.threshold))) return 'invalid_threshold';

  const severities = levels.map((lvl) => lvl.severity);
  if (new Set(severities).size !== severities.length) return 'duplicate_level';

  const thresholds = levels.map((lvl) => lvl.threshold);
  if (new Set(thresholds).size !== thresholds.length) return 'duplicate_threshold';

  // More severe levels must have more severe thresholds: strictly increasing for
  // ascending comparators (>, >=), strictly decreasing for descending (<, <=).
  const ascending = comparator === Comparator.GT || comparator === Comparator.GTE;
  const bySeverity = [...levels].sort((a, b) => compareSeverity(a.severity, b.severity));
  for (let i = 1; i < bySeverity.length; i++) {
    const prev = bySeverity[i - 1].threshold;
    const curr = bySeverity[i].threshold;
    if (ascending ? curr <= prev : curr >= prev) return 'threshold_order';
  }

  return null;
};

const FLIPPED_COMPARATOR: Record<Comparator, Comparator> = {
  [Comparator.GT]: Comparator.LTE,
  [Comparator.GTE]: Comparator.LT,
  [Comparator.LT]: Comparator.GTE,
  [Comparator.LTE]: Comparator.GT,
  [Comparator.BETWEEN]: Comparator.NOT_BETWEEN,
  [Comparator.NOT_BETWEEN]: Comparator.BETWEEN,
};

export const deriveRecoveryConditions = (alertConditions: AlertCondition[]): RecoveryCondition[] =>
  alertConditions.map((c) => ({
    id: generateId(),
    metric: c.metric,
    comparator: FLIPPED_COMPARATOR[c.comparator],
    threshold: [...c.threshold],
  }));

export const DEFAULT_THRESHOLD_FORM_VALUES: ThresholdFormValues = {
  indexPattern: '',
  timeField: '@timestamp',
  stats: [{ id: generateId(), ...DEFAULT_STAT }],
  evaluations: [],
  alertConditions: [{ id: generateId(), ...DEFAULT_ALERT_CONDITION }],
  conditionOperator: 'AND',
  groupByFields: [],
};
