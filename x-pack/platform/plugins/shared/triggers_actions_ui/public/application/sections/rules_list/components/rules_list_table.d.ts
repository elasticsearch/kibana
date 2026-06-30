import React from 'react';
import type { EuiTableSortingType, EuiSelectableOption } from '@elastic/eui';
import type { Rule, RuleTableItem, RuleTypeIndex, Pagination, TriggersActionsUiConfig, RuleTypeRegistryContract, SnoozeSchedule, BulkOperationResponse } from '../../../../types';
interface RuleTypeState {
    isLoading: boolean;
    isInitialLoad: boolean;
    data: RuleTypeIndex;
}
export interface RuleState {
    isLoading: boolean;
    data: Rule[];
    totalItemCount: number;
}
export declare const percentileFields: {
    P50: string;
    P95: string;
    P99: string;
};
interface ConvertRulesToTableItemsOpts {
    rules: Rule[];
    ruleTypeIndex: RuleTypeIndex;
    canExecuteActions: boolean;
    config: TriggersActionsUiConfig;
}
export interface RulesListTableProps {
    rulesListKey?: string;
    rulesState: RuleState;
    items: RuleTableItem[];
    ruleTypesState: RuleTypeState;
    ruleTypeRegistry: RuleTypeRegistryContract;
    isLoading?: boolean;
    sort: EuiTableSortingType<RuleTableItem>['sort'];
    page: Pagination;
    percentileOptions: EuiSelectableOption[];
    numberOfSelectedRules?: number;
    isPageSelected: boolean;
    isAllSelected: boolean;
    itemIdToExpandedRowMap?: Record<string, React.ReactNode>;
    config: TriggersActionsUiConfig;
    onSort?: (sort: EuiTableSortingType<RuleTableItem>['sort']) => void;
    onPage?: (page: Pagination) => void;
    onRuleClick?: (rule: RuleTableItem) => void;
    onRuleEditClick?: (rule: RuleTableItem) => void;
    onRuleDeleteClick?: (rule: RuleTableItem) => void;
    onManageLicenseClick?: (rule: RuleTableItem) => void;
    onTagClick?: (rule: RuleTableItem) => void;
    onTagClose?: (rule: RuleTableItem) => void;
    onPercentileOptionsChange?: (options: EuiSelectableOption[]) => void;
    onRuleChanged: () => Promise<void>;
    onEnableRule: (rule: RuleTableItem) => Promise<BulkOperationResponse>;
    onDisableRule: (rule: RuleTableItem, untrack: boolean) => Promise<BulkOperationResponse>;
    onSnoozeRule: (rule: RuleTableItem, snoozeSchedule: SnoozeSchedule) => Promise<void>;
    onUnsnoozeRule: (rule: RuleTableItem, scheduleIds?: string[]) => Promise<void>;
    onSelectAll: () => void;
    onSelectPage: () => void;
    onSelectRow: (rule: RuleTableItem) => void;
    isRowSelected: (rule: RuleTableItem) => boolean;
    renderSelectAllDropdown: () => React.ReactNode;
    renderCollapsedItemActions?: (rule: RuleTableItem, onLoading: (isLoading: boolean) => void) => React.ReactNode;
    renderRuleError?: (rule: RuleTableItem) => React.ReactNode;
    visibleColumns?: string[];
    numberOfFilters: number;
    resetFilters: () => void;
}
interface ConvertRulesToTableItemsOpts {
    rules: Rule[];
    ruleTypeIndex: RuleTypeIndex;
    canExecuteActions: boolean;
    config: TriggersActionsUiConfig;
}
export declare function convertRulesToTableItems(opts: ConvertRulesToTableItemsOpts): RuleTableItem[];
export declare const RulesListTable: (props: RulesListTableProps) => React.JSX.Element;
export {};
