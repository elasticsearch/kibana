import type { DataView } from '@kbn/data-views-plugin/common';
export declare const NO_INDEX_PATTERNS: DataView[];
export declare const ALERTS_SEARCH_BAR_PARAMS_URL_STORAGE_KEY = "searchBarParams";
export declare const RULE_DETAILS_ALERTS_SEARCH_BAR_PARAMS_URL_STORAGE_KEY = "ruleDetailsSearchBarParams";
export declare const RULE_DETAILS_FILTER_CONTROLS_STORAGE_KEY = "ruleDetailsAlerts";
export declare const NON_SIEM_CONSUMERS: ("alerts" | "ml" | "monitoring" | "streams" | "observability" | "discover" | "stackAlerts" | "infrastructure" | "apm" | "logs" | "slo" | "uptime" | "AlertingExample")[];
export declare const RESET_FILTER_CONTROLS_TEST_SUBJ = "resetFilterControlsButton";
export declare const RULE_DETAILS_FILTER_CONTROLS: import("@kbn/alerts-ui-shared").FilterControlConfig[];
