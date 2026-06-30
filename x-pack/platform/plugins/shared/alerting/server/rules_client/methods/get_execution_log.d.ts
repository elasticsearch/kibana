import type * as estypes from '@elastic/elasticsearch/lib/api/types';
import type { IExecutionLogResult } from '../../../common';
import type { RulesClientContext } from '../types';
export interface GetExecutionLogByIdParams {
    id: string;
    dateStart: string;
    dateEnd?: string;
    filter?: string;
    page: number;
    perPage: number;
    sort: estypes.Sort;
}
export interface GetGlobalExecutionLogParams {
    dateStart: string;
    dateEnd?: string;
    filter?: string;
    page: number;
    perPage: number;
    sort: estypes.Sort;
    namespaces?: Array<string | undefined>;
}
export declare function getExecutionLogForRule(context: RulesClientContext, { id, dateStart, dateEnd, filter, page, perPage, sort }: GetExecutionLogByIdParams): Promise<IExecutionLogResult>;
export declare function getGlobalExecutionLogWithAuth(context: RulesClientContext, { dateStart, dateEnd, filter, page, perPage, sort, namespaces }: GetGlobalExecutionLogParams): Promise<IExecutionLogResult>;
