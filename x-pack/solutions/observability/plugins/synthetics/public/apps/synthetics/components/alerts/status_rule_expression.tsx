/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiExpression,
  EuiFieldNumber,
  EuiFlexItem,
  EuiFlexGroup,
  EuiPopoverTitle,
  EuiSpacer,
  EuiSwitch,
  EuiTitle,
  EuiHorizontalRule,
  EuiIconTip,
} from '@elastic/eui';
import React, { useCallback } from 'react';
import { ValueExpression } from '@kbn/triggers-actions-ui-plugin/public';
import { i18n } from '@kbn/i18n';
import { GroupByExpression } from './common/group_by_field';
import { WindowValueExpression } from './common/condition_window_value';
import { DEFAULT_CONDITION, ForTheLastExpression } from './common/for_the_last_expression';
import type { StatusRuleParamsProps } from './status_rule_ui';
import { LocationsValueExpression } from './common/condition_locations_value';
import { PopoverExpression } from './common/popover_expression';
import {
  DEFAULT_PENDING_THRESHOLD,
  MIN_PENDING_THRESHOLD,
  MAX_PENDING_THRESHOLD,
  DEFAULT_DOWN_THRESHOLD,
  DEFAULT_LOCATIONS_THRESHOLD,
} from '../../../../../common/rules/status_rule';

interface Props {
  ruleParams: StatusRuleParamsProps['ruleParams'];
  setRuleParams: StatusRuleParamsProps['setRuleParams'];
}

export const StatusRuleExpression: React.FC<Props> = ({ ruleParams, setRuleParams }) => {
  const condition = ruleParams.condition ?? DEFAULT_CONDITION;
  const downThreshold = condition.downThreshold ?? DEFAULT_DOWN_THRESHOLD;
  const pendingThreshold = condition.pendingThreshold ?? DEFAULT_PENDING_THRESHOLD;
  const isAlertOnNoData = ruleParams.condition?.alertOnNoData !== undefined;

  const locationsThreshold = condition.locationsThreshold ?? DEFAULT_LOCATIONS_THRESHOLD;

  const onThresholdChange = useCallback(
    (value: number) => {
      const prevCondition = ruleParams.condition ?? DEFAULT_CONDITION;
      setRuleParams('condition', {
        ...prevCondition,
        downThreshold: value,
      });
    },
    [ruleParams.condition, setRuleParams]
  );

  const onGroupByChange = useCallback(
    (groupByLocation: boolean) => {
      setRuleParams('condition', {
        ...(ruleParams?.condition ?? DEFAULT_CONDITION),
        groupBy: groupByLocation ? 'locationId' : 'none',
      });
    },
    [ruleParams?.condition, setRuleParams]
  );

  const onAlertOnNoDataChange = useCallback(
    (isChecked: boolean) => {
      let newCondition = ruleParams?.condition ?? DEFAULT_CONDITION;
      if (isChecked) {
        newCondition = {
          ...newCondition,
          alertOnNoData: true,
          pendingThreshold: newCondition.pendingThreshold ?? DEFAULT_PENDING_THRESHOLD,
        };
      } else if ('alertOnNoData' in newCondition) {
        const { alertOnNoData: _alertOnNoData, ...rest } = newCondition;
        newCondition = rest;
      } else {
        throw new Error(
          'Switch was unchecked but alertOnNoData was not set, this should not happen'
        );
      }
      setRuleParams('condition', newCondition);
    },
    [ruleParams?.condition, setRuleParams]
  );

  const onPendingThresholdChange = useCallback(
    (value: number) => {
      const prevCondition = ruleParams.condition ?? DEFAULT_CONDITION;
      setRuleParams('condition', {
        ...prevCondition,
        pendingThreshold: value,
      });
    },
    [ruleParams.condition, setRuleParams]
  );

  const onFirstUpRecoveryStrategyChange = useCallback(
    (isChecked: boolean) => {
      let newCondition = ruleParams?.condition ?? DEFAULT_CONDITION;
      newCondition = {
        ...newCondition,
        recoveryStrategy: isChecked ? 'firstUp' : 'conditionNotMet',
      };

      setRuleParams('condition', newCondition);
    },
    [ruleParams?.condition, setRuleParams]
  );

  return (
    <>
      <EuiHorizontalRule size="half" margin="xs" />
      <EuiFlexGroup gutterSize="s" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('xpack.synthetics.rules.status.condition.title', {
                defaultMessage: 'Condition',
              })}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiIconTip
            content={i18n.translate('xpack.synthetics.rule.condition.retests', {
              defaultMessage: 'Retests are included in the number of checks.',
            })}
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem grow={false}>
          <EuiExpression
            aria-label={StatusTranslations.criteriaAriaLabel}
            color="success"
            description={StatusTranslations.criteriaDescription}
            value={StatusTranslations.criteriaValue}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <ValueExpression
            value={downThreshold}
            valueLabel={i18n.translate('xpack.synthetics.rules.status.valueLabel', {
              defaultMessage: '{threshold} times',
              values: { threshold: downThreshold },
            })}
            onChangeSelectedValue={(val) => {
              onThresholdChange(val);
            }}
            description={StatusTranslations.isDownDescription}
            errors={[]}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <ForTheLastExpression ruleParams={ruleParams} setRuleParams={setRuleParams} />
        </EuiFlexItem>
        <EuiFlexItem>
          <WindowValueExpression ruleParams={ruleParams} setRuleParams={setRuleParams} />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="xs" />
      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem>
          <EuiFlexGroup gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiExpression description={StatusTranslations.fromLocationsDescription} />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <LocationsValueExpression ruleParams={ruleParams} setRuleParams={setRuleParams} />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <GroupByExpression
        groupByLocation={ruleParams.condition?.groupBy === 'locationId'}
        onChange={onGroupByChange}
        locationsThreshold={locationsThreshold}
      />
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="s" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiSwitch
            compressed
            label={ALERT_ON_NO_DATA_SWITCH_LABEL}
            checked={isAlertOnNoData}
            onChange={(e) => onAlertOnNoDataChange(e.target.checked)}
            data-test-subj="syntheticsStatusRuleAlertOnNoData"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <PendingThresholdExpression
            value={pendingThreshold}
            disabled={!isAlertOnNoData}
            onChange={onPendingThresholdChange}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="s">
        <EuiFlexItem grow={false}>
          <EuiSwitch
            compressed
            label={FIRST_UP_RECOVERY_STRATEGY_SWITCH_LABEL}
            checked={ruleParams.condition?.recoveryStrategy === 'firstUp'}
            onChange={(e) => onFirstUpRecoveryStrategyChange(e.target.checked)}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiIconTip content={FIRST_UP_RECOVERY_STRATEGY_TOOLTIP} />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="l" />
    </>
  );
};

