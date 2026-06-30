import React from 'react';
import type { RuleNotifyWhenType, RuleAction, RuleActionFrequency } from '@kbn/alerting-types';
import type { EuiSuperSelectOption } from '@elastic/eui';
export interface NotifyWhenSelectOptions {
    isSummaryOption?: boolean;
    isForEachAlertOption?: boolean;
    value: EuiSuperSelectOption<RuleNotifyWhenType>;
}
export declare const NOTIFY_WHEN_OPTIONS: NotifyWhenSelectOptions[];
export interface RuleActionsNotifyWhenProps {
    frequency: RuleAction['frequency'];
    throttle: number | null;
    throttleUnit: string;
    hasAlertsMappings?: boolean;
    showMinimumThrottleWarning?: boolean;
    showMinimumThrottleUnitWarning?: boolean;
    notifyWhenSelectOptions?: NotifyWhenSelectOptions[];
    onChange: (frequency: RuleActionFrequency) => void;
    onUseDefaultMessage: () => void;
    isRecoveredActionGroup?: boolean;
}
export declare const RuleActionsNotifyWhen: ({ hasAlertsMappings, frequency, throttle, throttleUnit, showMinimumThrottleWarning, showMinimumThrottleUnitWarning, notifyWhenSelectOptions, onChange, onUseDefaultMessage, isRecoveredActionGroup, }: RuleActionsNotifyWhenProps) => React.JSX.Element;
