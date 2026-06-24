/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiButtonIcon,
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ComposeFormValues } from '../../compose_form_types';
import type { CustomRecoveryRenderProps } from '../../types';
import { useBuilderState } from '../builder_state_context';
import type { ThresholdFormValues, RecoveryCondition, RecoveryConfig } from './form_types';
import {
  Comparator,
  DEFAULT_RECOVERY_CONDITION,
  deriveRecoveryConditions,
  generateId,
} from './form_types';
import { COMPARATOR_OPTIONS, CONDITION_OPERATOR_OPTIONS } from './translations';
import { buildRecoveryBlock } from './build_esql';

export const BuilderRecoveryForm: React.FC<CustomRecoveryRenderProps> = ({ state, dispatch }) => {
  const { state: builderState, setState: onBuilderStateChange } =
    useBuilderState<ThresholdFormValues>();
  const { setValue, getValues } = useFormContext<ComposeFormValues>();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (builderState.recovery) return;

    const validAlert = builderState.alertConditions.filter(
      (c) => c.metric.trim() && c.threshold.length > 0
    );
    const conditions =
      validAlert.length > 0
        ? deriveRecoveryConditions(validAlert)
        : [{ id: generateId(), ...DEFAULT_RECOVERY_CONDITION }];

    onBuilderStateChange({
      ...builderState,
      recovery: { conditions, conditionOperator: builderState.conditionOperator },
    });
  }, [builderState, onBuilderStateChange]);

  const recoveryConfig = builderState.recovery;

  const generatedRecoveryBlock = useMemo(
    () =>
      recoveryConfig
        ? buildRecoveryBlock({ recovery: recoveryConfig } as ThresholdFormValues)
        : undefined,
    [recoveryConfig]
  );

  useEffect(() => {
    if (!recoveryConfig || !generatedRecoveryBlock) return;
    const current = getValues('query');
    if (current.format !== 'composed') return;
    if (current.recovery?.segment === generatedRecoveryBlock) return;
    setValue('query', {
      ...current,
      recovery: { segment: generatedRecoveryBlock },
    });
  }, [recoveryConfig, generatedRecoveryBlock, getValues, setValue]);

  const hasValidRecoveryBlock = Boolean(generatedRecoveryBlock);

  const metricOptions = useMemo(() => {
    const statLabels = builderState.stats.filter((s) => s.label.trim()).map((s) => s.label);
    const evalLabels = builderState.evaluations.filter((e) => e.label.trim()).map((e) => e.label);
    return [...statLabels, ...evalLabels];
  }, [builderState.stats, builderState.evaluations]);

  const updateRecovery = useCallback(
    (updates: Partial<RecoveryConfig>) => {
      onBuilderStateChange({
        ...builderState,
        recovery: { ...builderState.recovery!, ...updates },
      });
    },
    [builderState, onBuilderStateChange]
  );

  const updateRecoveryCondition = useCallback(
    (index: number, updates: Partial<RecoveryCondition>) => {
      if (!recoveryConfig) return;
      const next = [...recoveryConfig.conditions];
      next[index] = { ...next[index], ...updates };
      updateRecovery({ conditions: next });
    },
    [recoveryConfig, updateRecovery]
  );

  const addRecoveryCondition = useCallback(() => {
    if (!recoveryConfig) return;
    updateRecovery({
      conditions: [
        ...recoveryConfig.conditions,
        { id: generateId(), ...DEFAULT_RECOVERY_CONDITION },
      ],
    });
  }, [recoveryConfig, updateRecovery]);

  const removeRecoveryCondition = useCallback(
    (index: number) => {
      if (!recoveryConfig) return;
      const next = recoveryConfig.conditions.filter((_, i) => i !== index);
      updateRecovery({
        conditions: next.length ? next : [{ id: generateId(), ...DEFAULT_RECOVERY_CONDITION }],
      });
    },
    [recoveryConfig, updateRecovery]
  );

  if (!recoveryConfig) return null;

  return (
    <>
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xxs">
            <h4>
              <FormattedMessage
                id="xpack.alertingV2.composeDiscover.recoveryCondition.thresholdTitle"
                defaultMessage="Recovery threshold conditions"
              />
            </h4>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={i18n.translate(
              'xpack.alertingV2.composeDiscover.recoveryCondition.previewTooltip',
              { defaultMessage: 'Preview results' }
            )}
          >
            <EuiButtonIcon
              iconType="inspect"
              aria-label={i18n.translate(
                'xpack.alertingV2.composeDiscover.recoveryCondition.previewAriaLabel',
                { defaultMessage: 'Preview results' }
              )}
              isDisabled={!hasValidRecoveryBlock || state.childOpen}
              onClick={() =>
                dispatch({
                  type: 'OPEN_CHILD_FOR_STEP',
                  step: state.step,
                  isAlert: true,
                })
              }
              data-test-subj="ruleBuilderRecoveryPreview"
            />
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />

      {recoveryConfig.conditions.length > 1 && (
        <>
          <EuiButtonGroup
            legend={i18n.translate(
              'xpack.alertingV2.composeDiscover.recoveryCondition.operatorLegend',
              { defaultMessage: 'Condition join operator' }
            )}
            options={CONDITION_OPERATOR_OPTIONS}
            idSelected={recoveryConfig.conditionOperator}
            onChange={(id) => updateRecovery({ conditionOperator: id as 'AND' | 'OR' })}
            buttonSize="compressed"
            data-test-subj="ruleBuilderRecoveryConditionOperator"
          />
          <EuiSpacer size="s" />
        </>
      )}

      {recoveryConfig.conditions.map((condition, idx) => {
        const isBetween =
          condition.comparator === Comparator.BETWEEN ||
          condition.comparator === Comparator.NOT_BETWEEN;
        return (
          <React.Fragment key={condition.id}>
            <EuiPanel paddingSize="s" hasBorder>
              <EuiFlexGroup gutterSize="s" alignItems="flexEnd" wrap>
                <EuiFlexItem grow={2}>
                  <EuiFormRow
                    label={i18n.translate(
                      'xpack.alertingV2.composeDiscover.recoveryCondition.metricLabel',
                      { defaultMessage: 'When' }
                    )}
                    fullWidth
                  >
                    <EuiSelect
                      fullWidth
                      compressed
                      options={metricOptions.map((m) => ({
                        value: m,
                        text: m,
                      }))}
                      value={condition.metric}
                      onChange={(e) =>
                        updateRecoveryCondition(idx, {
                          metric: e.target.value,
                        })
                      }
                      data-test-subj={`ruleBuilderRecoveryMetric-${idx}`}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
                <EuiFlexItem grow={2}>
                  <EuiFormRow
                    label={i18n.translate(
                      'xpack.alertingV2.composeDiscover.recoveryCondition.comparatorLabel',
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
                        updateRecoveryCondition(idx, {
                          comparator: e.target.value as Comparator,
                        })
                      }
                      data-test-subj={`ruleBuilderRecoveryComparator-${idx}`}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
                <EuiFlexItem grow={1}>
                  <EuiFormRow
                    label={i18n.translate(
                      'xpack.alertingV2.composeDiscover.recoveryCondition.thresholdLabel',
                      { defaultMessage: isBetween ? 'From' : 'Value' }
                    )}
                    fullWidth
                  >
                    <EuiFieldNumber
                      fullWidth
                      compressed
                      value={condition.threshold[0] ?? 0}
                      onChange={(e) =>
                        updateRecoveryCondition(idx, {
                          threshold: isBetween
                            ? [parseFloat(e.target.value) || 0, condition.threshold[1] ?? 0]
                            : [parseFloat(e.target.value) || 0],
                        })
                      }
                      data-test-subj={`ruleBuilderRecoveryThreshold-${idx}`}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
                {isBetween && (
                  <EuiFlexItem grow={1}>
                    <EuiFormRow
                      label={i18n.translate(
                        'xpack.alertingV2.composeDiscover.recoveryCondition.thresholdToLabel',
                        { defaultMessage: 'To' }
                      )}
                      fullWidth
                    >
                      <EuiFieldNumber
                        fullWidth
                        compressed
                        value={condition.threshold[1] ?? 0}
                        onChange={(e) =>
                          updateRecoveryCondition(idx, {
                            threshold: [
                              condition.threshold[0] ?? 0,
                              parseFloat(e.target.value) || 0,
                            ],
                          })
                        }
                        data-test-subj={`ruleBuilderRecoveryThresholdTo-${idx}`}
                      />
                    </EuiFormRow>
                  </EuiFlexItem>
                )}
                {recoveryConfig.conditions.length > 1 && (
                  <EuiFlexItem grow={false}>
                    <EuiToolTip
                      content={i18n.translate(
                        'xpack.alertingV2.composeDiscover.recoveryCondition.removeCondition',
                        { defaultMessage: 'Remove recovery condition' }
                      )}
                      disableScreenReaderOutput
                    >
                      <EuiButtonIcon
                        iconType="trash"
                        color="danger"
                        aria-label={i18n.translate(
                          'xpack.alertingV2.composeDiscover.recoveryCondition.removeCondition',
                          { defaultMessage: 'Remove recovery condition' }
                        )}
                        onClick={() => removeRecoveryCondition(idx)}
                        data-test-subj={`ruleBuilderRemoveRecoveryCondition-${idx}`}
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
        onClick={addRecoveryCondition}
        data-test-subj="ruleBuilderAddRecoveryCondition"
      >
        <FormattedMessage
          id="xpack.alertingV2.composeDiscover.recoveryCondition.addConditionButton"
          defaultMessage="Add condition"
        />
      </EuiButtonEmpty>
    </>
  );
};
