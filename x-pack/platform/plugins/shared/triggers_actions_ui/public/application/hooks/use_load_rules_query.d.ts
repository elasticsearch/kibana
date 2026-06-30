import type { Pagination, RulesListFilters } from '../../types';
import type { LoadRulesProps } from '../lib/rule_api';
type UseLoadRulesQueryProps = Omit<LoadRulesProps, 'http'> & {
    filters: RulesListFilters;
    hasDefaultRuleTypesFiltersOn?: boolean;
    onPage: (pagination: Pagination) => void;
    page: LoadRulesProps['page'];
    sort: LoadRulesProps['sort'];
    enabled: boolean;
    refresh?: Date;
    ruleTypeIds?: string[];
    consumers?: string[];
    hasReference?: {
        type: string;
        id: string;
    };
};
export declare const useLoadRulesQuery: (props: UseLoadRulesQueryProps) => {
    rulesState: {
        isLoading: boolean;
        data: import("../../types").Rule[];
        totalItemCount: number;
        initialLoad: boolean;
    };
    lastUpdate: string;
    hasData: boolean;
    loadRules: <TPageData>(options?: (import("@kbn/react-query").RefetchOptions & import("@kbn/react-query").RefetchQueryFilters<TPageData>) | undefined) => Promise<import("@kbn/react-query").QueryObserverResult<{
        page: number;
        perPage: number;
        total: number;
        data: import("../../types").Rule[];
    }, unknown>>;
};
export {};
