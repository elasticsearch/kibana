/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { RuleNotifyWhen } from '@kbn/alerting-plugin/common';
import {
  RULES_FEATURE_LATEST,
  SECURITY_FEATURE_ID_V5,
} from '@kbn/security-solution-features/constants';
import * as i18n from './translations';

export {
  SecurityPageName,
  ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING,
} from '@kbn/security-solution-navigation';

/**
 * as const
 *
 * The const assertion ensures that type widening does not occur
 * https://mariusschulz.com/blog/literal-type-widening-in-typescript
 * Please follow this convention when adding to this file
 */
export const APP_ID = 'securitySolution' as const;
export const APP_UI_ID = 'securitySolutionUI' as const;
export const ASSISTANT_FEATURE_ID = 'securitySolutionAssistant' as const;
export const ATTACK_DISCOVERY_FEATURE_ID = 'securitySolutionAttackDiscovery' as const;
export const CASES_FEATURE_ID = 'securitySolutionCasesV3' as const;
export const TIMELINE_FEATURE_ID = 'securitySolutionTimeline' as const;
export const NOTES_FEATURE_ID = 'securitySolutionNotes' as const;
export const SERVER_APP_ID = 'siem' as const;
export const SECURITY_FEATURE_ID = SECURITY_FEATURE_ID_V5;
export const RULES_FEATURE_ID = RULES_FEATURE_LATEST;
export { ALERTS_FEATURE_ID } from '@kbn/security-solution-features/constants';
export const APP_NAME = 'Security' as const;
export const APP_ICON_SOLUTION = 'logoSecurity' as const;
export const APP_PATH = `/app/security` as const;
export const APP_INTEGRATIONS_PATH = `/app/integrations` as const;
export const ADD_DATA_PATH = `${APP_INTEGRATIONS_PATH}/browse/security`;
export const ADD_THREAT_INTELLIGENCE_DATA_PATH = `${APP_INTEGRATIONS_PATH}/browse/threat_intel`;
export const DEFAULT_BYTES_FORMAT = 'format:bytes:defaultPattern' as const;
export const DEFAULT_DATE_FORMAT = 'dateFormat' as const;
export const DEFAULT_DATE_FORMAT_TZ = 'dateFormat:tz' as const;
export const DEFAULT_INDEX_KEY = 'securitySolution:defaultIndex' as const;
export const DEFAULT_NUMBER_FORMAT = 'format:number:defaultPattern' as const;
export const DEFAULT_DATA_VIEW_ID = 'security-solution' as const;
export const DEFAULT_ALERT_DATA_VIEW_ID = 'security-solution-alert' as const;
export const DEFAULT_ATTACK_DATA_VIEW_ID = 'security-solution-attack' as const;
export const DEFAULT_TIME_FIELD = '@timestamp' as const;
export const DEFAULT_TIME_RANGE = 'timepicker:timeDefaults' as const;
export const DEFAULT_REFRESH_RATE_INTERVAL = 'timepicker:refreshIntervalDefaults' as const;
export const DEFAULT_APP_TIME_RANGE = 'securitySolution:timeDefaults' as const;
export const DEFAULT_APP_REFRESH_INTERVAL = 'securitySolution:refreshIntervalDefaults' as const;
export const DEFAULT_ALERTS_INDEX = '.alerts-security.alerts' as const;
export const ALERTS_BATCH_MAX_SIZE = 20 as const;
export const DEFAULT_SIGNALS_INDEX = '.siem-signals' as const;
export const DEFAULT_PREVIEW_INDEX = '.preview.alerts-security.alerts' as const;
export const DEFAULT_LISTS_INDEX = '.lists' as const;
export const DEFAULT_ITEMS_INDEX = '.items' as const;
export const DEFAULT_RISK_SCORE_PAGE_SIZE = 10_000 as const;
export const MAX_RISK_SCORE_PAGE_SIZE = 10_000 as const;
// The DEFAULT_MAX_SIGNALS value exists also in `x-pack/platform/plugins/shared/cases/common/constants.ts`
// If either changes, engineer should ensure both values are updated
export const DEFAULT_MAX_SIGNALS = 100 as const;
export const DEFAULT_SEARCH_AFTER_PAGE_SIZE = 100 as const;
export const DEFAULT_ANOMALY_SCORE = 'securitySolution:defaultAnomalyScore' as const;
export const DEFAULT_MAX_TABLE_QUERY_SIZE = 10000 as const;
export const DEFAULT_FROM = 'now/d' as const;
export const DEFAULT_TO = 'now/d' as const;
export const DEFAULT_INTERVAL_PAUSE = true as const;
export const DEFAULT_INTERVAL_TYPE = 'manual' as const;
export const DEFAULT_INTERVAL_VALUE = 300000 as const; // ms
export const DEFAULT_TIMEPICKER_QUICK_RANGES = 'timepicker:quickRanges' as const;
export const SCROLLING_DISABLED_CLASS_NAME = 'scrolling-disabled' as const;
export const NO_ALERT_INDEX = 'no-alert-index-049FC71A-4C2C-446F-9901-37XMC5024C51' as const;
export const ENDPOINT_METADATA_INDEX = 'metrics-endpoint.metadata-*' as const;
export const ENDPOINT_METRICS_INDEX = '.ds-metrics-endpoint.metrics-*' as const;
export const DEFAULT_RULE_REFRESH_INTERVAL_ON = true as const;
export const DEFAULT_RULE_REFRESH_INTERVAL_VALUE = 60000 as const; // ms
export const DEFAULT_RULE_NOTIFICATION_QUERY_SIZE = 100 as const;
export const SECURITY_TAG_NAME = 'Security Solution' as const;
export const SECURITY_TAG_DESCRIPTION = 'Security Solution auto-generated tag' as const;
export const DEFAULT_SPACE_ID = 'default' as const;
export const DEFAULT_RELATIVE_DATE_THRESHOLD = 24 as const;

