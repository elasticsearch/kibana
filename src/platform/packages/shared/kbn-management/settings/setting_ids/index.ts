/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// General settings
export const DISABLE_REQUEST_BATCHING_ID = 'bfetch:disable';
export const ELASTIC_CONSOLE_ENABLED_SETTING_ID = 'elasticRamen:enabled';
export const DISABLE_BATCH_COMPRESSION_ID = 'bfetch:disableCompression';
export const CSV_QUOTE_VALUES_ID = 'csv:quoteValues';
export const CSV_SEPARATOR_ID = 'csv:separator';
export const DATE_FORMAT_ID = 'dateFormat';
export const DATE_FORMAT_DOW_ID = 'dateFormat:dow';
export const DATE_FORMAT_SCALED_ID = 'dateFormat:scaled';
export const DATE_FORMAT_TZ_ID = 'dateFormat:tz';
export const DATE_FORMAT_NANOS_ID = 'dateNanosFormat';
export const DEFAULT_INDEX_ID = 'defaultIndex';
export const DEFAULT_ROUTE_ID = 'defaultRoute';
export const FIELDS_POPULAR_LIMIT_ID = 'fields:popularLimit';
export const FILE_UPLOAD_MAX_SIZE_ID = 'fileUpload:maxFileSize';
export const FILTER_EDITOR_SUGGEST_VALUES_ID = 'filterEditor:suggestValues';
export const FILTERS_PINNED_BY_DEFAULT_ID = 'filters:pinnedByDefault';
export const FORMAT_BYTES_DEFAULT_PATTERN_ID = 'format:bytes:defaultPattern';
export const FORMAT_CURRENCY_DEFAULT_PATTERN_ID = 'format:currency:defaultPattern';
export const FORMAT_DEFAULT_TYPE_MAP_ID = 'format:defaultTypeMap';
export const FORMAT_NUMBER_DEFAULT_LOCALE_ID = 'format:number:defaultLocale';
export const FORMAT_NUMBER_DEFAULT_PATTERN_ID = 'format:number:defaultPattern';
export const FORMAT_PERCENT_DEFAULT_PATTERN_ID = 'format:percent:defaultPattern';
export const HIDE_ANNOUNCEMENTS_ID = 'hideAnnouncements';
export const HISTOGRAM_BAR_TARGET_ID = 'histogram:barTarget';
export const HISTOGRAM_MAX_BARS_ID = 'histogram:maxBars';
export const HISTORY_LIMIT_ID = 'history:limit';
export const META_FIELDS_ID = 'metaFields';
export const METRICS_ALLOW_STRING_INDICES_ID = 'metrics:allowStringIndices';
export const METRICS_MAX_BUCKETS_ID = 'metrics:max_buckets';
export const QUERY_ALLOW_LEADING_WILDCARDS_ID = 'query:allowLeadingWildcards';
export const QUERY_STRING_OPTIONS_ID = 'query:queryString:options';
export const SAVED_OBJECTS_LISTING_LIMIT_ID = 'savedObjects:listingLimit';
export const SAVED_OBJECTS_PER_PAGE_ID = 'savedObjects:perPage';
export const SEARCH_QUERY_LANGUAGE_ID = 'search:queryLanguage';
export const SHORT_DOTS_ENABLE_ID = 'shortDots:enable';
export const SORT_OPTIONS_ID = 'sort:options';
export const STATE_STORE_IN_SESSION_STORAGE_ID = 'state:storeInSessionStorage';
export const THEME_DARK_MODE_ID = 'theme:darkMode';
export const THEME_NAME_ID = 'theme:name';
export const TIMEPICKER_QUICK_RANGES_ID = 'timepicker:quickRanges';
export const TIMEPICKER_REFRESH_INTERVAL_DEFAULTS_ID = 'timepicker:refreshIntervalDefaults';
export const TIMEPICKER_TIME_DEFAULTS_ID = 'timepicker:timeDefaults';

