import React from 'react';
import type { RuleNotifyWhenType } from '@kbn/alerting-plugin/common';
import type { ActionTypeRegistryContract } from '../../../..';
import type { RuleUiAction } from '../../../../types';
export interface RuleActionsProps {
    ruleActions: RuleUiAction[];
    actionTypeRegistry: ActionTypeRegistryContract;
    legacyNotifyWhen?: RuleNotifyWhenType | null;
}
export declare function RuleActions({ ruleActions, actionTypeRegistry, legacyNotifyWhen, }: RuleActionsProps): React.JSX.Element;
