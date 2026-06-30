import type { HttpSetup } from '@kbn/core/public';
import type { SortOrder } from '@elastic/elasticsearch/lib/api/types';
import type { ExecutionLogSortFields, IExecutionLogResult } from '@kbn/alerting-plugin/common';
export type SortField = Record<ExecutionLogSortFields, {
    order: SortOrder;
}>;
export interface LoadExecutionLogAggregationsProps {
    id: string;
    dateStart: string;
    dateEnd?: string;
    outcomeFilter?: string[];
    ruleTypeIds?: string[];
    message?: string;
    perPage?: number;
    page?: number;
    sort?: SortField[];
}
export type LoadGlobalExecutionLogAggregationsProps = Omit<LoadExecutionLogAggregationsProps, 'id'> & {
    namespaces?: Array<string | undefined>;
};
export declare const loadExecutionLogAggregations: ({ id, http, dateStart, dateEnd, outcomeFilter, ruleTypeIds, message, perPage, page, sort, }: LoadExecutionLogAggregationsProps & {
    http: HttpSetup;
}) => Promise<IExecutionLogResult>;
export declare const loadGlobalExecutionLogAggregations: ({ http, dateStart, dateEnd, outcomeFilter, ruleTypeIds, message, perPage, page, sort, namespaces, }: LoadGlobalExecutionLogAggregationsProps & {
    http: HttpSetup;
}) => Promise<IExecutionLogResult>;