// Document path where threat indicator fields are expected. Fields are used
// to enrich signals, and are copied to threat.enrichments.
export const DEFAULT_INDICATOR_SOURCE_PATH = 'threat.indicator' as const;
export const ENRICHMENT_DESTINATION_PATH = 'threat.enrichments' as const;
export const DEFAULT_THREAT_INDEX_KEY = 'securitySolution:defaultThreatIndex' as const;
export const DEFAULT_THREAT_INDEX_VALUE = ['logs-ti_*'] as const;
export const DEFAULT_THREAT_MATCH_QUERY = '@timestamp >= "now-30d/d"' as const;

export const EXPLORE_DATA_VIEW_PREFIX = 'explore-data-view' as const;

export const EXPLORE_PATH = '/explore' as const;
export const DASHBOARDS_PATH = '/dashboards' as const;
export const MANAGE_PATH = '/manage' as const;
export const TIMELINES_PATH = '/timelines' as const;
export const CASES_PATH = '/cases' as const;
export const OVERVIEW_PATH = '/overview' as const;
export const ONBOARDING_PATH = '/get_started' as const;
export const DATA_QUALITY_PATH = '/data_quality' as const;
export const REPORTS_PATH = '/reports' as const;
export const AI_VALUE_PATH = `${REPORTS_PATH}/ai_value` as const;
export const DETECTION_RESPONSE_PATH = '/detection_response' as const;
export const DETECTIONS_PATH = '/detections' as const;

// TODO: https://github.com/elastic/kibana/issues/242434
// Investigate possibility of using `detections` instead
export const ALERTS_PATH = '/alerts' as const;
export const ATTACKS_PATH = '/attacks' as const;
export const ALERT_DETECTIONS = '/alert_detections' as const;

export const ALERT_DETAILS_REDIRECT_PATH = `${ALERTS_PATH}/redirect` as const;
export const ATTACK_DETAILS_REDIRECT_PATH = `${ATTACKS_PATH}/redirect` as const;
export const ALERT_SUMMARY_PATH = `/alert_summary` as const;
export const RULES_PATH = '/rules' as const;
export const RULES_LANDING_PATH = `${RULES_PATH}/landing` as const;
export const RULES_ADD_PATH = `${RULES_PATH}/add_rules` as const;
export const RULES_UPDATES = `${RULES_PATH}/updates` as const;
export const RULES_CREATE_PATH = `${RULES_PATH}/create` as const;
export const RULES_CHANGES_HISTORY_PATH = `${RULES_PATH}/id/:ruleId/changes-history` as const;
export const EXCEPTIONS_PATH = '/exceptions' as const;
export const EXCEPTION_LIST_DETAIL_PATH = `${EXCEPTIONS_PATH}/details/:detailName` as const;
export const HOSTS_PATH = '/hosts' as const;
export const ATTACK_DISCOVERY_PATH = '/attack_discovery' as const;
export const ASSET_INVENTORY_PATH = '/asset_inventory' as const;
export const SIEM_READINESS_PATH = '/siem_readiness' as const;
export const USERS_PATH = '/users' as const;
export const KUBERNETES_PATH = '/kubernetes' as const;
export const NETWORK_PATH = '/network' as const;
export const MANAGEMENT_PATH = '/administration' as const;
export const COVERAGE_OVERVIEW_PATH = '/rules_coverage_overview' as const;
export const THREAT_INTELLIGENCE_PATH = '/threat_intelligence' as const;
export const ENDPOINTS_PATH = `${MANAGEMENT_PATH}/endpoints` as const;
export const POLICIES_PATH = `${MANAGEMENT_PATH}/policy` as const;
export const ENDPOINT_EXCEPTIONS_PATH = `${MANAGEMENT_PATH}/endpoint_exceptions` as const;
export const TRUSTED_APPS_PATH = `${MANAGEMENT_PATH}/trusted_apps` as const;
export const TRUSTED_DEVICES_PATH = `${MANAGEMENT_PATH}/trusted_devices` as const;
export const EVENT_FILTERS_PATH = `${MANAGEMENT_PATH}/event_filters` as const;
export const HOST_ISOLATION_EXCEPTIONS_PATH =
  `${MANAGEMENT_PATH}/host_isolation_exceptions` as const;