// Presentation labs settings
export const LABS_CANVAS_BY_VALUE_EMBEDDABLE_ID = 'labs:canvas:byValueEmbeddable';
export const LABS_CANVAS_ENABLE_UI_ID = 'labs:canvas:enable_ui';
export const LABS_DASHBOARD_DEFER_BELOW_FOLD_ID = 'labs:dashboard:deferBelowFold';
export const LABS_DASHBOARDS_ENABLE_UI_ID = 'labs:dashboard:enable_ui';

// Accessibility settings
export const ACCESSIBILITY_DISABLE_ANIMATIONS_ID = 'accessibility:disableAnimations';

// Agent builder settings
export const AGENT_BUILDER_NAV_ENABLED_SETTING_ID = 'agentBuilder:navEnabled';
export const AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID = 'agentBuilder:experimentalFeatures';
export const AGENT_BUILDER_BASH_SUPPORT_SETTING_ID = 'agentBuilder:bashSupport';
export const AGENT_BUILDER_PRE_PROMPT_WORKFLOW_IDS = 'agentBuilder:prePromptWorkflowIds';
export const AGENT_BUILDER_UIAM_OAUTH_CLIENT_MANAGEMENT_SETTING_ID =
  'agentBuilder:uiamOAuthClientManagement';
export const AGENT_BUILDER_TRACING_ENABLED_SETTING_ID = 'agentBuilder:tracing:enabled';
export const AGENT_BUILDER_TRACING_USER_PROMPTS_SETTING_ID =
  'agentBuilder:tracing:includeUserPrompts';
export const AGENT_BUILDER_TRACING_LLM_RESPONSES_SETTING_ID =
  'agentBuilder:tracing:includeLlmResponses';
export const AGENT_BUILDER_TRACING_TOOL_DETAILS_SETTING_ID =
  'agentBuilder:tracing:includeToolDetails';
export const AGENT_BUILDER_TRACING_SYSTEM_PROMPT_SETTING_ID =
  'agentBuilder:tracing:includeSystemPrompt';
export const AGENT_BUILDER_TRACING_REAL_NAMES_SETTING_ID = 'agentBuilder:tracing:includeRealNames';
export const AGENT_BUILDER_TRACING_REAL_IDS_SETTING_ID = 'agentBuilder:tracing:includeRealIds';

// Context engine settings
export const CONTEXT_ENGINE_ENABLED_SETTING_ID = 'contextEngine:enabled';

// Autocomplete settings
export const AUTOCOMPLETE_USE_TIME_RANGE_ID = 'autocomplete:useTimeRange';
export const AUTOCOMPLETE_VALUE_SUGGESTION_METHOD_ID = 'autocomplete:valueSuggestionMethod';

// Banner settings
export const BANNERS_PLACEMENT_ID = 'banners:placement';
export const BANNERS_TEXT_CONTENT_ID = 'banners:textContent';
export const BANNERS_TEXT_COLOR_ID = 'banners:textColor';
export const BANNERS_LINK_COLOR_ID = 'banners:linkColor';
export const BANNERS_BACKGROUND_COLOR_ID = 'banners:backgroundColor';

// Discover settings
export const CONTEXT_DEFAULT_SIZE_ID = 'context:defaultSize';
export const CONTEXT_STEP_ID = 'context:step';
export const CONTEXT_TIE_BREAKER_FIELDS_ID = 'context:tieBreakerFields';
export const DEFAULT_COLUMNS_ID = 'defaultColumns';
export const ENABLE_ESQL_ID = 'enableESQL';
export const DISCOVER_MAX_DOC_FIELDS_DISPLAYED_ID = 'discover:maxDocFieldsDisplayed';
export const DISCOVER_MODIFY_COLUMNS_ON_SWITCH_ID = 'discover:modifyColumnsOnSwitch';
export const DISCOVER_ROW_HEIGHT_OPTION_ID = 'discover:rowHeightOption';
export const DISCOVER_SAMPLE_ROWS_PER_PAGE_ID = 'discover:sampleRowsPerPage';
export const DISCOVER_SAMPLE_SIZE_ID = 'discover:sampleSize';
export const DISCOVER_SEARCH_ON_PAGE_LOAD_ID = 'discover:searchOnPageLoad';
export const DISCOVER_SHOW_FIELD_STATISTICS_ID = 'discover:showFieldStatistics';
export const DISCOVER_SHOW_MULTI_FIELDS_ID = 'discover:showMultiFields';
export const DISCOVER_SORT_DEFAULT_ORDER_ID = 'discover:sort:defaultOrder';
export const DOC_TABLE_HIDE_TIME_COLUMNS_ID = 'doc_table:hideTimeColumn';
export const DOC_TABLE_HIGHLIGHT_ID = 'doc_table:highlight';

