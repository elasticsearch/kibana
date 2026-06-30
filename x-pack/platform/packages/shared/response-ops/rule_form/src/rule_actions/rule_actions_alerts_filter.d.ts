import type { AlertsFilter } from '@kbn/alerting-types';
import React from 'react';
import type { RuleAction } from '../types';
import type { RuleFormPlugins } from '../types';
export interface RuleActionsAlertsFilterProps {
    action: RuleAction;
    onChange: (update?: AlertsFilter['query']) => void;
    appName: string;
    ruleTypeId?: string;
    plugins?: {
        http: RuleFormPlugins['http'];
        notifications: RuleFormPlugins['notifications'];
        unifiedSearch: RuleFormPlugins['unifiedSearch'];
        data: RuleFormPlugins['data'];
    };
}
export declare const RuleActionsAlertsFilter: ({ action, onChange, appName, ruleTypeId, plugins: propsPlugins, }: RuleActionsAlertsFilterProps) => React.JSX.Element;