export const BLOCKLIST_PATH = `${MANAGEMENT_PATH}/blocklist` as const;
export const RESPONSE_ACTIONS_HISTORY_PATH = `${MANAGEMENT_PATH}/response_actions_history` as const;
export const SCRIPT_LIBRARY_PATH = `${MANAGEMENT_PATH}/script_library` as const;
export const ENTITY_ANALYTICS_PATH = '/entity_analytics' as const;
export const ENTITY_ANALYTICS_MANAGEMENT_PATH = `/entity_analytics_management` as const;
export const ENTITY_ANALYTICS_ASSET_CRITICALITY_PATH =
  `/entity_analytics_asset_criticality` as const;
export const ENTITY_ANALYTICS_ENTITY_STORE_MANAGEMENT_PATH =
  `/entity_analytics_entity_store` as const;
export const ENTITY_ANALYTICS_LANDING_PATH = '/entity_analytics_landing' as const;
export const ENTITY_ANALYTICS_PRIVILEGED_USER_MONITORING_PATH =
  '/entity_analytics_privileged_user_monitoring' as const;
export const ENTITY_ANALYTICS_OVERVIEW_PATH = `/entity_analytics_overview` as const;
export const ENTITY_ANALYTICS_HOME_PAGE_PATH = '/entity_analytics_home_page' as const;
export const APP_ALERTS_PATH = `${APP_PATH}${ALERTS_PATH}` as const;
export const APP_CASES_PATH = `${APP_PATH}${CASES_PATH}` as const;
export const APP_ENDPOINTS_PATH = `${APP_PATH}${ENDPOINTS_PATH}` as const;
export const APP_POLICIES_PATH = `${APP_PATH}${POLICIES_PATH}` as const;
export const APP_ENDPOINT_EXCEPTIONS_PATH = `${APP_PATH}${ENDPOINT_EXCEPTIONS_PATH}` as const;
export const APP_MANAGE_PATH = `${APP_PATH}${MANAGE_PATH}` as const;
export const APP_TRUSTED_APPS_PATH = `${APP_PATH}${TRUSTED_APPS_PATH}` as const;
export const APP_TRUSTED_DEVICES_PATH = `${APP_PATH}${TRUSTED_DEVICES_PATH}` as const;
export const APP_EVENT_FILTERS_PATH = `${APP_PATH}${EVENT_FILTERS_PATH}` as const;
export const APP_HOST_ISOLATION_EXCEPTIONS_PATH =
  `${APP_PATH}${HOST_ISOLATION_EXCEPTIONS_PATH}` as const;
export const APP_BLOCKLIST_PATH = `${APP_PATH}${BLOCKLIST_PATH}` as const;
export const APP_RESPONSE_ACTIONS_HISTORY_PATH =
  `${APP_PATH}${RESPONSE_ACTIONS_HISTORY_PATH}` as const;
export const APP_SCRIPT_LIBRARY_PATH = `${APP_PATH}${SCRIPT_LIBRARY_PATH}` as const;
export const NOTES_PATH = `${MANAGEMENT_PATH}/notes` as const;
export const SIEM_MIGRATIONS_PATH = '/siem_migrations' as const;
export const SIEM_MIGRATIONS_MANAGE_PATH = `${SIEM_MIGRATIONS_PATH}/manage` as const;
export const SIEM_MIGRATIONS_LANDING_PATH = `${SIEM_MIGRATIONS_PATH}/landing` as const;
export const SIEM_MIGRATIONS_RULES_PATH = `${SIEM_MIGRATIONS_PATH}/rules` as const;
export const SIEM_MIGRATIONS_DASHBOARDS_PATH = `${SIEM_MIGRATIONS_PATH}/dashboards` as const;

/**
 * Detection engine Health UI paths
 */
export const DE_SPACE_RULES_HEALTH_PATH = `${RULES_PATH}/health` as const;
export const DE_RULE_HEALTH_PATH = `${RULES_PATH}/id/:ruleId/health` as const;

// EASE exclusive paths
export const CONFIGURATIONS_PATH = '/configurations' as const;
export const CONFIGURATIONS_INTEGRATIONS_PATH =
  `${APP_PATH}/${CONFIGURATIONS_PATH}/integrations/browse` as const;

// cloud logs to exclude from default index pattern
export const EXCLUDE_ELASTIC_CLOUD_INDICES = ['-*elastic-cloud-logs-*'];

