import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
export interface IsExistingAlertParams {
    indices: string[];
    alertId: string;
    ruleId: string;
}
interface IsExistingAlertParamsWithDeps extends IsExistingAlertParams {
    logger: Logger;
    esClient: ElasticsearchClient;
}
export declare function isExistingAlert({ indices, alertId, ruleId, logger, esClient, }: IsExistingAlertParamsWithDeps): Promise<boolean>;
export {};
