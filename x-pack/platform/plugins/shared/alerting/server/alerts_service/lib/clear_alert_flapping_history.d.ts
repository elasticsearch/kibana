import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
export interface ClearAlertFlappingHistoryParams {
    indices: string[];
    ruleIds: string[];
}
interface ClearAlertFlappingHistoryParamsWithDeps extends ClearAlertFlappingHistoryParams {
    logger: Logger;
    esClient: ElasticsearchClient;
}
export declare const clearAlertFlappingHistory: (params: ClearAlertFlappingHistoryParamsWithDeps) => Promise<never[] | undefined>;
export {};
