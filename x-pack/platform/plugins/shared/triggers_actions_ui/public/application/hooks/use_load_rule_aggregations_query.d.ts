import type { RulesListFilters } from '../../types';
export interface UseLoadRuleAggregationsQueryProps {
    filters: RulesListFilters;
    enabled: boolean;
    ruleTypeIds?: string[];
    consumers?: string[];
    refresh?: Date;
}
export declare const useLoadRuleAggregationsQuery: (props: UseLoadRuleAggregationsQueryProps) => {
    loadRuleAggregations: <TPageData>(options?: (import("@kbn/react-query").RefetchOptions & import("@kbn/react-query").RefetchQueryFilters<TPageData>) | undefined) => Promise<import("@kbn/react-query").QueryObserverResult<import("../lib/rule_api/aggregate_helpers").AggregateRulesResponse, unknown>>;
    rulesStatusesTotal: Record<string, number>;
    rulesLastRunOutcomesTotal: Record<string, number>;
    isLoading: boolean;
};
