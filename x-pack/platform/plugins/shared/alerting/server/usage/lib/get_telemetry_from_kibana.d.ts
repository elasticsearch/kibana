import type { ElasticsearchClient, Logger, ISavedObjectsRepository } from '@kbn/core/server';
import type { AlertingUsage } from '../types';
interface Opts {
    esClient: ElasticsearchClient;
    alertIndex: string;
    logger: Logger;
}
interface MWOpts {
    savedObjectsClient: ISavedObjectsRepository;
    logger: Logger;
    maxDocuments?: number;
}
type GetTotalCountsResults = Pick<AlertingUsage, 'count_total' | 'count_by_type' | 'count_rules_by_execution_status' | 'count_rules_by_notify_when' | 'count_rules_with_tags' | 'count_rules_with_elasticagent_tag' | 'count_rules_with_elasticagent_tag_by_type' | 'count_rules_snoozed' | 'count_rules_snoozed_by_type' | 'count_rules_muted' | 'count_rules_muted_by_type' | 'count_rules_with_muted_alerts' | 'count_rules_with_linked_dashboards' | 'count_rules_with_investigation_guide' | 'count_rules_with_api_key_created_by_user' | 'count_connector_types_by_consumers' | 'throttle_time' | 'schedule_time' | 'throttle_time_number_s' | 'schedule_time_number_s' | 'connectors_per_alert'> & {
    errorMessage?: string;
    hasErrors: boolean;
};
type GetMWTelemetryResults = Pick<AlertingUsage, 'count_mw_total' | 'count_mw_with_repeat_toggle_on' | 'count_mw_with_filter_alert_toggle_on'> & {
    errorMessage?: string;
    hasErrors: boolean;
};
interface GetTotalCountInUseResults {
    countTotal: number;
    countByType: Record<string, number>;
    countNamespaces: number;
    errorMessage?: string;
    hasErrors: boolean;
}
export declare function getTotalCountAggregations({ esClient, alertIndex, logger, }: Opts): Promise<GetTotalCountsResults>;
export declare function getTotalCountInUse({ esClient, alertIndex, logger, }: Opts): Promise<GetTotalCountInUseResults>;
export declare function getMWTelemetry({ savedObjectsClient, logger, maxDocuments, }: MWOpts): Promise<GetMWTelemetryResults>;
export {};
