import React from 'react';
import type { SettingsStart } from '@kbn/core-ui-settings-browser';
import { type AlertsFilterTimeframe } from '@kbn/alerting-types';
import type { RuleAction } from '../types';
export interface RuleActionsAlertsFilterTimeframeProps {
    action: RuleAction;
    settings: SettingsStart;
    onChange: (update?: AlertsFilterTimeframe) => void;
}
export declare const RuleActionsAlertsFilterTimeframe: React.FC<RuleActionsAlertsFilterTimeframeProps>;
