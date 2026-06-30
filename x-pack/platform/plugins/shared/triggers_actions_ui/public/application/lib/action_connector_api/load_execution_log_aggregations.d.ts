import type { HttpSetup } from '@kbn/core/public';
import type { SortOrder } from '@elastic/elasticsearch/lib/api/types';
import type { ExecutionLogSortFields, IExecutionLogResult } from '@kbn/actions-plugin/common';
export type SortField = Record<ExecutionLogSortFields, {
    order: SortOrder;
}>;
export interface LoadGlobalConnectorExecutionLogAggregationsProps {
    dateStart: string;
    dateEnd?: string;
    outcomeFilter?: string[];
    message?: string;
    perPage?: number;
    page?: number;
    sort?: SortField[];
    namespaces?: Array<string | undefined>;
}
export declare const loadGlobalConnectorExecutionLogAggregations: ({ http, dateStart, dateEnd, outcomeFilter, message, perPage, page, sort, namespaces, }: LoadGlobalConnectorExecutionLogAggregationsProps & {
    http: HttpSetup;
}) => Promise<IExecutionLogResult>;
