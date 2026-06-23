/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

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