/** The comma-delimited list of Elasticsearch indices from which the SIEM app collects events */
export const INCLUDE_INDEX_PATTERN = [
  'apm-*-transaction*',
  'auditbeat-*',
  'endgame-*',
  'filebeat-*',
  'logs-*',
  'packetbeat-*',
  'traces-apm*',
  'winlogbeat-*',
];
/** The comma-delimited list of Elasticsearch indices from which the SIEM app collects events, and the exclude index pattern */
export const DEFAULT_INDEX_PATTERN = [...INCLUDE_INDEX_PATTERN, ...EXCLUDE_ELASTIC_CLOUD_INDICES];

/** This Kibana Advanced Setting enables the `Security news` feed widget */
export const ENABLE_NEWS_FEED_SETTING = 'securitySolution:enableNewsFeed' as const;

/** This Kibana Advanced Setting allows users to enable/disable querying cold and frozen data tiers in analyzer */
export const EXCLUDE_COLD_AND_FROZEN_TIERS_IN_ANALYZER =
  'securitySolution:excludeColdAndFrozenTiersInAnalyzer' as const;

/** This Kibana Advanced Setting allows users to enable/disable querying cold and frozen data tiers in alert prevalence */
export const EXCLUDE_COLD_AND_FROZEN_TIERS_IN_PREVALENCE =
  'securitySolution:excludeColdAndFrozenTiersInPrevalence' as const;

/** This Kibana Advanced Setting when turned on keeps the suppression window open when an alert is closed */
export const SUPPRESSION_BEHAVIOR_ON_ALERT_CLOSURE_SETTING =
  'securitySolution:suppressionBehaviorOnAlertClosure' as const;

export enum SUPPRESSION_BEHAVIOR_ON_ALERT_CLOSURE_SETTING_ENUM {
  RestartWindow = 'restart-suppression',
  ContinueWindow = 'continue-until-window-ends',
}

/** This Kibana Advanced Setting sets the auto refresh interval for the detections all rules table */
export const DEFAULT_RULES_TABLE_REFRESH_SETTING = 'securitySolution:rulesTableRefresh' as const;

/** This Kibana Advanced Setting enables the Detection Engine Health UI */
export const ENABLE_DE_HEALTH_UI_SETTING =
  'securitySolution:enableDetectionEngineHealthUI' as const;

/** This Kibana Advanced Setting specifies the URL of the News feed widget */
export const NEWS_FEED_URL_SETTING = 'securitySolution:newsFeedUrl' as const;

/** The default value for News feed widget */
export const NEWS_FEED_URL_SETTING_DEFAULT = 'https://feeds.elastic.co/security-solution' as const;

/** This Kibana Advanced Setting specifies the URLs of `IP Reputation Links`*/
export const IP_REPUTATION_LINKS_SETTING = 'securitySolution:ipReputationLinks' as const;

/** The default value for `IP Reputation Links` */
export const IP_REPUTATION_LINKS_SETTING_DEFAULT = `[
  { "name": "virustotal.com", "url_template": "https://www.virustotal.com/gui/search/{{ip}}" },
  { "name": "talosIntelligence.com", "url_template": "https://talosintelligence.com/reputation_center/lookup?search={{ip}}" }
]`;

/** This Kibana Advanced Setting shows related integrations on the Rules Table */
export const SHOW_RELATED_INTEGRATIONS_SETTING =
  'securitySolution:showRelatedIntegrations' as const;

/** This Kibana Advanced Setting sets minimum log level starting from which execution logs will be written to Event Log */
export const EXTENDED_RULE_EXECUTION_LOGGING_MIN_LEVEL_SETTING =
  'securitySolution:extendedRuleExecutionLoggingMinLevel' as const;

/** This Kibana Advanced Setting allows users to exclude selected data tiers from search during rule execution */
export const EXCLUDED_DATA_TIERS_FOR_RULE_EXECUTION =
  'securitySolution:excludedDataTiersForRuleExecution' as const;

/** This Kibana Advanced Setting allows users to include only selected data stream namespaces in search during rule execution */
export const INCLUDED_DATA_STREAM_NAMESPACES_FOR_RULE_EXECUTION =
  'securitySolution:includedDataStreamNamespacesForRuleExecution' as const;

/** This hidden Kibana Advanced Setting stores gap reason types to exclude from gap monitoring and auto-fill */
export const EXCLUDED_GAP_REASONS_KEY = 'securitySolution:excludedGapReasons' as const;

/** The default value for the included data stream namespaces setting (empty = no filter) */
export const DATA_STREAM_NAMESPACES_DEFAULT_SETTING: string[] = [];

/** This Kibana Advanced Setting allows users to enable/disable the Asset Inventory feature */
export const ENABLE_ASSET_INVENTORY_SETTING = 'securitySolution:enableAssetInventory' as const;

/** This Kibana Advanced Setting allows users to enable/disable the Cloud Connector Feature */
export const ENABLE_CLOUD_CONNECTOR_SETTING = 'securitySolution:enableCloudConnector' as const;

/**
 * Id for the notifications alerting type
 * @deprecated Once we are confident all rules relying on side-car actions SO's have been migrated to SO references we should remove this function
 */
