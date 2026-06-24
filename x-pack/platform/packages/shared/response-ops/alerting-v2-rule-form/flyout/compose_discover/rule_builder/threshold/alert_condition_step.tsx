/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiButtonIcon,
  EuiComboBox,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormErrorText,
  EuiFormRow,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import type { ComposeFormValues } from '../../compose_form_types';
import { useDataFields } from '../../../../form/hooks/use_data_fields';
import { useIndexSources } from '../../../../form/hooks/use_index_sources';
import type { RuleBuilderStepProps } from '../types';
import { useBuilderState } from '../builder_state_context';
import type {
  ThresholdFormValues,
  StatDefinition,
  EvaluationDefinition,
  AlertCondition,
  Aggregation,
  Comparator,
} from './form_types';
import {
  AGGREGATIONS_REQUIRING_FIELD,
  DEFAULT_STAT,
  DEFAULT_ALERT_CONDITION,
  deriveStatLabel,
  nextEvalLabel,
  nextStatLabel,
  reconcileAlertConditionMetrics,
  syncConditionsForLabelChange,
  clearConditionsForRemovedMetric,
  isStatLabelValid,
  isStatFieldValid,
  generateId,
} from './form_types';
import { buildThresholdEsql, buildRecoveryBlock } from './build_esql';
import { splitQuery } from '../../use_heuristic_split';
import {
  AGGREGATION_OPTIONS,
  COMPARATOR_OPTIONS,
  CONDITION_OPERATOR_OPTIONS,
  STAT_FIELD_REQUIRED_ERROR,
  STAT_LABEL_REQUIRED_ERROR,
} from './translations';