// Machine learning settings
export const ML_ANOMALY_DETECTION_RESULTS_ENABLE_TIME_DEFAULTS_ID =
  'ml:anomalyDetection:results:enableTimeDefaults';
export const ML_ANOMALY_DETECTION_RESULTS_TIME_DEFAULTS_ID =
  'ml:anomalyDetection:results:timeDefaults';

// Notifications settings
export const NOTIFICATIONS_BANNER_ID = 'notifications:banner';
export const NOTIFICATIONS_LIFETIME_BANNER_ID = 'notifications:lifetime:banner';
export const NOTIFICATIONS_LIFETIME_ERROR_ID = 'notifications:lifetime:error';
export const NOTIFICATIONS_LIFETIME_INFO_ID = 'notifications:lifetime:info';
export const NOTIFICATIONS_LIFETIME_WARNING_ID = 'notifications:lifetime:warning';

// Observability settings
export const OBSERVABILITY_APM_AWS_LAMBDA_PRICE_FACTOR_ID = 'observability:apmAWSLambdaPriceFactor';
export const OBSERVABILITY_APM_AWS_LAMBDA_REQUEST_COST_PER_MILLION_ID =
  'observability:apmAWSLambdaRequestCostPerMillion';
export const OBSERVABILITY_APM_DEFAULT_SERVICE_ENVIRONMENT_ID =
  'observability:apmDefaultServiceEnvironment';
export const OBSERVABILITY_APM_PROGRESSIVE_LOADING_ID = 'observability:apmProgressiveLoading';
export const OBSERVABILITY_APM_SERVICE_GROUP_MAX_NUMBER_OF_SERVICE_ID =
  'observability:apmServiceGroupMaxNumberOfServices';
export const OBSERVABILITY_ENABLE_COMPARISON_BY_DEFAULT_ID =
  'observability:enableComparisonByDefault';
export const OBSERVABILITY_ENABLE_INFRASTRUCTURE_ASSET_CUSTOM_DASHBOARDS_ID =
  'observability:enableInfrastructureAssetCustomDashboards';
export const OBSERVABILITY_ENABLE_INSPECT_ES_QUERIES_ID = 'observability:enableInspectEsQueries';
export const OBSERVABILITY_MAX_SUGGESTIONS_ID = 'observability:maxSuggestions';
export const OBSERVABILITY_APM_ENABLE_TABLE_SEARCH_BAR = 'observability:apmEnableTableSearchBar';
export const OBSERVABILITY_APM_ENABLE_SERVICE_INVENTORY_TABLE_SEARCH_BAR =
  'observability:apmEnableServiceInventoryTableSearchBar';
export const OBSERVABILITY_APM_TRACE_LOGS_DEFAULT_COLUMNS_ID =
  'observability:apmTraceLogsDefaultColumns';
export const OBSERVABILITY_LOGS_SHARED_NEW_LOGS_OVERVIEW_ID = 'observability:newLogsOverview';
export const OBSERVABILITY_LOGS_DATA_ACCESS_LOG_SOURCES_ID = 'observability:logSources';
export const OBSERVABILITY_AI_ASSISTANT_SIMULATED_FUNCTION_CALLING =
  'observability:aiAssistantSimulatedFunctionCalling';
export const OBSERVABILITY_AI_ASSISTANT_SEARCH_CONNECTOR_INDEX_PATTERN =
  'observability:aiAssistantSearchConnectorIndexPattern';