export const LEGACY_NOTIFICATIONS_ID = `siem.notifications` as const;

/**
 * Internal actions route
 */
export const UPDATE_OR_CREATE_LEGACY_ACTIONS = '/internal/api/detection/legacy/notifications';

/**
 * Exceptions management routes
 */
export const SHARED_EXCEPTION_LIST_URL = `/api${EXCEPTIONS_PATH}/shared` as const;

/**
 * Detection engine routes
 */
export const DETECTION_ENGINE_URL = '/api/detection_engine' as const;
export const DETECTION_ENGINE_PRIVILEGES_URL = `${DETECTION_ENGINE_URL}/privileges` as const;
export const DETECTION_ENGINE_INDEX_URL = `${DETECTION_ENGINE_URL}/index` as const;

export const DETECTION_ENGINE_RULES_URL = `${DETECTION_ENGINE_URL}/rules` as const;
export const DETECTION_ENGINE_RULES_URL_FIND = `${DETECTION_ENGINE_RULES_URL}/_find` as const;
export const DETECTION_ENGINE_TAGS_URL = `${DETECTION_ENGINE_URL}/tags` as const;
export const DETECTION_ENGINE_RULES_BULK_ACTION =
  `${DETECTION_ENGINE_RULES_URL}/_bulk_action` as const;
export const DETECTION_ENGINE_RULES_PREVIEW = `${DETECTION_ENGINE_RULES_URL}/preview` as const;
export const DETECTION_ENGINE_RULES_IMPORT_URL = `${DETECTION_ENGINE_RULES_URL}/_import` as const;

export * from './entity_analytics/constants';

export const INTERNAL_DASHBOARDS_URL = `/internal/dashboards` as const;
export const INTERNAL_TAGS_URL = `/internal/tags`;

/**
 * Internal detection engine routes
 */
export const INTERNAL_DETECTION_ENGINE_URL = '/internal/detection_engine' as const;
export const DETECTION_ENGINE_ALERTS_INDEX_URL =
  `${INTERNAL_DETECTION_ENGINE_URL}/signal/index` as const;
export const DETECTION_ENGINE_ALERT_SUGGEST_USERS_URL =
  `${INTERNAL_DETECTION_ENGINE_URL}/users/_find` as const;

/**
 * Extended alerts routes
 */
export const DETECTION_ENGINE_UNIFIED_ALERTS_URL =
  `${INTERNAL_DETECTION_ENGINE_URL}/unified_alerts` as const;
export const DETECTION_ENGINE_SEARCH_UNIFIED_ALERTS_URL =
  `${DETECTION_ENGINE_UNIFIED_ALERTS_URL}/search` as const;
export const DETECTION_ENGINE_SET_UNIFIED_ALERTS_WORKFLOW_STATUS_URL =
  `${DETECTION_ENGINE_UNIFIED_ALERTS_URL}/workflow_status` as const;
export const DETECTION_ENGINE_SET_UNIFIED_ALERTS_TAGS_URL =
  `${DETECTION_ENGINE_UNIFIED_ALERTS_URL}/tags` as const;
export const DETECTION_ENGINE_SET_UNIFIED_ALERTS_ASSIGNEES_URL =
  `${DETECTION_ENGINE_UNIFIED_ALERTS_URL}/assignees` as const;

/**
 * Detection Engine attacks routes (public)
 */
export const DETECTION_ENGINE_ATTACKS_URL = `${DETECTION_ENGINE_URL}/attacks` as const;
export const DETECTION_ENGINE_ATTACKS_SEARCH_URL =
  `${DETECTION_ENGINE_ATTACKS_URL}/search` as const;
export const DETECTION_ENGINE_ATTACKS_STATUS_URL =
  `${DETECTION_ENGINE_ATTACKS_URL}/status` as const;
export const DETECTION_ENGINE_ATTACKS_TAGS_URL = `${DETECTION_ENGINE_ATTACKS_URL}/tags` as const;
export const DETECTION_ENGINE_ATTACKS_ASSIGNEES_URL =
  `${DETECTION_ENGINE_ATTACKS_URL}/assignees` as const;

/**
 * Telemetry detection endpoint for any previews requested of what data we are
 * providing through UI/UX and for e2e tests.
 *   curl http//localhost:5601/internal/security_solution/telemetry
 * to see the contents
 */
export const SECURITY_TELEMETRY_URL = `/internal/security_solution/telemetry` as const;