export const StatusTranslations = {
  criteriaAriaLabel: i18n.translate('xpack.synthetics.rules.status.criteriaExpression.ariaLabel', {
    defaultMessage:
      'An expression displaying the criteria for the monitors that are being watched by this alert',
  }),
  criteriaDescription: i18n.translate(
    'xpack.synthetics.alerts.tls.criteriaExpression.description',
    {
      defaultMessage: 'when',
    }
  ),
  criteriaValue: i18n.translate('xpack.synthetics.status.criteriaExpression.value', {
    defaultMessage: 'monitor',
  }),
  isDownDescription: i18n.translate('xpack.synthetics.status.expirationExpression.description', {
    defaultMessage: 'is down ',
  }),
  fromLocationsDescription: i18n.translate(
    'xpack.synthetics.status.locationsThreshold.description',
    {
      defaultMessage: 'from at least',
    }
  ),
};

const ALERT_ON_NO_DATA_SWITCH_LABEL = i18n.translate(
  'xpack.synthetics.statusRule.euiSwitch.alertOnNoData',
  {
    defaultMessage: "Alert me if there's no data",
  }
);

const PendingThresholdExpression = ({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) => {
  return (
    <PopoverExpression
      disabled={disabled}
      title={i18n.translate('xpack.synthetics.statusRule.pendingThreshold.forDescription', {
        defaultMessage: 'for',
      })}
      value={i18n.translate('xpack.synthetics.rules.status.pendingThresholdValueLabel', {
        defaultMessage:
          '{threshold} {threshold, plural, one {consecutive evaluation} other {consecutive evaluations}}',
        values: { threshold: value },
      })}
    >
      <EuiPopoverTitle>
        {i18n.translate('xpack.synthetics.statusRule.pendingThreshold.popoverTitleLabel', {
          defaultMessage: 'Consecutive evaluations',
        })}
      </EuiPopoverTitle>
      <EuiFieldNumber
        data-test-subj="syntheticsStatusRulePendingThreshold"
        min={MIN_PENDING_THRESHOLD}
        max={MAX_PENDING_THRESHOLD}
        compressed
        value={value}
        onChange={(evt) => {
          const next = Number(evt.target.value);
          onChange(
            Number.isFinite(next)
              ? Math.min(MAX_PENDING_THRESHOLD, Math.max(MIN_PENDING_THRESHOLD, next))
              : MIN_PENDING_THRESHOLD
          );
        }}
      />
    </PopoverExpression>
  );
};

const FIRST_UP_RECOVERY_STRATEGY_SWITCH_LABEL = i18n.translate(
  'xpack.synthetics.statusRule.euiSwitch.firstUpRecoveryStrategy',
  {
    defaultMessage: 'Recover the alert as soon as the monitor is up',
  }
);
const FIRST_UP_RECOVERY_STRATEGY_TOOLTIP = i18n.translate(
  'xpack.synthetics.statusRule.tooltip.firstUpRecoveryStrategy',
  {
    defaultMessage: 'If not selected, the alert will recover when the condition is no longer met',
  }
);
