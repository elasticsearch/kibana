import type { HttpSetup } from '@kbn/core/public';
import type { SortOrder } from '@elastic/elasticsearch/lib/api/types';
import type { IExecutionErrorsResult, ActionErrorLogSortFields } from '@kbn/alerting-plugin/common';
export type SortField = Record<ActionErrorLogSortFields, {
    order: SortOrder;
}>;
export interface LoadActionErrorLogProps {
    id: string;
    runId?: string;
    message?: string;
    dateStart: string;
    dateEnd?: string;
    filter?: string[];
    perPage?: number;
    page?: number;
    sort?: SortField[];
    namespace?: string;
    withAuth?: boolean;
}
export declare const loadActionErrorLog: ({ id, http, dateStart, dateEnd, runId, message, perPage, page, sort, namespace, withAuth, }: LoadActionErrorLogProps & {
    http: HttpSetup;
}) => Promise<IExecutionErrorsResult>;