export const TIMELINE_RESOLVE_URL = '/api/timeline/resolve' as const;
export const TIMELINE_URL = '/api/timeline' as const;
export const TIMELINES_URL = '/api/timelines' as const;
export const INTERNAL_TIMELINES_BY_IDS_URL = '/internal/timelines/_by_ids' as const;
export const TIMELINE_FAVORITE_URL = '/api/timeline/_favorite' as const;
export const TIMELINE_DRAFT_URL = `${TIMELINE_URL}/_draft` as const;
export const TIMELINE_EXPORT_URL = `${TIMELINE_URL}/_export` as const;
export const TIMELINE_IMPORT_URL = `${TIMELINE_URL}/_import` as const;
export const TIMELINE_PREPACKAGED_URL = `${TIMELINE_URL}/_prepackaged` as const;
export const TIMELINE_COPY_URL = `${TIMELINE_URL}/_copy` as const;

export const NOTE_URL = '/api/note' as const;
export const PINNED_EVENT_URL = '/api/pinned_event' as const;

/**
 * This limit exists to maintain some kind of a safety net for how many events we are fetching in total,
 * even though in theory we are only allowing up to 100 notes per document.
 */
export const NOTES_PER_PAGE_HARD_LIMIT = 10000;

/**
 * Default signals index key for kibana.dev.yml
 */
export const SIGNALS_INDEX_KEY = 'signalsIndex' as const;

export const DETECTION_ENGINE_SIGNALS_URL = `${DETECTION_ENGINE_URL}/signals` as const;
export const DETECTION_ENGINE_SIGNALS_STATUS_URL =
  `${DETECTION_ENGINE_SIGNALS_URL}/status` as const;
export const DETECTION_ENGINE_QUERY_SIGNALS_URL = `${DETECTION_ENGINE_SIGNALS_URL}/search` as const;
export const DETECTION_ENGINE_SIGNALS_MIGRATION_URL =
  `${DETECTION_ENGINE_SIGNALS_URL}/migration` as const;
export const DETECTION_ENGINE_SIGNALS_MIGRATION_STATUS_URL =
  `${DETECTION_ENGINE_SIGNALS_URL}/migration_status` as const;
export const DETECTION_ENGINE_SIGNALS_FINALIZE_MIGRATION_URL =
  `${DETECTION_ENGINE_SIGNALS_URL}/finalize_migration` as const;
export const DETECTION_ENGINE_ALERT_TAGS_URL = `${DETECTION_ENGINE_SIGNALS_URL}/tags` as const;
export const DETECTION_ENGINE_ALERT_ASSIGNEES_URL =
  `${DETECTION_ENGINE_SIGNALS_URL}/assignees` as const;

export const ALERTS_AS_DATA_URL = '/internal/rac/alerts' as const;
export const ALERTS_AS_DATA_FIND_URL = `${ALERTS_AS_DATA_URL}/find` as const;

/**
 * Security Integrations routes
 */
export const SECRUTIY_INTEGRATIONS_FLEET_MANAGED_INDEX_TEMPLATES_URL =
  '/internal/fleet_index_templates' as const;

export const SECURITY_INTEGRATIONS_CRIBL_ROUTING_PIPELINE = 'cribl-routing-pipeline' as const;

/**
 * Common naming convention for an unauthenticated user
 */
export const UNAUTHENTICATED_USER = 'Unauthenticated' as const;

/**
 Licensing requirements
 */
export const MINIMUM_ML_LICENSE = 'platinum' as const;
export const MINIMUM_RULE_CUSTOMIZATION_LICENSE = 'enterprise' as const;

/**
 Machine Learning constants
 */
export const ML_GROUP_ID = 'security' as const;
export const LEGACY_ML_GROUP_ID = 'siem' as const;
export const ML_GROUP_IDS = [ML_GROUP_ID, LEGACY_ML_GROUP_ID] as const;

/**
 * Rule Actions
 */
export const NOTIFICATION_THROTTLE_NO_ACTIONS = 'no_actions' as const;
export const NOTIFICATION_THROTTLE_RULE = 'rule' as const;

export const NOTIFICATION_DEFAULT_FREQUENCY = {
  notifyWhen: RuleNotifyWhen.ACTIVE,
  throttle: null,
  summary: true,
};

export const TRANSFORM_STATES = {
  ABORTING: 'aborting',
  FAILED: 'failed',
  INDEXING: 'indexing',
  STARTED: 'started',
  STOPPED: 'stopped',
  STOPPING: 'stopping',
  WAITING: 'waiting',
};

export const WARNING_TRANSFORM_STATES = new Set([
  TRANSFORM_STATES.ABORTING,
  TRANSFORM_STATES.FAILED,
  TRANSFORM_STATES.STOPPED,
  TRANSFORM_STATES.STOPPING,
]);

export const STARTED_TRANSFORM_STATES = new Set([
  TRANSFORM_STATES.INDEXING,
  TRANSFORM_STATES.STARTED,
]);

