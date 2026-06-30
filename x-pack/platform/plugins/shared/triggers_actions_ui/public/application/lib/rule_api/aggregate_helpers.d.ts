import type { HttpSetup } from '@kbn/core/public';
import type { AggregateRulesResponseBody } from '@kbn/alerting-plugin/common/routes/rule/apis/aggregate';
import type { RuleStatus } from '../../../types';
export interface AggregateRulesResponse {
    ruleExecutionStatus: Record<string, number>;
    ruleLastRunOutcome: Record<string, number>;
    ruleEnabledStatus: {
        enabled: number;
        disabled: number;
    };
    ruleMutedStatus: {
        muted: number;
        unmuted: number;
    };
    ruleSnoozedStatus: {
        snoozed: number;
    };
    ruleTags: string[];
}
export declare const rewriteBodyRes: ({ rule_execution_status: ruleExecutionStatus, rule_last_run_outcome: ruleLastRunOutcome, rule_enabled_status: ruleEnabledStatus, rule_muted_status: ruleMutedStatus, rule_snoozed_status: ruleSnoozedStatus, rule_tags: ruleTags, }: AggregateRulesResponseBody) => AggregateRulesResponse;
export interface LoadRuleAggregationsProps {
    http: HttpSetup;
    searchText?: string;
    actionTypesFilter?: string[];
    ruleExecutionStatusesFilter?: string[];
    ruleLastRunOutcomesFilter?: string[];
    ruleStatusesFilter?: RuleStatus[];
    tagsFilter?: string[];
    ruleTypeIds?: string[];
    consumers?: string[];
}
