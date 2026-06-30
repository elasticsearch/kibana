import React from 'react';
import { type RuleExecutionStatuses } from '@kbn/alerting-plugin/common';
import type { Rule, RuleType, ActionType } from '../../../../types';
import type { ComponentOpts as BulkOperationsComponentOpts } from '../../common/components/with_bulk_rule_api_operations';
import type { RefreshToken } from './types';
export type RuleDetailsProps = {
    rule: Rule;
    ruleType: RuleType;
    actionTypes: ActionType[];
    requestRefresh: () => Promise<void>;
    refreshToken?: RefreshToken;
} & Pick<BulkOperationsComponentOpts, 'bulkDisableRules' | 'bulkEnableRules' | 'bulkDeleteRules' | 'snoozeRule' | 'unsnoozeRule'>;
export declare const RuleDetails: React.FunctionComponent<RuleDetailsProps>;
export declare function getHealthColor(status: RuleExecutionStatuses): "accent" | "primary" | "success" | "warning" | "danger" | "subdued";
export declare const RuleDetailsWithApi: React.FunctionComponent<import("../../common/components/with_bulk_rule_api_operations").PropsWithOptionalApiHandlers<{
    rule: Rule;
    ruleType: RuleType;
    actionTypes: ActionType[];
    requestRefresh: () => Promise<void>;
    refreshToken?: RefreshToken;
} & Pick<BulkOperationsComponentOpts, "bulkDeleteRules" | "bulkEnableRules" | "bulkDisableRules" | "snoozeRule" | "unsnoozeRule">>>;
