import type { RulesListFilters } from '../../types';
interface UseUiProps {
    authorizedToReadAnyRules: boolean;
    authorizedToCreateAnyRules: boolean;
    filters: RulesListFilters;
    hasDefaultRuleTypesFiltersOn: boolean;
    isLoadingRuleTypes: boolean;
    isLoadingRules: boolean;
    hasData: boolean;
    isInitialLoadingRuleTypes: boolean;
    isInitialLoadingRules: boolean;
}
export declare const useRulesListUiState: ({ authorizedToReadAnyRules, authorizedToCreateAnyRules, filters, hasDefaultRuleTypesFiltersOn, isLoadingRuleTypes, isLoadingRules, isInitialLoadingRuleTypes, isInitialLoadingRules, hasData, }: UseUiProps) => {
    showSpinner: boolean;
    showRulesList: boolean;
    showNoAuthPrompt: boolean;
    showCreateFirstRulePrompt: boolean;
};
export {};
