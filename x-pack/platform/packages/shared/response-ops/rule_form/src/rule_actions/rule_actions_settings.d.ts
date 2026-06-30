import React from 'react';
import type { AlertsFilter, AlertsFilterTimeframe, RuleActionFrequency } from '@kbn/alerting-types';
import type { RuleAction } from '../common';
export interface RuleActionsSettingsProps {
    action: RuleAction;
    onUseDefaultMessageChange: () => void;
    onNotifyWhenChange: (frequency: RuleActionFrequency) => void;
    onActionGroupChange: (group: string) => void;
    onAlertsFilterChange: (query?: AlertsFilter['query']) => void;
    onTimeframeChange: (timeframe?: AlertsFilterTimeframe) => void;
}
export declare const RuleActionsSettings: (props: RuleActionsSettingsProps) => React.JSX.Element;