/**
 * How many rules to update at a time is set to 20 from errors coming from
 * the slow environments such as cloud when the rule updates are > 100 we were
 * seeing timeout issues.
 *
 * Since there is not timeout options at the alerting API level right now, we are
 * at the mercy of the Elasticsearch server client/server default timeouts and what
 * we are doing could be considered a workaround to not being able to increase the timeouts.
 *
 * However, other bad effects and saturation of connections beyond 50 makes this a "noisy neighbor"
 * if we don't limit its number of connections as we increase the number of rules that can be
 * installed at a time.
 *
 * Lastly, we saw weird issues where Chrome on upstream 408 timeouts will re-call the REST route
 * which in turn could create additional connections we want to avoid.
 *
 * See file import_rules_route.ts for another area where 20 was chosen, therefore I chose
 * 20 here to mimic it as well. If you see this re-opened or what similar to it, consider
 * reducing the 20 above to a lower number.
 *
 * See the original ticket here:
 * https://github.com/elastic/kibana/issues/94418
 */
export const MAX_RULES_TO_UPDATE_IN_PARALLEL = 20;

export const LIMITED_CONCURRENCY_ROUTE_TAG_PREFIX = `${APP_ID}:limitedConcurrency`;

/**
 * Max number of rules to display on UI in table (one page of results).
 */
export const RULES_TABLE_MAX_PAGE_SIZE = 100;

/**
 * Local storage keys we use to store the state of our new features tours we currently show in the app.
 *
 * NOTE: As soon as we want to show tours for new features in the upcoming release,
 * we will need to update these constants with the corresponding version.
 */
export const NEW_FEATURES_TOUR_STORAGE_KEYS = {
  AI_RULE_CREATION_MENU: 'securitySolution.rulesManagementPage.aiRuleCreationMenuTour.v9.4',
  RULE_MANAGEMENT_PAGE: 'securitySolution.rulesManagementPage.newFeaturesTour.v9.2',
  TIMELINES: 'securitySolution.security.timelineFlyoutHeader.saveTimelineTour',
  DEFAULT_LLM: `elasticAssistant.elasticLLM.costAwarenessTour.assistantHeader.v8.19.default`,
  ATTACKS_PAGE: 'securitySolution.attacksPage.newFeaturesTour.v9.5',
  ATTACKS_PAGE_CALLOUT: 'securitySolution.attacksPage.tourCalloutDismissed.v9.5',
};

export const RULE_DETAILS_EXECUTION_LOG_TABLE_SHOW_METRIC_COLUMNS_STORAGE_KEY =
  'securitySolution.ruleDetails.ruleExecutionLog.showMetrics.v8.2';

export const RULE_DETAILS_EXECUTION_LOG_TABLE_SHOW_SOURCE_EVENT_TIME_RANGE_STORAGE_KEY =
  'securitySolution.ruleDetails.ruleExecutionLog.showSourceEventTimeRange.v8.15';

export const MAX_NUMBER_OF_NEW_TERMS_FIELDS = 3;

export const BULK_ADD_TO_TIMELINE_LIMIT = 2000;

/** This local storage key stores the `Grid / Event rendered view` selection */
export const ALERTS_TABLE_VIEW_SELECTION_KEY = 'securitySolution.alerts.table.view-selection';

export const VIEW_SELECTION = {
  gridView: 'gridView',
  eventRenderedView: 'eventRenderedView',
} as const;

export const ALERTS_TABLE_REGISTRY_CONFIG_IDS = {
  ALERTS_PAGE: `${APP_ID}-alerts-page`,
  ATTACKS_PAGE: `${APP_ID}-attacks-page`,
  RULE_DETAILS: `${APP_ID}-rule-details`,
  CASE: `${APP_ID}-case`,
  RISK_INPUTS: `${APP_ID}-risk-inputs`,
} as const;

export const DEFAULT_ALERT_TAGS_KEY = 'securitySolution:alertTags' as const;
export const DEFAULT_ALERT_TAGS_VALUE = [
  i18n.DUPLICATE,
  i18n.FALSE_POSITIVE,
  i18n.FURTHER_INVESTIGATION_REQUIRED,
] as const;

export const DEFAULT_DETECTIONS_CLOSE_REASONS_KEY =
  'securitySolution:detectionsCloseReasons' as const;
export const DEFAULT_DETECTIONS_CLOSE_REASONS_VALUE = [] as const;

/**
 * Max length for the comments within security solution
 */
export const MAX_COMMENT_LENGTH = 30000 as const;

/**
 * Max notes count per document in security solution
 */
export const MAX_NOTES_PER_DOCUMENT = 100;

/**
 * Rule gaps
 */
export const MAX_MANUAL_RULE_RUN_LOOKBACK_WINDOW_DAYS = 90;
export const MAX_MANUAL_RULE_RUN_BULK_SIZE = 100;
export const MAX_BULK_FILL_RULE_GAPS_LOOKBACK_WINDOW_DAYS = 90;
export const MAX_BULK_FILL_RULE_GAPS_BULK_SIZE = 100;
/**
 * Max number of rule IDs to request when filtering rules by gap fill status.
 * This protects from exceeding Elasticsearch's max clause count
 */
