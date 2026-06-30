import React from 'react';
import type { RuleCreationValidConsumer } from '@kbn/rule-data-utils';
import type { RuleStatus } from '../../../../types';
export interface RulesListProps {
    ruleTypeIds?: string[];
    consumers?: string[];
    filteredRuleTypes?: string[];
    lastResponseFilter?: string[];
    lastRunOutcomeFilter?: string[];
    refresh?: Date;
    ruleDetailsRoute?: string;
    ruleParamFilter?: Record<string, string | number | object>;
    rulesListKey?: string;
    searchFilter?: string;
    showActionFilter?: boolean;
    showCreateRuleButtonInPrompt?: boolean;
    showSearchBar?: boolean;
    statusFilter?: RuleStatus[];
    typeFilter?: string[];
    visibleColumns?: string[];
    onLastResponseFilterChange?: (lastResponse: string[]) => void;
    onLastRunOutcomeFilterChange?: (lastRunOutcome: string[]) => void;
    onRuleParamFilterChange?: (ruleParams: Record<string, string | number | object>) => void;
    onSearchFilterChange?: (search: string) => void;
    onStatusFilterChange?: (status: RuleStatus[]) => void;
    onTypeFilterChange?: (type: string[]) => void;
    onRefresh?: (refresh: Date) => void;
    initialSelectedConsumer?: RuleCreationValidConsumer | null;
    navigateToEditRuleForm?: (ruleId: string) => void;
    navigateToCreateRuleForm?: (ruleTypeId: string) => void;
}
export declare const percentileFields: {
    P50: string;
    P95: string;
    P99: string;
};
export declare const RulesList: ({ ruleTypeIds, consumers, filteredRuleTypes, lastResponseFilter, lastRunOutcomeFilter, refresh, ruleDetailsRoute, ruleParamFilter, rulesListKey, searchFilter, showActionFilter, showCreateRuleButtonInPrompt, showSearchBar, statusFilter, typeFilter, visibleColumns, onLastResponseFilterChange, onLastRunOutcomeFilterChange, onRuleParamFilterChange, onSearchFilterChange, onStatusFilterChange, onTypeFilterChange, onRefresh, navigateToEditRuleForm, navigateToCreateRuleForm, }: RulesListProps) => React.JSX.Element;
export { RulesList as default };
