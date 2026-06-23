/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { Aggregation, Comparator } from './form_types';

export const AGGREGATION_OPTIONS = [
  {
    value: Aggregation.COUNT,
    text: i18n.translate('xpack.alertingV2.ruleBuilder.agg.count', { defaultMessage: 'Count' }),
  },
  {
    value: Aggregation.AVG,
    text: i18n.translate('xpack.alertingV2.ruleBuilder.agg.avg', { defaultMessage: 'Average' }),
  },
  {
    value: Aggregation.SUM,
    text: i18n.translate('xpack.alertingV2.ruleBuilder.agg.sum', { defaultMessage: 'Sum' }),
  },
  {
    value: Aggregation.MIN,
    text: i18n.translate('xpack.alertingV2.ruleBuilder.agg.min', { defaultMessage: 'Min' }),
  },
  {
    value: Aggregation.MAX,
    text: i18n.translate('xpack.alertingV2.ruleBuilder.agg.max', { defaultMessage: 'Max' }),
  },
  {
    value: Aggregation.CARDINALITY,
    text: i18n.translate('xpack.alertingV2.ruleBuilder.agg.cardinality', {
      defaultMessage: 'Cardinality',
    }),
  },
  {
    value: Aggregation.P95,
    text: i18n.translate('xpack.alertingV2.ruleBuilder.agg.p95', { defaultMessage: 'P95' }),
  },
  {
    value: Aggregation.P99,
    text: i18n.translate('xpack.alertingV2.ruleBuilder.agg.p99', { defaultMessage: 'P99' }),
  },
];

export const COMPARATOR_OPTIONS = [
  {
    value: Comparator.GT,
    text: i18n.translate('xpack.alertingV2.ruleBuilder.comparator.gt', {
      defaultMessage: 'is above',
    }),
  },
  {
    value: Comparator.GTE,
    text: i18n.translate('xpack.alertingV2.ruleBuilder.comparator.gte', {
      defaultMessage: 'is above or equals',
    }),
  },
  {
    value: Comparator.LT,
    text: i18n.translate('xpack.alertingV2.ruleBuilder.comparator.lt', {
      defaultMessage: 'is below',
    }),
  },
  {
    value: Comparator.LTE,
    text: i18n.translate('xpack.alertingV2.ruleBuilder.comparator.lte', {
      defaultMessage: 'is below or equals',
    }),
  },
  {
    value: Comparator.BETWEEN,
    text: i18n.translate('xpack.alertingV2.ruleBuilder.comparator.between', {
      defaultMessage: 'is between',
    }),
  },
  {
    value: Comparator.NOT_BETWEEN,
    text: i18n.translate('xpack.alertingV2.ruleBuilder.comparator.notBetween', {
      defaultMessage: 'is not between',
    }),
  },
];

export const CONDITION_OPERATOR_OPTIONS = [
  {
    id: 'AND',
    label: i18n.translate('xpack.alertingV2.ruleBuilder.conditionOperator.and', {
      defaultMessage: 'AND',
    }),
  },
  {
    id: 'OR',
    label: i18n.translate('xpack.alertingV2.ruleBuilder.conditionOperator.or', {
      defaultMessage: 'OR',
    }),
  },
];

export const THRESHOLD_STEP_TITLE = i18n.translate(
  'xpack.alertingV2.ruleBuilder.threshold.stepTitle',
  { defaultMessage: 'Alert Condition' }
);

export const STAT_LABEL_REQUIRED_ERROR = i18n.translate(
  'xpack.alertingV2.ruleBuilder.stats.labelRequiredError',
  { defaultMessage: 'Label is required.' }
);

export const STAT_FIELD_REQUIRED_ERROR = i18n.translate(
  'xpack.alertingV2.ruleBuilder.stats.fieldRequiredError',
  { defaultMessage: 'Field is required.' }
);
