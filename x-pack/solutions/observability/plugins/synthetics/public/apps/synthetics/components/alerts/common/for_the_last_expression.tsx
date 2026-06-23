/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  EuiExpression,
  EuiPopover,
  EuiPopoverTitle,
  EuiSelectable,
  useGeneratedHtmlId,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { StatusRuleCondition } from '@kbn/response-ops-rule-params/synthetics_monitor_status';
import { getConditionType } from '../../../../../../common/rules/status_rule';
import type { StatusRuleParamsProps } from '../status_rule_ui';

interface Props {
  ruleParams: StatusRuleParamsProps['ruleParams'];
  setRuleParams: StatusRuleParamsProps['setRuleParams'];
}

export const WITHIN_TOTAL_CHECKS_LABEL = i18n.translate(
  'xpack.synthetics.monitorStatusRule.withinTotalChecks.label',
  {
    defaultMessage: 'Within total checks',
  }
);

export const WITHIN_TOTAL_CHECKS_EXPRESSION = i18n.translate(
  'xpack.synthetics.monitorStatusRule.withinTotalChecks.expression',
  {
    defaultMessage: 'Within the last',
  }
);

export const WITHIN_TIMERANGE_EXPRESSION = i18n.translate(
  'xpack.synthetics.monitorStatusRule.withinTimerange.expression',
  {
    defaultMessage: 'Within the last',
  }
);

export const WITHIN_TIMERANGE_LABEL = i18n.translate(
  'xpack.synthetics.monitorStatusRule.withinTimerange.label',
  {
    defaultMessage: 'Within timerange',
  }
);

interface Option {
  label: string;
  key: 'checksWindow' | 'timeWindow' | 'locations';
}

const OPTIONS: Option[] = [
  {
    label: WITHIN_TOTAL_CHECKS_LABEL,
    key: 'checksWindow',
  },
  {
    label: WITHIN_TIMERANGE_LABEL,
    key: 'timeWindow',
  },
];

export const DEFAULT_CONDITION = {
  window: { numberOfChecks: 5 },
  groupBy: 'locationId',
  downThreshold: 3,
  locationsThreshold: 1,
  recoveryStrategy: 'firstUp' as const,
};
const getCheckedOption = (option: Option, condition?: StatusRuleCondition) => {
  const { useTimeWindow, isLocationBased } = getConditionType(condition);

  if (isLocationBased && option.key === 'locations') {
    return 'on';
  }

  if (option.key === 'timeWindow' && useTimeWindow && !isLocationBased) {
    return 'on';
  }
  if (option.key === 'checksWindow' && !useTimeWindow && !isLocationBased) {
    return 'on';
  }

  return undefined;
};

export const ForTheLastExpression = ({ ruleParams, setRuleParams }: Props) => {
  const { condition } = ruleParams;

  const { useTimeWindow } = getConditionType(condition);

  const [isOpen, setIsOpen] = useState(false);
  const forTheLastPopoverTitleId = useGeneratedHtmlId();

  const [options, setOptions] = useState<Option[]>(OPTIONS);

  useEffect(() => {
    if (!condition) {
      setRuleParams('condition', DEFAULT_CONDITION);
    }
  }, [condition, setRuleParams]);

  useEffect(() => {
    setOptions(
      OPTIONS.map((option) => ({
        key: option.key as 'checksWindow' | 'timeWindow',
        label: option.label,
        checked: getCheckedOption(option, condition),
      }))
    );
  }, [condition, useTimeWindow]);

  const getDescriptiveText = () => {
    if (useTimeWindow) {
      return WITHIN_TIMERANGE_EXPRESSION;
    }
    return WITHIN_TOTAL_CHECKS_EXPRESSION;
  };

  return (
    <EuiPopover
      id="checkPopover"
      panelPaddingSize="s"
      button={
        <EuiExpression
          description={getDescriptiveText()}
          isActive={isOpen}
          onClick={() => setIsOpen(!isOpen)}
        />
      }
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
      anchorPosition="downLeft"
      aria-labelledby={forTheLastPopoverTitleId}
    >
      <EuiSelectable<Option>
        singleSelection="always"
        options={options}
        onChange={(selectedValues) => {
          const selectedValue = selectedValues.filter((v) => v.checked === 'on')?.[0];
          switch (selectedValue?.key) {
            case 'checksWindow':
              setRuleParams('condition', {
                ...ruleParams.condition,
                window: { numberOfChecks: 5 },
              });
              break;
            case 'timeWindow':
              setRuleParams('condition', {
                ...ruleParams.condition,
                window: { time: { unit: 'm', size: 5 } },
              });
              break;
            default:
              break;
          }
        }}
      >
        {(list) => (
          <div style={{ width: 240 }}>
            <EuiPopoverTitle id={forTheLastPopoverTitleId}>
              {i18n.translate('xpack.synthetics.forTheLastExpression.whenPopoverTitleLabel', {
                defaultMessage: 'When',
              })}
            </EuiPopoverTitle>
            {list}
          </div>
        )}
      </EuiSelectable>
    </EuiPopover>
  );
};
