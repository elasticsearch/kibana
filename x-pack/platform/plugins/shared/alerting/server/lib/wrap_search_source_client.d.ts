import type { Logger } from '@kbn/core/server';
import type { ISearchStartSearchSource } from '@kbn/data-plugin/common';
import type { RuleInfo, SearchMetrics } from './types';
interface Props {
    logger: Logger;
    rule: RuleInfo;
    abortController: AbortController;
    searchSourceClient: ISearchStartSearchSource;
    requestTimeout?: number;
}
export interface WrappedSearchSourceClient {
    searchSourceClient: ISearchStartSearchSource;
    getMetrics: () => SearchMetrics;
}
export declare function wrapSearchSourceClient({ logger, rule, abortController, searchSourceClient: pureSearchSourceClient, requestTimeout, }: Props): WrappedSearchSourceClient;
export {};
