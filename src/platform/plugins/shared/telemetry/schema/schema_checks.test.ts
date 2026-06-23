/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readFile } from 'fs/promises';
import { getFlattenedObject } from '@kbn/std';
import { get } from 'lodash';

const SCHEMA_FILES = [
  'src/platform/plugins/shared/telemetry/schema/kbn_packages.json',
  'src/platform/plugins/shared/telemetry/schema/oss_platform.json',
  'src/platform/plugins/shared/telemetry/schema/oss_plugins.json',
  'src/platform/plugins/shared/telemetry/schema/oss_root.json',
  'x-pack/platform/plugins/private/telemetry_collection_xpack/schema/xpack_chat.json',
  'x-pack/platform/plugins/private/telemetry_collection_xpack/schema/xpack_monitoring.json',
  'x-pack/platform/plugins/private/telemetry_collection_xpack/schema/xpack_observability.json',
  'x-pack/platform/plugins/private/telemetry_collection_xpack/schema/xpack_platform.json',
  'x-pack/platform/plugins/private/telemetry_collection_xpack/schema/xpack_plugins.json',
  'x-pack/platform/plugins/private/telemetry_collection_xpack/schema/xpack_root.json',
  'x-pack/platform/plugins/private/telemetry_collection_xpack/schema/xpack_search.json',
  'x-pack/platform/plugins/private/telemetry_collection_xpack/schema/xpack_security.json',
];

