/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiIconTip, EuiText, EuiSpacer, EuiFlexGroup, EuiFlexItem, EuiIcon } from '@elastic/eui';
import type { ActionType, AsApiContract } from '@kbn/actions-plugin/common';
import type { ActionResult } from '@kbn/actions-plugin/server';
import type {
  RuleActionFrequency,
  RuleAction,
  RuleSystemAction,
} from '@kbn/alerting-plugin/common';
import type { ActionTypeRegistryContract } from '@kbn/triggers-actions-ui-plugin/public';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  getTimeTypeValue,
  isRuleAction as getIsRuleAction,
} from '../../../rule_creation_ui/pages/rule_creation/helpers';
import * as i18n from './translations';

const DescriptionLine = ({ children }: { children: React.ReactNode }) => (
  <EuiFlexItem>
    <EuiText size="xs" color="subdued">
      {children}
    </EuiText>
  </EuiFlexItem>
);

export const FrequencyDescription: React.FC<{ frequency?: RuleActionFrequency }> = ({
  frequency,
}) => {
  if (!frequency) {
    return null;
  }

  if (!frequency.summary) {
    return <DescriptionLine>{i18n.FOR_EACH_ALERT_PER_RULE_RUN}</DescriptionLine>;
  }

  if (frequency.notifyWhen === 'onActiveAlert') {
    return <DescriptionLine>{i18n.SUMMARY_OF_ALERTS_PER_RULE_RUN}</DescriptionLine>;
  }

  if (!frequency.throttle) {
    return null;
  }

  const { unit, value } = getTimeTypeValue(frequency.throttle);

  const messagesByUnit: { [unit: string]: JSX.Element } = {
    s: (
      <FormattedMessage
        id="xpack.securitySolution.detectionEngine.ruleDetails.onceInEverySecondsLabel"
        defaultMessage="Once {secondsCount, plural, one {a} other {in every}} {secondsCount, plural, one {second} other {# seconds}}"
        values={{ secondsCount: value }}
      />
    ),
    m: (
      <FormattedMessage
        id="xpack.securitySolution.detectionEngine.ruleDetails.onceInEveryMinutesLabel"
        defaultMessage="Once {minutesCount, plural, one {a} other {in every}} {minutesCount, plural, one {minute} other {# minutes}}"
        values={{ minutesCount: value }}
      />
    ),
    h: (
      <FormattedMessage
        id="xpack.securitySolution.detectionEngine.ruleDetails.onceInEveryHoursLabel"
        defaultMessage="Once {hoursCount, plural, one {an} other {in every}} {hoursCount, plural, one {hour} other {# hours}}"
        values={{ hoursCount: value }}
      />
    ),
    d: (
      <FormattedMessage
        id="xpack.securitySolution.detectionEngine.ruleDetails.onceInEveryDaysLabel"
        defaultMessage="Once {daysCount, plural, one {a} other {in every}} {daysCount, plural, one {day} other {# days}}"
        values={{ daysCount: value }}
      />
    ),
  };

  return <DescriptionLine>{messagesByUnit[unit] || i18n.PERIODICALLY}</DescriptionLine>;
};

interface NotificationActionProps {
  action: RuleAction | RuleSystemAction;
  connectorTypes: ActionType[];
  connectors: Array<AsApiContract<ActionResult>>;
  actionTypeRegistry: ActionTypeRegistryContract;
}

export function NotificationAction({
  action,
  connectorTypes,
  connectors,
  actionTypeRegistry,
}: NotificationActionProps) {
  const isRuleAction = getIsRuleAction(action, actionTypeRegistry);
  const connectorType = connectorTypes.find(({ id }) => id === action.actionTypeId);
  const registeredAction = actionTypeRegistry.get(action.actionTypeId);

  /*
  since there is no "connector" for system actions,
  we need to determine the title based off the action
  properties in order to render helpful text on the
  rule details page.
  */
  const connectorTypeName = isRuleAction
    ? connectorType?.name ?? ''
    : registeredAction.actionTypeTitle ?? '';
  const iconType = registeredAction?.iconClass ?? 'apps';

  const connector = connectors.find(({ id }) => id === action.id);
  const connectorName = (isRuleAction ? connector?.name : registeredAction.actionTypeTitle) ?? '';

  return (
    <EuiFlexItem>
      <EuiFlexGroup alignItems="center" gutterSize="s" component="span" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIconTip
            content={connectorTypeName}
            anchorClassName="eui-textTruncate"
            type={iconType}
            size="m"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="s">{connectorName}</EuiText>
          <EuiFlexGroup alignItems="center" gutterSize="xs" component="span" responsive={false}>
            <EuiSpacer size="xs" />
            <EuiFlexItem grow={false}>
              <EuiIcon size="s" type="bell" color="subdued" aria-hidden={true} />
            </EuiFlexItem>
            {isRuleAction ? (
              <FrequencyDescription frequency={action.frequency} />
            ) : (
              // Display frequency description for system action
              // same text used by stack alerting
              <DescriptionLine>{i18n.SYSTEM_ACTION_FREQUENCY}</DescriptionLine>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
  );
}
