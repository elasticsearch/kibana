/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PropsWithChildren } from 'react';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiFormRow, EuiButtonIcon, EuiToolTip, EuiTitle } from '@elastic/eui';
import type { RuleConditionsProps, ActionGroupWithCondition } from './rule_conditions';

export type RuleConditionsGroupProps<ConditionProps> = {
  actionGroup?: ActionGroupWithCondition<ConditionProps, string>;
} & Pick<RuleConditionsProps<ConditionProps, string>, 'onResetConditionsFor'>;

export const RuleConditionsGroup = <ConditionProps extends unknown>({
  actionGroup,
  onResetConditionsFor,
  children,
  ...otherProps
}: PropsWithChildren<RuleConditionsGroupProps<ConditionProps>>) => {
  const removeConditionLabel = i18n.translate(
    'xpack.triggersActionsUI.sections.ruleForm.conditions.removeConditionLabel',
    { defaultMessage: 'Remove' }
  );

  if (!actionGroup) {
    return null;
  }

  return (
    <EuiFormRow
      label={
        <EuiTitle size="s">
          <strong>{actionGroup.name}</strong>
        </EuiTitle>
      }
      fullWidth
      labelAppend={
        onResetConditionsFor &&
        !actionGroup.isRequired && (
          <EuiToolTip content={removeConditionLabel} disableScreenReaderOutput>
            <EuiButtonIcon
              iconType="minusCircle"
              color="danger"
              aria-label={removeConditionLabel}
              onClick={() => onResetConditionsFor(actionGroup)}
            />
          </EuiToolTip>
        )
      }
    >
      {React.isValidElement(children) ? (
        React.cloneElement(React.Children.only(children), {
          actionGroup,
          ...otherProps,
        })
      ) : (
        <></>
      )}
    </EuiFormRow>
  );
};

// eslint-disable-next-line import/no-default-export
export { RuleConditionsGroup as default };
