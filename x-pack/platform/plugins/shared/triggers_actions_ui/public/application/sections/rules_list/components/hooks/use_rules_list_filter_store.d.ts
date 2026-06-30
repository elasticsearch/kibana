import type { RuleStatus } from '../../../../../common';
import type { RulesListFilters, RulesListProps, UpdateFiltersProps } from '../../../../../types';
type FilterStoreProps = Pick<RulesListProps, 'lastResponseFilter' | 'lastRunOutcomeFilter' | 'rulesListKey' | 'ruleParamFilter' | 'statusFilter' | 'searchFilter' | 'typeFilter'>;
interface FilterParameters {
    actionTypes?: string[];
    lastResponse?: string[];
    params?: Record<string, string | number | object>;
    search?: string;
    status?: RuleStatus[];
    tags?: string[];
    type?: string[];
}
export declare const convertRulesListFiltersToFilterAttributes: (rulesListFilter: RulesListFilters) => FilterParameters;
export declare const useRulesListFilterStore: ({ lastResponseFilter, lastRunOutcomeFilter, rulesListKey, ruleParamFilter, statusFilter, searchFilter, typeFilter, }: FilterStoreProps) => {
    filters: RulesListFilters;
    setFiltersStore: (params: UpdateFiltersProps) => void;
    numberOfFiltersStore: number;
    resetFiltersStore: () => void;
};
export {};
