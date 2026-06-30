import type { IntervalSchedule } from '@kbn/task-manager-plugin/server';
export declare const PROVISION_UIAM_API_KEYS_FLAG = "alerting.rules.provisionUiamApiKeys";
export declare const API_KEY_PROVISIONING_TASK_ID = "api_key_provisioning";
export declare const API_KEY_PROVISIONING_TASK_TYPE = "alerting:api_key_provisioning";
export declare const API_KEY_PROVISIONING_TASK_SCHEDULE: IntervalSchedule;
export declare const TASK_TIMEOUT = "5m";
/** Delay before the next run when more batches are pending (10 minutes) */
export declare const RESCHEDULE_DELAY_MS = 600000;
export declare const TAGS: string[];
export declare const GET_RULES_BATCH_SIZE = 300;
export declare const GET_STATUS_BATCH_SIZE = 500;
/**
 * Max number of rule IDs per KQL `or` clause when building the exclude filter.
 * Keeps each bool.should below Elasticsearch's indices.query.bool.max_clause_count (default 4096).
 */
export declare const EXCLUDE_FILTER_CLAUSE_BATCH_SIZE = 1024;
