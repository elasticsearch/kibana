import React from 'react';
import type { ActionType, RulesListFilters, UpdateFiltersProps } from '../../../../types';
import type { TypeFilterProps } from './type_filter';
interface RulesListFiltersBarProps {
    actionTypes: ActionType[];
    filterOptions: TypeFilterProps['options'];
    filters: RulesListFilters;
    inputText: string;
    lastUpdate: string;
    rulesLastRunOutcomesTotal: Record<string, number>;
    rulesStatusesTotal: Record<string, number>;
    showActionFilter: boolean;
    showErrors: boolean;
    canLoadRules: boolean;
    refresh?: Date;
    onClearSelection: () => void;
    onRefreshRules: () => void;
    onToggleRuleErrors: () => void;
    setInputText: (text: string) => void;
    updateFilters: (updateFiltersProps: UpdateFiltersProps) => void;
}
export declare const RulesListFiltersBar: React.MemoExoticComponent<(props: RulesListFiltersBarProps) => React.JSX.Element>;
export {};