export const GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR = 'genAiSettings:defaultAIConnector';
export const GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR_DEFAULT_ONLY =
  'genAiSettings:defaultAIConnectorOnly';
export const GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING = 'genAiSettings:tokenUsageTracking';
export const AI_ASSISTANT_PREFERRED_AI_ASSISTANT_TYPE = 'aiAssistant:preferredAIAssistantType';
export const AI_CHAT_EXPERIENCE_TYPE = 'aiAssistant:preferredChatExperience';
export const AI_ANONYMIZATION_SETTINGS = 'ai:anonymizationSettings';
export const OBSERVABILITY_SEARCH_EXCLUDED_DATA_TIERS = 'observability:searchExcludedDataTiers';
export const OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS =
  'observability:streamsEnableSignificantEvents';
export const OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_DISCOVERY =
  'observability:streamsEnableSignificantEventsDiscovery';
export const OBSERVABILITY_STREAMS_ENABLE_GROUP_STREAMS = 'observability:streamsEnableGroupStreams';
export const OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS = 'observability:streamsEnableQueryStreams';
export const OBSERVABILITY_STREAMS_ENABLE_CONTENT_PACKS = 'observability:streamsEnableContentPacks';
export const OBSERVABILITY_STREAMS_ENABLE_WIRED_STREAM_VIEWS =
  'observability:streamsEnableWiredStreamViews';
export const OBSERVABILITY_STREAMS_ENABLE_DRAFT_STREAMS = 'observability:streamsEnableDraftStreams';
export const OBSERVABILITY_STREAMS_ENABLE_CANVAS = 'observability:streamsEnableCanvas';
export const OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_ENABLED =
  'observability:streamsContinuousKiExtractionEnabled';
export const OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_INTERVAL_HOURS =
  'observability:streamsContinuousKiExtractionIntervalHours';
export const OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_EXCLUDED_STREAM_PATTERNS =
  'observability:streamsContinuousKiExtractionExcludedStreamPatterns';
export const OBSERVABILITY_STREAMS_SIGNIFICANT_EVENTS_INDEX_PATTERNS =
  'observability:streamsSigEventsIndexPatterns';
export const OBSERVABILITY_STREAMS_SIGNIFICANT_EVENTS_TUNING_CONFIG =
  'observability:streamsSigEventsTuningConfig';
export const OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_ALERTING_V2 =
  'observability:streamsEnableSignificantEventsAlertingV2';
export const OBSERVABILITY_ENABLE_DIAGNOSTIC_MODE = 'observability:enableDiagnosticMode';

// Reporting settings
export const XPACK_REPORTING_CUSTOM_PDF_LOGO_ID = 'xpackReporting:customPdfLogo';

// Rollups settings
export const ROLLUPS_ENABLE_INDEX_PATTERNS_ID = 'rollups.enableIndexPatterns';

// Search settings
export const COURIER_CUSTOM_REQUEST_PREFERENCE_ID = 'courier:customRequestPreference';
export const COURIER_IGNORE_FILTER_IF_FIELD_NOT_IN_INDEX_ID =
  'courier:ignoreFilterIfFieldNotInIndex';
export const COURIER_MAX_CONCURRENT_SHARD_REQUEST_ID = 'courier:maxConcurrentShardRequests';
export const COURIER_SET_REQUEST_PREFERENCE_ID = 'courier:setRequestPreference';
export const SEARCH_INCLUDE_FROZEN_ID = 'search:includeFrozen';
export const SEARCH_TIMEOUT_ID = 'search:timeout';

// Query activity settings
export const QUERY_ACTIVITY_MIN_RUNNING_TIME_ID = 'query_activity:minRunningTime';

// Security solution settings
export const SECURITY_SOLUTION_REFRESH_INTERVAL_DEFAULTS_ID =
  'securitySolution:refreshIntervalDefaults';
