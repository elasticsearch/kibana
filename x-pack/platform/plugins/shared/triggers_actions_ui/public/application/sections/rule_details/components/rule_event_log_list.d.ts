import React from 'react';
import type { RuleSummary, RuleType } from '../../../../types';
import type { ComponentOpts as RuleApis } from '../../common/components/with_bulk_rule_api_operations';
import type { RefreshToken } from './types';
export type RuleEventLogListOptions = 'stackManagement' | 'default';
export interface RuleEventLogListCommonProps {
    ruleId: string;
    ruleType: RuleType;
    localStorageKey?: string;
    refreshToken?: RefreshToken;
    requestRefresh?: () => Promise<void>;
    loadExecutionLogAggregations?: RuleApis['loadExecutionLogAggregations'];
    fetchRuleSummary?: boolean;
    hideChart?: boolean;
}
export interface RuleEventLogListStackManagementProps {
    ruleSummary: RuleSummary;
    onChangeDuration: (duration: number) => void;
    numberOfExecutions: number;
    isLoadingRuleSummary?: boolean;
}
export type RuleEventLogListProps<T extends RuleEventLogListOptions = 'default'> = T extends 'default' ? RuleEventLogListCommonProps : T extends 'stackManagement' ? RuleEventLogListStackManagementProps & RuleEventLogListCommonProps : never;
export declare const RuleEventLogList: <T extends RuleEventLogListOptions>(props: RuleEventLogListProps<T>) => React.JSX.Element;
export { RuleEventLogList as default };
