import type { BulkRequest, BulkResponse } from '@elastic/elasticsearch/lib/api/types';
import type { Logger, ElasticsearchClient } from '@kbn/core/server';
export declare const REFRESH_FIELDS_ALL: ("kibana.alert.case_ids" | "kibana.alert.status" | "kibana.alert.workflow_status" | "kibana.alert.workflow_tags")[];
export interface ResolveAlertConflictsParams {
    esClient: ElasticsearchClient;
    logger: Logger;
    bulkRequest: BulkRequest<unknown, unknown>;
    bulkResponse: BulkResponse;
    ruleId: string;
    ruleName: string;
    ruleType: string;
}
export declare function resolveAlertConflicts(params: ResolveAlertConflictsParams): Promise<void>;