export const SECURITY_SOLUTION_TIME_DEFAULTS_ID = 'securitySolution:timeDefaults';
export const SECURITY_SOLUTION_DEFAULT_INDEX_ID = 'securitySolution:defaultIndex';
export const SECURITY_SOLUTION_DEFAULT_THREAT_INDEX_ID = 'securitySolution:defaultThreatIndex';
export const SECURITY_SOLUTION_DEFAULT_ANOMALY_SCORE_ID = 'securitySolution:defaultAnomalyScore';
export const SECURITY_SOLUTION_ENABLE_GROUPED_NAV_ID = 'securitySolution:enableGroupedNav';
export const SECURITY_SOLUTION_RULES_TABLE_REFRESH_ID = 'securitySolution:rulesTableRefresh';
export const SECURITY_SOLUTION_ENABLE_NEWS_FEED_ID = 'securitySolution:enableNewsFeed';
export const SECURITY_SOLUTION_NEWS_FEED_URL_ID = 'securitySolution:newsFeedUrl';
export const SECURITY_SOLUTION_IP_REPUTATION_LINKS_ID = 'securitySolution:ipReputationLinks';
export const SECURITY_SOLUTION_SHOW_RELATED_INTEGRATIONS_ID =
  'securitySolution:showRelatedIntegrations';
export const SECURITY_SOLUTION_SUPPRESSION_BEHAVIOR_ON_ALERT_CLOSURE_SETTING =
  'securitySolution:suppressionBehaviorOnAlertClosure' as const;
export const SECURITY_SOLUTION_DEFAULT_ALERT_TAGS_KEY = 'securitySolution:alertTags' as const;
export const SECURITY_SOLUTION_EXCLUDED_GAP_REASONS_KEY =
  'securitySolution:excludedGapReasons' as const;
export const SECURITY_SOLUTION_INCLUDED_DATA_STREAM_NAMESPACES_FOR_RULE_EXECUTION =
  'securitySolution:includedDataStreamNamespacesForRuleExecution' as const;
/** This Kibana Advanced Setting allows users to enable/disable the Asset Criticality feature */
export const SECURITY_SOLUTION_ENABLE_ASSET_CRITICALITY_SETTING =
  'securitySolution:enableAssetCriticality' as const;
export const SECURITY_SOLUTION_ENABLE_ASSET_INVENTORY_SETTING =
  'securitySolution:enableAssetInventory' as const;
export const SECURITY_SOLUTION_ENABLE_CLOUD_CONNECTOR_SETTING =
  'securitySolution:enableCloudConnector' as const;
export const SECURITY_SOLUTION_DEFAULT_VALUE_REPORT_MINUTES =
  'securitySolution:defaultValueReportMinutes' as const;
export const SECURITY_SOLUTION_DEFAULT_VALUE_REPORT_RATE =
  'securitySolution:defaultValueReportRate' as const;
export const SECURITY_SOLUTION_DEFAULT_VALUE_REPORT_TITLE =
  'securitySolution:defaultValueReportTitle' as const;
// Cases settings
export const CASES_MAX_OPEN_CASES_PER_RULE_RUN_ID = 'cases:maxOpenCasesPerRuleRun' as const;

// Timelion settings
export const TIMELION_ES_DEFAULT_INDEX_ID = 'timelion:es.default_index';
export const TIMELION_ES_TIME_FIELD_ID = 'timelion:es.timefield';
export const TIMELION_MAX_BUCKETS_ID = 'timelion:max_buckets';
export const TIMELION_MIN_INTERVAL_ID = 'timelion:min_interval';
export const TIMELION_TARGET_BUCKETS_ID = 'timelion:target_buckets';

// Visualization settings
export const VISUALIZATION_HEATMAP_MAX_BUCKETS_ID = 'visualization:heatmap:maxBuckets';
export const VISUALIZATION_LEGACY_GAUGE_CHARTS_LIBRARY_ID =
  'visualization:visualize:legacyGaugeChartsLibrary';
export const VISUALIZATION_LEGACY_HEATMAP_CHARTS_LIBRARY_ID =
  'visualization:visualize:legacyHeatmapChartsLibrary';
export const VISUALIZATION_ENABLE_LABS_ID = 'visualize:enableLabs';
