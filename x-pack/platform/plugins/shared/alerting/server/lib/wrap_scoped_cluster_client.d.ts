import type { IScopedClusterClient, Logger } from '@kbn/core/server';
import type { SearchMetrics, RuleInfo } from './types';
interface WrapScopedClusterClientFactoryOpts {
    scopedClusterClient: IScopedClusterClient;
    rule: RuleInfo;
    logger: Logger;
    abortController: AbortController;
    requestTimeout?: number;
}
export interface WrappedScopedClusterClient {
    client: () => IScopedClusterClient;
    getMetrics: () => SearchMetrics;
}
export declare function createWrappedScopedClusterClientFactory(opts: WrapScopedClusterClientFactoryOpts): WrappedScopedClusterClient;
export {};
