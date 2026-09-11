/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { RuleBuilderDefinition } from './types';
import type { ThresholdFormValues } from './threshold/form_types';
import {
  areAllStatsValid,
  DEFAULT_THRESHOLD_FORM_VALUES,
  generateId,
  getAvailableMetricLabels,
  getSeverityValidationError,
  reconcileAlertConditionMetrics,
} from './threshold/form_types';
import { getInvalidExpressionReferences } from './threshold/validate_metric_references';
import { RuleBuilderAlertConditionStep } from './threshold/alert_condition_step';
import { BuilderRecoveryForm } from './threshold/recovery_condition_step';
import { parseThresholdEsql } from './threshold/parse_esql';
import { THRESHOLD_CREATE_FLYOUT_TITLE, THRESHOLD_STEP_TITLE } from './threshold/translations';

const defineBuilder = <TState>(def: RuleBuilderDefinition<TState>): RuleBuilderDefinition =>
  def as RuleBuilderDefinition;

const areAllEvaluationReferencesValid = (values: ThresholdFormValues): boolean => {
  const availableLabels = getAvailableMetricLabels(values.stats, values.evaluations);
  return values.evaluations.every(
    (e) => getInvalidExpressionReferences(e.expression, availableLabels).length === 0
  );
};

const isThresholdFormValid = (values: ThresholdFormValues): boolean => {
  if (!values.indexPattern.trim()) return false;

  if (!areAllStatsValid(values.stats)) return false;

  if (!areAllEvaluationReferencesValid(values)) return false;

  const hasValidCondition = values.alertConditions.some(
    (c) => c.metric.trim() && c.threshold.length > 0
  );
  if (!hasValidCondition) return false;

  // Severity only applies to a single alert condition, whose comparator it inherits.
  if (getSeverityValidationError(values.severity, values.alertConditions[0].comparator) !== null) {
    return false;
  }

  if (values.recovery) {
    const hasValidRecovery = values.recovery.conditions.some(
      (c) => c.metric.trim() && c.threshold.length > 0
    );
    if (!hasValidRecovery) return false;
  }

  return true;
};

const getValidatedThresholdValues = (values: ThresholdFormValues): ThresholdFormValues => ({
  ...values,
  alertConditions: reconcileAlertConditionMetrics(
    values.alertConditions,
    values.stats,
    values.evaluations
  ),
});

const thresholdDefinition = defineBuilder<ThresholdFormValues>({
  type: 'threshold',
  stepTitle: THRESHOLD_STEP_TITLE,
  createFlyoutTitle: THRESHOLD_CREATE_FLYOUT_TITLE,
  createDefaultState: () => ({
    ...DEFAULT_THRESHOLD_FORM_VALUES,
    stats: DEFAULT_THRESHOLD_FORM_VALUES.stats.map((s) => ({ ...s, id: generateId() })),
    evaluations: [],
    alertConditions: DEFAULT_THRESHOLD_FORM_VALUES.alertConditions.map((c) => ({
      ...c,
      id: generateId(),
    })),
    groupByFields: [],
  }),
  renderStep: (props) =>
    React.createElement(RuleBuilderAlertConditionStep, {
      state: props.state,
      dispatch: props.dispatch,
      services: props.services,
    }),
  renderRecoveryStep: (props) =>
    React.createElement(BuilderRecoveryForm, {
      state: props.state,
      dispatch: props.dispatch,
    }),
  validate: (_state, builderState) =>
    // No builder state means the step cannot be valid yet (unlike ES|QL mode, which can proceed
    // on queryCommitted alone before builder state is initialized).
    builderState ? isThresholdFormValid(getValidatedThresholdValues(builderState)) : false,
  parseState: parseThresholdEsql,
});

export const RULE_BUILDER_REGISTRY: Record<string, RuleBuilderDefinition> = {
  threshold: thresholdDefinition,
};
