export { BASE_ALERTING_API_PATH, INTERNAL_BASE_ALERTING_API_PATH, } from '@kbn/alerting-plugin/common';
export { BASE_ACTION_API_PATH, INTERNAL_BASE_ACTION_API_PATH } from '@kbn/actions-plugin/common';
export type Section = 'connectors' | 'rules' | 'alerts' | 'logs';
export declare const routeToHome = "/";
export declare const routeToConnectors = "/connectors";
export declare const routeToConnectorEdit = "/connectors/:connectorId";
export declare const routeToRules = "/rules";
export declare const routeToLogs = "/logs";
export declare const routeToCreateRule = "/rules/create";
export declare const routeToEditRule = "/rules/edit";
export declare const legacyRouteToAlerts = "/alerts";
export declare const legacyRouteToRuleDetails = "/alert/:alertId";
export declare const recoveredActionGroupMessage: string;
export declare const summaryMessage: string;
export { TIME_UNITS } from './time_units';
export declare enum SORT_ORDERS {
    ASCENDING = "asc",
    DESCENDING = "desc"
}
export declare const DEFAULT_SEARCH_PAGE_SIZE = 10;
export declare const DEFAULT_CONNECTOR_RULES_LIST_PAGE_SIZE = 25;
export declare const DEFAULT_RULE_INTERVAL = "1m";
export declare const RULE_EXECUTION_LOG_COLUMN_IDS: readonly ["rule_id", "rule_name", "space_ids", "id", "timestamp", "execution_duration", "status", "message", "num_active_alerts", "num_new_alerts", "num_recovered_alerts", "num_triggered_actions", "num_generated_actions", "num_succeeded_actions", "num_errored_actions", "total_search_duration", "es_search_duration", "schedule_delay", "timed_out", "maintenance_window_ids"];
export declare const RULE_EXECUTION_LOG_DURATION_COLUMNS: string[];
export declare const RULE_EXECUTION_LOG_ALERT_COUNT_COLUMNS: string[];
export declare const LOCKED_COLUMNS: string[];
export declare const RULE_EXECUTION_DEFAULT_INITIAL_VISIBLE_COLUMNS: string[];
export declare const GLOBAL_EXECUTION_DEFAULT_INITIAL_VISIBLE_COLUMNS: string[];
export declare const DEFAULT_NUMBER_FORMAT = "format:number:defaultPattern";
export declare const CONNECTOR_EXECUTION_LOG_COLUMN_IDS: readonly ["connector_id", "space_ids", "id", "timestamp", "status", "connector_name", "message", "execution_duration", "schedule_delay", "timed_out"];
export declare const CONNECTOR_LOCKED_COLUMNS: string[];
export declare const GLOBAL_CONNECTOR_EXECUTION_DEFAULT_INITIAL_VISIBLE_COLUMNS: string[];
export declare const MULTI_CONSUMER_RULE_TYPE_IDS: string[];
export declare const ALERT_TABLE_GENERIC_CONFIG_ID: string;
export declare const ALERT_TABLE_GLOBAL_CONFIG_ID: string;
