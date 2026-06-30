import React from 'react';
import type { ComponentOpts as RuleApis } from '../../common/components/with_bulk_rule_api_operations';
import type { RefreshToken } from './types';
export interface RuleStatusPanelProps {
    rule: any;
    isEditable: boolean;
    requestRefresh: () => void;
    healthColor: string;
    statusMessage?: string | null;
    refreshToken?: RefreshToken;
    autoRecoverAlerts?: boolean;
}
export type RuleStatusPanelWithApiProps = Pick<RuleApis, 'bulkDisableRules' | 'bulkEnableRules' | 'snoozeRule' | 'unsnoozeRule'> & RuleStatusPanelProps;
export declare const RuleStatusPanel: React.FC<RuleStatusPanelWithApiProps>;
declare const RuleStatusPanelWithApi: React.FunctionComponent<import("../../common/components/with_bulk_rule_api_operations").PropsWithOptionalApiHandlers<Pick<RuleApis, "bulkEnableRules" | "bulkDisableRules" | "snoozeRule" | "unsnoozeRule"> & RuleStatusPanelProps>>;
export { RuleStatusPanelWithApi as default };