export const MAX_RULES_WITH_GAPS_TO_FETCH = 1000;
export const MAX_RULES_WITH_GAPS_LIMIT_REACHED_WARNING_TYPE =
  'max_rules_with_gaps_limit_reached' as const;

/*
 * Whether it is a Jest environment
 */
export const JEST_ENVIRONMENT = typeof jest !== 'undefined';

/*
 * The tag to mark promotion rules that are related to EASE integrations
 */
export const PROMOTION_RULE_TAGS = [
  'Promotion', // This is the legacy tag for promotion rules and can be safely removed once promotion rules go live
  'Promotion: External Alerts',
];

/**
 * Essential fields to return for security alerts to reduce context window usage.
 * These fields contain the most relevant information for security analysis.
 */
export const ESSENTIAL_ALERT_FIELDS: string[] = [
  '_id',
  '_index',
  '@timestamp',
  'message',

  /* Host */
  'host.name',
  'host.ip',
  'host.os.name',
  'host.os.version',
  'host.asset.criticality',
  'host.risk.calculated_level',
  'host.risk.calculated_score_norm',

  /* User */
  'user.name',
  'user.domain',
  'user.asset.criticality',
  'user.risk.calculated_level',
  'user.risk.calculated_score_norm',
  'user.target.name',

  /* Service */
  'service.name',
  'service.id',

  /* Entity */
  'entity.id',
  'entity.name',
  'entity.type',
  'entity.sub_type',

  /* Agent */
  'agent.id',

  /* Process */
  'process.name',
  'process.pid',
  'process.args',
  'process.command_line',
  'process.executable',
  'process.exit_code',
  'process.working_directory',
  'process.pe.original_file_name',
  'process.hash.md5',
  'process.hash.sha1',
  'process.hash.sha256',
  'process.code_signature.exists',
  'process.code_signature.signing_id',
  'process.code_signature.status',
  'process.code_signature.subject_name',
  'process.code_signature.trusted',

  /* Process parent */
  'process.parent.name',
  'process.parent.args',
  'process.parent.args_count',
  'process.parent.command_line',
  'process.parent.executable',
  'process.parent.code_signature.exists',
  'process.parent.code_signature.status',
  'process.parent.code_signature.subject_name',
  'process.parent.code_signature.trusted',

  /* File */
  'file.name',
  'file.path',
  'file.hash.sha256',

  /* Groups */
  'group.id',
  'group.name',

  /* Cloud */
  'cloud.provider',
  'cloud.account.name',
  'cloud.service.name',
  'cloud.region',
  'cloud.availability_zone',

  /* Network / DNS */
  'source.ip',
  'destination.ip',
  'network.protocol',
  'dns.question.name',
  'dns.question.type',

  /* Event */
  'event.category',
  'event.action',
  'event.type',
  'event.code',
  'event.dataset',
  'event.module',
  'event.outcome',

  /* Rule (generic) */
  'rule.name',
  'rule.reference',

  /* Kibana alert fields */
  'kibana.alert.uuid',
  'kibana.alert.original_time',
  'kibana.alert.severity',
  'kibana.alert.start',
  'kibana.alert.workflow_status',
  'kibana.alert.reason',
  'kibana.alert.risk_score',
  'kibana.alert.rule.name',
  'kibana.alert.rule.rule_id',
  'kibana.alert.rule.description',
  'kibana.alert.rule.category',
  'kibana.alert.rule.references',
  'kibana.alert.rule.threat.framework',
  'kibana.alert.rule.threat.tactic.id',
  'kibana.alert.rule.threat.tactic.name',
  'kibana.alert.rule.threat.tactic.reference',
  'kibana.alert.rule.threat.technique.id',
  'kibana.alert.rule.threat.technique.name',
  'kibana.alert.rule.threat.technique.reference',
  'kibana.alert.rule.threat.technique.subtechnique.id',
  'kibana.alert.rule.threat.technique.subtechnique.name',
  'kibana.alert.rule.threat.technique.subtechnique.reference',

  /* Threat (top-level) */
  'threat.framework',
  'threat.tactic.id',
  'threat.tactic.name',
  'threat.tactic.reference',
  'threat.technique.id',
  'threat.technique.name',
  'threat.technique.reference',
  'threat.technique.subtechnique.id',
  'threat.technique.subtechnique.name',
  'threat.technique.subtechnique.reference',
] as const;

export enum SecurityAgentBuilderAttachments {
  alert = 'security.alert',
  alerts = 'security.alerts',
  entity = 'security.entity',
  entityAnalyticsDashboard = 'security.entity_analytics_dashboard',
  rule = 'security.rule',
  rulePreview = 'security.rule.preview',
}

export const SECURITY_RULE_ATTACHMENT_ID = 'ai-rule-creation';

export const REGISTER_ALERT_VALIDATION_STEPS_FEATURE_FLAG =
  'securitySolution.registerAlertValidationStepsEnabled' as const;
export const REGISTER_ALERT_VALIDATION_STEP_FEATURE_FLAG_DEFAULT = false as const;
