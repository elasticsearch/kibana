import type { EuiTableActionsColumnType, EuiTableComputedColumnType, EuiTableFieldDataColumnType } from '@elastic/eui';
import type React from 'react';
import type { RuleTableItem } from '../../../../types';
type RulesListTableColumns = EuiTableFieldDataColumnType<RuleTableItem> | EuiTableComputedColumnType<RuleTableItem> | EuiTableActionsColumnType<RuleTableItem>;
export type RulesListColumns = {
    id?: RulesListVisibleColumns | string;
    selectorName?: string;
} & RulesListTableColumns;
export type RulesListVisibleColumns = 'ruleName' | 'ruleTags' | 'ruleExecutionStatusLastDate' | 'ruleSnoozeNotify' | 'ruleScheduleInterval' | 'ruleExecutionStatusLastDuration' | 'ruleExecutionPercentile' | 'ruleExecutionSuccessRatio' | 'ruleExecutionStatus' | 'ruleExecutionState';
export declare const originalRulesListVisibleColumns: RulesListVisibleColumns[];
interface RulesListColumnSelector {
    allRuleColumns: RulesListColumns[];
    rulesListKey?: string;
    visibleColumns?: string[];
}
type UseRulesListColumnSelector = [RulesListTableColumns[], React.ReactNode];
export declare const useRulesListColumnSelector: ({ allRuleColumns, rulesListKey, visibleColumns, }: RulesListColumnSelector) => UseRulesListColumnSelector;
export {};
