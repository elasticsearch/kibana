import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { AlertingUsage } from '../types';
interface Opts {
    esClient: ElasticsearchClient;
    logger: Logger;
}
type GetTotaAlertsCountsResults = Pick<AlertingUsage, 'count_alerts_total' | 'count_alerts_by_rule_type' | 'count_ignored_fields_by_rule_type'> & {
    errorMessage?: string;
    hasErrors: boolean;
};
export declare const AAD_INDEX_PATTERN = ".alerts-*";
export declare function getTotalAlertsCountAggregations({ esClient, logger, }: Opts): Promise<GetTotaAlertsCountsResults>;
export {};
