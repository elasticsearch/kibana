import type * as estypes from '@elastic/elasticsearch/lib/api/types';
import type { IExecutionErrorsResult } from '../../../common';
import type { RulesClientContext } from '../types';
export interface GetActionErrorLogByIdParams {
    id: string;
    dateStart: string;
    dateEnd?: string;
    filter?: string;
    page: number;
    perPage: number;
    sort: estypes.Sort;
    namespace?: string;
}
export declare function getActionErrorLog(context: RulesClientContext, { id, dateStart, dateEnd, filter, page, perPage, sort }: GetActionErrorLogByIdParams): Promise<IExecutionErrorsResult>;
export declare function getActionErrorLogWithAuth(context: RulesClientContext, { id, dateStart, dateEnd, filter, page, perPage, sort, namespace }: GetActionErrorLogByIdParams): Promise<IExecutionErrorsResult>;
