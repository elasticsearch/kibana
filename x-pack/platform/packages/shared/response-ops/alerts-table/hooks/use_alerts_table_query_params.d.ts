import type { Dispatch, SetStateAction } from 'react';
import type { SetRequired } from 'type-fest';
import type { AlertsTableProps, BulkActionsReducerAction } from '../types';
export interface UseAlertsTableQueryParamsOptions extends SetRequired<Pick<AlertsTableProps, 'ruleTypeIds' | 'consumers' | 'projectRouting' | 'query' | 'sort' | 'runtimeMappings' | 'pageIndex' | 'pageSize' | 'minScore' | 'trackScores'>, 'sort'> {
    fields: Array<{
        field: string;
        include_unmapped: boolean;
    }>;
    dispatchBulkAction: Dispatch<BulkActionsReducerAction>;
    setPageIndex: Dispatch<SetStateAction<number>>;
}
/**
 * Manages the query params state for the alerts table, resetting the page index to zero and
 * clearing the bulk actions state when the query changes.
 */
export declare const useAlertsTableQueryParams: ({ ruleTypeIds, consumers, projectRouting, fields, query, sort, runtimeMappings, pageIndex, pageSize, minScore, trackScores, dispatchBulkAction, setPageIndex, }: UseAlertsTableQueryParamsOptions) => {
    ruleTypeIds: string[];
    consumers: string[] | undefined;
    projectRouting: import("@kbn/es-query").ProjectRouting;
    fields: {
        field: string;
        include_unmapped: boolean;
    }[];
    query: Pick<NonNullable<import("@kbn/data-views-plugin/common/types").QueryDslQueryContainer>, "ids" | "bool">;
    sort: import("../types").AlertsTableSortCombinations[];
    runtimeMappings: import("@elastic/elasticsearch/lib/api/types").MappingRuntimeFields | undefined;
    pageIndex: number | undefined;
    pageSize: number | undefined;
    minScore: number | undefined;
    trackScores: boolean | undefined;
};