export const RuleBuilderAlertConditionStep: React.FC<RuleBuilderStepProps> = ({
  state,
  dispatch,
  services,
}) => {
  const { state: thresholdValues, setState: onThresholdValuesChange } =
    useBuilderState<ThresholdFormValues>();
  const { setValue, watch } = useFormContext<ComposeFormValues>();
  const isAlert = watch('kind') === 'alert';

  const { data: indexOptions, isLoading: isLoadingIndices } = useIndexSources({
    http: services.http,
    application: services.application,
  });

  const fromQuery = thresholdValues.indexPattern ? `FROM ${thresholdValues.indexPattern}` : '';

  const { data: fieldMap } = useDataFields({
    query: fromQuery,
    http: services.http,
    dataViews: services.dataViews,
  });

  const numericFields = useMemo(
    () =>
      Object.values(fieldMap)
        .filter((f) =>
          ['integer', 'long', 'float', 'double', 'number', 'half_float', 'scaled_float'].includes(
            f.type
          )
        )
        .map((f) => f.name)
        .sort(),
    [fieldMap]
  );

  const allFields = useMemo(
    () =>
      Object.values(fieldMap)
        .map((f) => f.name)
        .sort(),
    [fieldMap]
  );

  const dateFields = useMemo(() => {
    const dates = Object.values(fieldMap)
      .filter((f) => f.type === 'date')
      .map((f) => f.name)
      .sort();
    if (dates.length === 0) return ['@timestamp'];
    return dates;
  }, [fieldMap]);

  useEffect(() => {
    if (dateFields.length > 0 && !dateFields.includes(thresholdValues.timeField)) {
      onThresholdValuesChange({ ...thresholdValues, timeField: dateFields[0] });
    }
  }, [dateFields, thresholdValues, onThresholdValuesChange]);

  const esqlQuery = useMemo(() => buildThresholdEsql(thresholdValues), [thresholdValues]);
  const recoveryBlock = useMemo(() => buildRecoveryBlock(thresholdValues), [thresholdValues]);

  // Rebuild and commit ES|QL whenever form values change. state.queryCommitted is read to
  // invalidate when the derived query becomes empty; commit only when not yet committed.
  useEffect(() => {
    if (!esqlQuery) {
      if (state.queryCommitted) {
        dispatch({ type: 'INVALIDATE_QUERY' });
      }
      return;
    }

    if (isAlert) {
      const { base, alertBlock } = splitQuery(esqlQuery);
      setValue('query', {
        format: 'composed',
        base,
        breach: {
          segment: alertBlock,
        },
        ...(recoveryBlock ? { recovery: { segment: recoveryBlock } } : {}),
      });
    } else {
      setValue('query', { format: 'standalone', breach: { query: esqlQuery } });
    }
    setValue('timeField', thresholdValues.timeField);
    if (thresholdValues.groupByFields.length > 0) {
      setValue('grouping', { fields: thresholdValues.groupByFields });
    } else {
      setValue('grouping', undefined);
    }

    if (!state.queryCommitted) {
      dispatch({ type: 'COMMIT_QUERY' });
    }
  }, [
    thresholdValues,
    esqlQuery,
    recoveryBlock,
    isAlert,
    setValue,
    dispatch,
    state.queryCommitted,
  ]);

  const update = useCallback(
    <K extends keyof ThresholdFormValues>(field: K, value: ThresholdFormValues[K]) => {
      onThresholdValuesChange({ ...thresholdValues, [field]: value });
    },
    [thresholdValues, onThresholdValuesChange]
  );

  // ── Stat helpers ──
  const updateStat = useCallback(
    (index: number, updates: Partial<StatDefinition>) => {
      const oldLabel = thresholdValues.stats[index].label;
      const next = [...thresholdValues.stats];
      next[index] = { ...next[index], ...updates };
      // Auto-derive label when aggregation or field changes, but not when
      // the user is explicitly editing the label.
      if (('aggregation' in updates || 'field' in updates) && !('label' in updates)) {
        const s = next[index];
        next[index] = { ...s, label: deriveStatLabel(s.aggregation, s.field) };
      }
      const newLabel = next[index].label;
      const statLabels = thresholdValues.stats.map((s) => s.label);
      const updatedConditions = syncConditionsForLabelChange(
        thresholdValues.alertConditions,
        statLabels,
        index,
        oldLabel,
        newLabel,
        next,
        thresholdValues.evaluations
      );
      onThresholdValuesChange({
        ...thresholdValues,
        stats: next,
        alertConditions: updatedConditions,
      });
    },
    [thresholdValues, onThresholdValuesChange]
  );

  const addStat = useCallback(() => {
    const existingLabels = thresholdValues.stats.map((s) => s.label);
    const label = nextStatLabel(existingLabels, DEFAULT_STAT.aggregation);
    onThresholdValuesChange({
      ...thresholdValues,
      stats: [...thresholdValues.stats, { id: generateId(), ...DEFAULT_STAT, label }],
    });
  }, [thresholdValues, onThresholdValuesChange]);

  const removeStat = useCallback(
    (index: number) => {
      const removedLabel = thresholdValues.stats[index].label;
      const next = thresholdValues.stats.filter((_, i) => i !== index);
      const remainingStats = next.length ? next : [{ id: generateId(), ...DEFAULT_STAT }];
      const cleanedConditions = reconcileAlertConditionMetrics(
        clearConditionsForRemovedMetric(
          thresholdValues.alertConditions,
          removedLabel,
          remainingStats,
          thresholdValues.evaluations
        ),
        remainingStats,
        thresholdValues.evaluations
      );
      onThresholdValuesChange({
        ...thresholdValues,
        stats: remainingStats,
        alertConditions: cleanedConditions,
      });
    },
    [thresholdValues, onThresholdValuesChange]
  );

  // ── Evaluation helpers ──
  const addEvaluation = useCallback(() => {
    const existingLabels = thresholdValues.evaluations.map((e) => e.label);
    onThresholdValuesChange({
      ...thresholdValues,
      evaluations: [
        ...thresholdValues.evaluations,
        { id: generateId(), label: nextEvalLabel(existingLabels), expression: '' },
      ],
    });
  }, [thresholdValues, onThresholdValuesChange]);

  const updateEvaluation = useCallback(
    (index: number, updates: Partial<EvaluationDefinition>) => {
      const oldLabel = thresholdValues.evaluations[index].label;
      const next = [...thresholdValues.evaluations];
      next[index] = { ...next[index], ...updates };
      const newLabel = next[index].label;
      const evalLabels = thresholdValues.evaluations.map((e) => e.label);
      const updatedConditions = syncConditionsForLabelChange(
        thresholdValues.alertConditions,
        evalLabels,
        index,
        oldLabel,
        newLabel,
        thresholdValues.stats,
        next
      );
      onThresholdValuesChange({
        ...thresholdValues,
        evaluations: next,
        alertConditions: updatedConditions,
      });
    },
    [thresholdValues, onThresholdValuesChange]
  );

  const removeEvaluation = useCallback(
    (index: number) => {
      const removedLabel = thresholdValues.evaluations[index].label;
      const remainingEvaluations = thresholdValues.evaluations.filter((_, i) => i !== index);
      const cleanedConditions = reconcileAlertConditionMetrics(
        clearConditionsForRemovedMetric(
          thresholdValues.alertConditions,
          removedLabel,
          thresholdValues.stats,
          remainingEvaluations
        ),
        thresholdValues.stats,
        remainingEvaluations
      );
      onThresholdValuesChange({
        ...thresholdValues,
        evaluations: remainingEvaluations,
        alertConditions: cleanedConditions,
      });
    },
    [thresholdValues, onThresholdValuesChange]
  );

  // ── Alert condition helpers ──
  const metricOptions = useMemo(() => {
    const statLabels = thresholdValues.stats.filter((s) => s.label.trim()).map((s) => s.label);
    const evalLabels = thresholdValues.evaluations
      .filter((e) => e.label.trim())
      .map((e) => e.label);
    return [...statLabels, ...evalLabels];
  }, [thresholdValues.stats, thresholdValues.evaluations]);

  const updateCondition = useCallback(
    (index: number, updates: Partial<AlertCondition>) => {
      const next = [...thresholdValues.alertConditions];
      next[index] = { ...next[index], ...updates };
      onThresholdValuesChange({ ...thresholdValues, alertConditions: next });
    },
    [thresholdValues, onThresholdValuesChange]
  );

  const addCondition = useCallback(() => {
    onThresholdValuesChange({
      ...thresholdValues,
      alertConditions: [
        ...thresholdValues.alertConditions,
        { id: generateId(), ...DEFAULT_ALERT_CONDITION },
      ],
    });
  }, [thresholdValues, onThresholdValuesChange]);

  const removeCondition = useCallback(
    (index: number) => {
      const next = thresholdValues.alertConditions.filter((_, i) => i !== index);
      onThresholdValuesChange({
        ...thresholdValues,
        alertConditions: next.length ? next : [{ id: generateId(), ...DEFAULT_ALERT_CONDITION }],
      });
    },
    [thresholdValues, onThresholdValuesChange]
  );

  return (
    <>
      {/* ── Header with preview icon ── */}
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>
              <FormattedMessage
                id="xpack.alertingV2.ruleBuilder.dataSource.title"
                defaultMessage="Data source"
              />
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={i18n.translate('xpack.alertingV2.ruleBuilder.alertCondition.previewTooltip', {
              defaultMessage: 'Preview results',
            })}
          >
            <EuiButtonIcon
              iconType="inspect"
              aria-label={i18n.translate(
                'xpack.alertingV2.ruleBuilder.alertCondition.previewAriaLabel',
                { defaultMessage: 'Preview results' }
              )}
              isDisabled={state.childOpen}
              onClick={() => dispatch({ type: 'OPEN_CHILD_FOR_STEP', step: state.step, isAlert })}
              data-test-subj="ruleBuilderOpenPreview"
            />
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />

      {/* ── Data Source ── */}
      <EuiFormRow
        label={i18n.translate('xpack.alertingV2.ruleBuilder.indexLabel', {
          defaultMessage: 'Index',
        })}
        fullWidth
      >
        <EuiComboBox
          fullWidth
          compressed
          singleSelection={{ asPlainText: true }}
          isLoading={isLoadingIndices}
          options={indexOptions}
          selectedOptions={
            thresholdValues.indexPattern ? [{ label: thresholdValues.indexPattern }] : []
          }
          onCreateOption={(val) => {
            update('indexPattern', val);
            return true;
          }}
          onChange={(opts) => update('indexPattern', opts[0]?.label ?? '')}
          customOptionText={i18n.translate('xpack.alertingV2.ruleBuilder.indexCustomOption', {
            defaultMessage: 'Use {searchValue} as an index pattern',
            // EuiComboBox replaces {searchValue} at render time; pass the literal token through
            // i18n so FormatJS does not treat it as an ICU variable without a value.
            values: { searchValue: '{searchValue}' },
          })}
          placeholder={i18n.translate('xpack.alertingV2.ruleBuilder.indexPlaceholder', {
            defaultMessage: 'Enter index pattern (e.g. logs-*)',
          })}
          data-test-subj="ruleBuilderIndexField"
        />
      </EuiFormRow>
      <EuiSpacer size="m" />

      <EuiFormRow
        label={i18n.translate('xpack.alertingV2.ruleBuilder.timeFieldLabel', {
          defaultMessage: 'Time field',
        })}
        fullWidth
      >
        <EuiSelect
          fullWidth
          compressed
          options={dateFields.map((name) => ({ value: name, text: name }))}
          value={thresholdValues.timeField}
          onChange={(e) => update('timeField', e.target.value)}
          data-test-subj="ruleBuilderTimeField"
        />
      </EuiFormRow>
      <EuiSpacer size="m" />

      <EuiFormRow
        label={i18n.translate('xpack.alertingV2.ruleBuilder.groupByLabel', {
          defaultMessage: 'Group by',
        })}
        fullWidth
      >
        <EuiComboBox
          fullWidth
          compressed
          options={allFields.map((name) => ({ label: name }))}
          selectedOptions={thresholdValues.groupByFields.map((f) => ({ label: f }))}
          onChange={(opts) =>
            update(
              'groupByFields',
              opts.map((o) => o.label)
            )
          }
          onCreateOption={(val) => update('groupByFields', [...thresholdValues.groupByFields, val])}
          placeholder={i18n.translate('xpack.alertingV2.ruleBuilder.groupByPlaceholder', {
            defaultMessage: 'Add group-by fields',
          })}
          data-test-subj="ruleBuilderGroupBy"
        />
      </EuiFormRow>
      <EuiSpacer size="m" />

      <EuiFormRow
        label={i18n.translate('xpack.alertingV2.ruleBuilder.filterLabel', {
          defaultMessage: 'Filter (optional)',
        })}
        fullWidth
      >
        <EuiFieldText
          fullWidth
          compressed
          value={thresholdValues.filterQuery ?? ''}
          onChange={(e) => update('filterQuery', e.target.value || undefined)}
          placeholder={i18n.translate('xpack.alertingV2.ruleBuilder.filterPlaceholder', {
            defaultMessage: 'e.g. service.name == "api"',
          })}
          data-test-subj="ruleBuilderFilter"
        />
      </EuiFormRow>

      {/* ── Stats ── */}
      <EuiSpacer size="m" />
      <EuiTitle size="xxs">
        <h4>
          <FormattedMessage id="xpack.alertingV2.ruleBuilder.statsTitle" defaultMessage="Stats" />
        </h4>
      </EuiTitle>
      <EuiSpacer size="s" />

      {thresholdValues.stats.map((stat, idx) => {
        const isLabelInvalid = !isStatLabelValid(stat);
        const statRequiresField = AGGREGATIONS_REQUIRING_FIELD.includes(stat.aggregation);
        const isFieldInvalid = statRequiresField && !isStatFieldValid(stat);
        const hasStatRowValidationError = isLabelInvalid || isFieldInvalid;

        return (
          <React.Fragment key={stat.id}>
            <EuiPanel paddingSize="s" hasBorder>
              <EuiFlexGroup gutterSize="s" alignItems="flexStart" wrap>
                <EuiFlexItem grow={2}>
                  <EuiFormRow
                    label={i18n.translate('xpack.alertingV2.ruleBuilder.stats.aggregationLabel', {
                      defaultMessage: 'Aggregation',
                    })}
                    fullWidth
                  >
                    <EuiSelect
                      fullWidth
                      compressed
                      options={AGGREGATION_OPTIONS}
                      value={stat.aggregation}
                      onChange={(e) =>
                        updateStat(idx, {
                          aggregation: e.target.value as Aggregation,
                          field:
                            (e.target.value as Aggregation) === 'count' ? undefined : stat.field,
                        })
                      }
                      data-test-subj={`ruleBuilderStatAgg-${idx}`}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
                {statRequiresField && (
                  <EuiFlexItem grow={3}>
                    <EuiFormRow
                      label={i18n.translate('xpack.alertingV2.ruleBuilder.stats.fieldLabel', {
                        defaultMessage: 'Field',
                      })}
                      isInvalid={isFieldInvalid}
                      fullWidth
                    >
                      <EuiComboBox
                        fullWidth
                        compressed
                        singleSelection={{ asPlainText: true }}
                        options={numericFields.map((name) => ({ label: name }))}
                        selectedOptions={stat.field ? [{ label: stat.field }] : []}
                        onChange={(opts) => updateStat(idx, { field: opts[0]?.label })}
                        placeholder={i18n.translate(
                          'xpack.alertingV2.ruleBuilder.stats.fieldPlaceholder',
                          { defaultMessage: 'Select field' }
                        )}
                        isInvalid={isFieldInvalid}
                        data-test-subj={`ruleBuilderStatField-${idx}`}
                      />
                    </EuiFormRow>
                  </EuiFlexItem>
                )}
                <EuiFlexItem grow={2}>
                  <EuiFormRow
                    label={i18n.translate('xpack.alertingV2.ruleBuilder.stats.labelLabel', {
                      defaultMessage: 'Label',
                    })}
                    isInvalid={isLabelInvalid}
                    fullWidth
                  >
                    <EuiFieldText
                      fullWidth
                      compressed
                      value={stat.label}
                      onChange={(e) => updateStat(idx, { label: e.target.value })}
                      isInvalid={isLabelInvalid}
                      data-test-subj={`ruleBuilderStatLabel-${idx}`}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
                {thresholdValues.stats.length > 1 && (
                  <EuiFlexItem grow={false}>
                    <EuiFormRow hasEmptyLabelSpace>
                      <EuiToolTip
                        content={i18n.translate('xpack.alertingV2.ruleBuilder.stats.removeStat', {
                          defaultMessage: 'Remove stat',
                        })}
                        disableScreenReaderOutput
                      >
                        <EuiButtonIcon
                          iconType="trash"
                          color="danger"
                          aria-label={i18n.translate(
                            'xpack.alertingV2.ruleBuilder.stats.removeStat',
                            {
                              defaultMessage: 'Remove stat',
                            }
                          )}
                          onClick={() => removeStat(idx)}
                          data-test-subj={`ruleBuilderRemoveStat-${idx}`}
                        />
                      </EuiToolTip>
                    </EuiFormRow>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
              {/* Errors live in a second row because EuiFormRow only renders error text when
                  isInvalid is set, which would misalign sibling columns in the row above. Keep
                  grow values in sync with the input row when changing this layout. */}
              {hasStatRowValidationError && (
                <EuiFlexGroup gutterSize="s" responsive={false}>
                  <EuiFlexItem grow={2} />
                  {statRequiresField && (
                    <EuiFlexItem grow={3}>
                      {isFieldInvalid ? (
                        <EuiFormErrorText>{STAT_FIELD_REQUIRED_ERROR}</EuiFormErrorText>
                      ) : null}
                    </EuiFlexItem>
                  )}
                  <EuiFlexItem grow={2}>
                    {isLabelInvalid ? (
                      <EuiFormErrorText>{STAT_LABEL_REQUIRED_ERROR}</EuiFormErrorText>
                    ) : null}
                  </EuiFlexItem>
                  {thresholdValues.stats.length > 1 && <EuiFlexItem grow={false} />}
                </EuiFlexGroup>
              )}
              {/* Per-stat filter */}
              <EuiSpacer size="xs" />
              <EuiFormRow
                label={i18n.translate('xpack.alertingV2.ruleBuilder.stats.filterLabel', {
                  defaultMessage: 'Filter (optional)',
                })}
                fullWidth
              >
                <EuiFieldText
                  fullWidth
                  compressed
                  value={stat.filter ?? ''}
                  onChange={(e) => updateStat(idx, { filter: e.target.value || undefined })}
                  placeholder={i18n.translate(
                    'xpack.alertingV2.ruleBuilder.stats.filterPlaceholder',
                    { defaultMessage: 'e.g. status >= 500' }
                  )}
                  data-test-subj={`ruleBuilderStatFilter-${idx}`}
                />
              </EuiFormRow>
            </EuiPanel>
            <EuiSpacer size="s" />
          </React.Fragment>
        );
      })}
      <EuiButtonEmpty
        size="s"
        iconType="plusInCircle"
        onClick={addStat}
        data-test-subj="ruleBuilderAddStat"
      >
        <FormattedMessage
          id="xpack.alertingV2.ruleBuilder.stats.addStatButton"
          defaultMessage="Add stat"
        />
      </EuiButtonEmpty>

      {/* ── Evaluations ── */}
      <EuiSpacer size="m" />
      <EuiTitle size="xxs">
        <h4>
          <FormattedMessage
            id="xpack.alertingV2.ruleBuilder.evaluationsTitle"
            defaultMessage="Evaluations (optional)"
          />
        </h4>
      </EuiTitle>
      <EuiSpacer size="xs" />
      <EuiText size="xs" color="subdued">
        <FormattedMessage
          id="xpack.alertingV2.ruleBuilder.evaluationsDescription"
          defaultMessage="Define derived expressions referencing stat labels (e.g. error_rate = errors / total * 100)"
        />
      </EuiText>
      <EuiSpacer size="s" />

      {thresholdValues.evaluations.map((ev, idx) => (
        <React.Fragment key={ev.id}>
          <EuiPanel paddingSize="s" hasBorder>
            <EuiFlexGroup gutterSize="s" alignItems="flexEnd">
              <EuiFlexItem grow={2}>
                <EuiFormRow
                  label={i18n.translate('xpack.alertingV2.ruleBuilder.evaluations.labelLabel', {
                    defaultMessage: 'Label',
                  })}
                  fullWidth
                >
                  <EuiFieldText
                    fullWidth
                    compressed
                    value={ev.label}
                    onChange={(e) => updateEvaluation(idx, { label: e.target.value })}
                    data-test-subj={`ruleBuilderEvalLabel-${idx}`}
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem grow={4}>
                <EuiFormRow
                  label={i18n.translate(
                    'xpack.alertingV2.ruleBuilder.evaluations.expressionLabel',
                    { defaultMessage: 'Expression' }
                  )}
                  fullWidth
                >
                  <EuiFieldText
                    fullWidth
                    compressed
                    value={ev.expression}
                    onChange={(e) => updateEvaluation(idx, { expression: e.target.value })}
                    placeholder={i18n.translate(
                      'xpack.alertingV2.ruleBuilder.evaluations.expressionPlaceholder',
                      { defaultMessage: 'e.g. errors / total * 100' }
                    )}
                    data-test-subj={`ruleBuilderEvalExpression-${idx}`}
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={i18n.translate(
                    'xpack.alertingV2.ruleBuilder.evaluations.removeEvaluation',
                    { defaultMessage: 'Remove evaluation' }
                  )}
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    iconType="trash"
                    color="danger"
                    aria-label={i18n.translate(
                      'xpack.alertingV2.ruleBuilder.evaluations.removeEvaluation',
                      { defaultMessage: 'Remove evaluation' }
                    )}
                    onClick={() => removeEvaluation(idx)}
                    data-test-subj={`ruleBuilderRemoveEval-${idx}`}
                  />
                </EuiToolTip>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
          <EuiSpacer size="s" />
        </React.Fragment>
      ))}
      <EuiButtonEmpty
        size="s"
        iconType="plusInCircle"
        onClick={addEvaluation}
        data-test-subj="ruleBuilderAddEvaluation"
      >
        <FormattedMessage
          id="xpack.alertingV2.ruleBuilder.evaluations.addButton"
          defaultMessage="Add evaluation"
        />
      </EuiButtonEmpty>

      {/* ── Alert Conditions ── */}
      <EuiSpacer size="m" />
      <EuiTitle size="xxs">
        <h4>
          <FormattedMessage
            id="xpack.alertingV2.ruleBuilder.thresholdConditionsTitle"
            defaultMessage="Threshold conditions"
          />
        </h4>
      </EuiTitle>
      <EuiSpacer size="s" />

      {thresholdValues.alertConditions.length > 1 && (
        <>
          <EuiButtonGroup
            legend={i18n.translate('xpack.alertingV2.ruleBuilder.alertConditions.operatorLegend', {
              defaultMessage: 'Condition join operator',
            })}
            options={CONDITION_OPERATOR_OPTIONS}
            idSelected={thresholdValues.conditionOperator}
            onChange={(id) => update('conditionOperator', id as 'AND' | 'OR')}
            buttonSize="compressed"
            data-test-subj="ruleBuilderConditionOperator"
          />
          <EuiSpacer size="s" />
        </>
      )}

      {thresholdValues.alertConditions.map((condition, idx) => {
        const isBetween =
          condition.comparator === 'between' || condition.comparator === 'not_between';
        return (
          <React.Fragment key={condition.id}>
            <EuiPanel paddingSize="s" hasBorder>
              <EuiFlexGroup gutterSize="s" alignItems="flexEnd" wrap>
                <EuiFlexItem grow={2}>
                  <EuiFormRow
                    label={i18n.translate(
                      'xpack.alertingV2.ruleBuilder.alertConditions.metricLabel',
                      { defaultMessage: 'When' }
                    )}
                    fullWidth
                  >
                    <EuiSelect
                      fullWidth
                      compressed
                      options={metricOptions.map((m) => ({ value: m, text: m }))}
                      value={condition.metric}
                      onChange={(e) => updateCondition(idx, { metric: e.target.value })}
                      data-test-subj={`ruleBuilderConditionMetric-${idx}`}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
                <EuiFlexItem grow={2}>
                  <EuiFormRow
                    label={i18n.translate(
                      'xpack.alertingV2.ruleBuilder.alertConditions.comparatorLabel',
                      { defaultMessage: 'Is' }
                    )}
                    fullWidth
                  >
                    <EuiSelect
                      fullWidth
                      compressed
                      options={COMPARATOR_OPTIONS}
                      value={condition.comparator}
                      onChange={(e) =>
                        updateCondition(idx, { comparator: e.target.value as Comparator })
                      }
                      data-test-subj={`ruleBuilderConditionComparator-${idx}`}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
                <EuiFlexItem grow={1}>
                  <EuiFormRow
                    label={i18n.translate(
                      'xpack.alertingV2.ruleBuilder.alertConditions.thresholdLabel',
                      { defaultMessage: isBetween ? 'From' : 'Value' }
                    )}
                    fullWidth
                  >
                    <EuiFieldNumber
                      fullWidth
                      compressed
                      value={condition.threshold[0] ?? 0}
                      onChange={(e) =>
                        updateCondition(idx, {
                          threshold: isBetween
                            ? [parseFloat(e.target.value) || 0, condition.threshold[1] ?? 0]
                            : [parseFloat(e.target.value) || 0],
                        })
                      }
                      data-test-subj={`ruleBuilderConditionThreshold-${idx}`}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
                {isBetween && (
                  <EuiFlexItem grow={1}>
                    <EuiFormRow
                      label={i18n.translate(
                        'xpack.alertingV2.ruleBuilder.alertConditions.thresholdToLabel',
                        { defaultMessage: 'To' }
                      )}
                      fullWidth
                    >
                      <EuiFieldNumber
                        fullWidth
                        compressed
                        value={condition.threshold[1] ?? 0}
                        onChange={(e) =>
                          updateCondition(idx, {
                            threshold: [
                              condition.threshold[0] ?? 0,
                              parseFloat(e.target.value) || 0,
                            ],
                          })
                        }
                        data-test-subj={`ruleBuilderConditionThresholdTo-${idx}`}
                      />
                    </EuiFormRow>
                  </EuiFlexItem>
                )}
                {thresholdValues.alertConditions.length > 1 && (
                  <EuiFlexItem grow={false}>
                    <EuiToolTip
                      content={i18n.translate(
                        'xpack.alertingV2.ruleBuilder.alertConditions.removeCondition',
                        { defaultMessage: 'Remove condition' }
                      )}
                      disableScreenReaderOutput
                    >
                      <EuiButtonIcon
                        iconType="trash"
                        color="danger"
                        aria-label={i18n.translate(
                          'xpack.alertingV2.ruleBuilder.alertConditions.removeCondition',
                          { defaultMessage: 'Remove condition' }
                        )}
                        onClick={() => removeCondition(idx)}
                        data-test-subj={`ruleBuilderRemoveCondition-${idx}`}
                      />
                    </EuiToolTip>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiPanel>
            <EuiSpacer size="s" />
          </React.Fragment>
        );
      })}
      <EuiButtonEmpty
        size="s"
        iconType="plusInCircle"
        onClick={addCondition}
        data-test-subj="ruleBuilderAddCondition"
      >
        <FormattedMessage
          id="xpack.alertingV2.ruleBuilder.alertConditions.addButton"
          defaultMessage="Add condition"
        />
      </EuiButtonEmpty>
    </>
  );
};