// The idea behind this test is to apply usual checks to the telemetry schema, and avoid the need of a human PR review every time the schemas are updated.
describe('Telemetry Schema Checks', () => {
  test.each(SCHEMA_FILES)('[%s] DYNAMIC_KEY usage requires human review', async (schemaFile) => {
    const schema = JSON.parse(await readFile(schemaFile, 'utf8'));
    const flattenedSchema = getFlattenedObject(schema);
    const dynamicKeys = Object.keys(flattenedSchema).filter((key) => key.includes('DYNAMIC_KEY'));
    expect(dynamicKeys).toMatchSnapshot();
  });

  test('Avoid additional descriptions "Non-default value of setting."', async () => {
    const schema = JSON.parse(
      await readFile('src/platform/plugins/shared/telemetry/schema/oss_platform.json', 'utf8')
    );
    const flattenedSchema = getFlattenedObject(
      get(schema, 'properties.stack_management.properties')
    );
    const keysWithNonDefaultDescriptions = Object.keys(flattenedSchema)
      .filter(
        (key) =>
          key.endsWith('_meta.description') &&
          flattenedSchema[key].toLowerCase() === 'non-default value of setting.'
      )
      .map((key) => key.replace('._meta.description', ''))
      .sort();

    /**
     * Grandfathered UI settings that still report the generic telemetry description
     * "Non-default value of setting." Do **not** increase `EXPECTED_COUNT`; add a proper
     * setting description instead. When you remove an entry from the list below, decrement
     * `EXPECTED_COUNT`. The goal is for both this count and the list to reach zero.
     */
    const EXPECTED_COUNT = 150;

    expect(keysWithNonDefaultDescriptions).toHaveLength(EXPECTED_COUNT);
    expect(keysWithNonDefaultDescriptions).toEqual([
      'accessibility:disableAnimations',
      'agentBuilder:bashSupport',
      'agentBuilder:experimentalFeatures',
      'agentBuilder:externalMcp',
      'agentBuilder:navEnabled',
      'ai:anonymizationSettings',
      'aiAssistant:preferredAIAssistantType',
      'aiAssistant:preferredChatExperience',
      'autocomplete:useTimeRange',
      'autocomplete:valueSuggestionMethod',
      'banners:backgroundColor',
      'banners:linkColor',
      'banners:placement',
      'banners:textColor',
      'bfetch:disable',
      'bfetch:disableCompression',
      'context:defaultSize',
      'context:step',
      'context:tieBreakerFields.items',
      'courier:customRequestPreference',
      'courier:ignoreFilterIfFieldNotInIndex',
      'courier:maxConcurrentShardRequests',
      'courier:setRequestPreference',
      'csv:quoteValues',
      'csv:separator',
      'data_views:fields_excluded_data_tiers',
      'dateFormat',
      'dateFormat:dow',
      'dateFormat:scaled',
      'dateFormat:tz',
      'dateNanosFormat',
      'defaultColumns.items',
      'defaultIndex',
      'defaultRoute',
      'devTools:enablePersistentConsole',
      'discover:maxDocFieldsDisplayed',
      'discover:modifyColumnsOnSwitch',
      'discover:rowHeightOption',
      'discover:sampleRowsPerPage',
      'discover:sampleSize',
      'discover:searchOnPageLoad',
      'discover:showFieldStatistics',
      'discover:showMultiFields',
      'discover:sort:defaultOrder',
      'doc_table:hideTimeColumn',
      'doc_table:highlight',
      'elasticRamen:enabled',
      'enableESQL',
      'fields:popularLimit',
      'fileUpload:maxFileSize',
      'filterEditor:suggestValues',
      'filters:pinnedByDefault',
      'format:bytes:defaultPattern',
      'format:currency:defaultPattern',
      'format:defaultTypeMap',
      'format:number:defaultLocale',
      'format:number:defaultPattern',
      'format:percent:defaultPattern',
      'hideAnnouncements',
      'histogram:barTarget',
      'histogram:maxBars',
      'history:limit',
      'indexPattern:placeholder',
      'isDefaultIndexMigrated',
      'labs:canvas:byValueEmbeddable',
      'labs:canvas:enable_ui',
      'labs:canvas:useDataService',
      'labs:dashboard:deferBelowFold',
      'labs:dashboard:enable_ui',
      'labs:presentation:timeToPresent',
      'metaFields.items',
      'metrics:allowStringIndices',
      'metrics:max_buckets',
      'ml:anomalyDetection:results:enableTimeDefaults',
      'ml:anomalyDetection:results:timeDefaults',
      'notifications:lifetime:banner',
      'notifications:lifetime:error',
      'notifications:lifetime:info',
      'notifications:lifetime:warning',
      'observability:aiAssistantSearchConnectorIndexPattern',
      'observability:aiAssistantSimulatedFunctionCalling',
      'observability:apmAWSLambdaPriceFactor',
      'observability:apmAWSLambdaRequestCostPerMillion',
      'observability:apmEnableServiceInventoryTableSearchBar',
      'observability:apmEnableTableSearchBar',
      'observability:apmEnableTransactionProfiling',
      'observability:apmProgressiveLoading',
      'observability:apmServiceGroupMaxNumberOfServices',
      'observability:enableComparisonByDefault',
      'observability:enableInfrastructureAssetCustomDashboards',
      'observability:enableInspectEsQueries',
      'observability:enableLegacyUptimeApp',
      'observability:enableServiceGroups',
      'observability:logSources.items',
      'observability:maxSuggestions',
      'observability:profilingAWSCostDiscountRate',
      'observability:profilingAzureCostDiscountRate',
      'observability:profilingCo2PerKWH',
      'observability:profilingCostPervCPUPerHour',
      'observability:profilingDatacenterPUE',
      'observability:profilingPerVCPUWattX86',
      'observability:profilingPervCPUWattArm64',
      'observability:profilingShowErrorFrames',
      'observability:searchExcludedDataTiers.items',
      'observability:syntheticsThrottlingEnabled',
      'query:allowLeadingWildcards',
      'query:queryString:options',
      'query_activity:minRunningTime',
      'rollups:enableIndexPatterns',
      'savedObjects:listingLimit',
      'savedObjects:perPage',
      'search:includeFrozen',
      'search:queryLanguage',
      'search:timeout',
      'securitySolution:defaultAnomalyScore',
      'securitySolution:defaultValueReportMinutes',
      'securitySolution:defaultValueReportRate',
      'securitySolution:defaultValueReportTitle',
      'securitySolution:enableAlertsAndAttacksAlignment',
      'securitySolution:enableAssetCriticality',
      'securitySolution:enableAssetInventory',
      'securitySolution:enableCloudConnector',
      'securitySolution:enableGroupedNav',
      'securitySolution:enableNewsFeed',
      'securitySolution:excludedDataTiersForRuleExecution.items',
      'securitySolution:refreshIntervalDefaults',
      'securitySolution:rulesTableRefresh',
      'securitySolution:showRelatedIntegrations',
      'securitySolution:suppressionBehaviorOnAlertClosure',
      'securitySolution:timeDefaults',
      'shortDots:enable',
      'sort:options',
      'state:storeInSessionStorage',
      'theme:darkMode',
      'theme:name',
      'theme:version',
      'timelion:es.default_index',
      'timelion:es.timefield',
      'timelion:max_buckets',
      'timelion:min_interval',
      'timelion:target_buckets',
      'timepicker:quickRanges',
      'timepicker:refreshIntervalDefaults',
      'timepicker:timeDefaults',
      'visualization:heatmap:maxBuckets',
      'visualization:regionmap:showWarnings',
      'visualization:tileMap:WMSdefaults',
      'visualization:tileMap:maxPrecision',
      'visualization:visualize:legacyGaugeChartsLibrary',
      'visualization:visualize:legacyHeatmapChartsLibrary',
    ]);
  });
});
