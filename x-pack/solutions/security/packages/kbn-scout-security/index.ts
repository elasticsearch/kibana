/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Security-specific test framework
export { test, spaceTest } from './src/playwright';

// Security-specific test constants
export { CUSTOM_QUERY_RULE } from './src/playwright/constants/detection_rules';
export { PREVALENCE_SOURCE_IP } from './src/playwright/fixtures/worker/apis/prevalence';
export { ANALYZER_ORIGIN_PROCESS_NAME } from './src/playwright/fixtures/worker/apis/analyzer';
export { NETWORK_SOURCE_IP } from './src/playwright/fixtures/worker/apis/network';
export { HOST_NAME } from './src/playwright/fixtures/worker/apis/host';
export { THREAT_FEED_NAME } from './src/playwright/fixtures/worker/apis/threat_intelligence';
export {
  CURRENT_USER_PROFILE_API_PATH,
  AlertWorkflowStatus,
  ALERT_CLOSE_MENU_ITEM_TEST_SUBJ,
  ClosingReasonOption,
  closedAlertsToastText,
  addedToTimelineToastText,
} from './src/playwright/constants/alert_workflows';
export {
  ADD_TO_NEW_CASE_TEST_SUBJ,
  ALERT_TAGS_MENU_ITEM_TEST_SUBJ,
  INVESTIGATE_IN_TIMELINE_MENU_ITEM_TEST_SUBJ,
} from './src/playwright/constants/take_action';

// re-exported test framework from @kbn/scout
export { lighthouseTest, apiTest, globalSetupHook, globalTeardownHook, tags } from '@kbn/scout';

// re-exported fixtures & configuration from @kbn/scout
export {
  browserAuthFixture,
  apiServicesFixture,
  createPlaywrightConfig,
  createLazyPageObject,
} from '@kbn/scout';

// re-exported Playwright integration from @kbn/scout
export { mergeTests, playwrightTest } from '@kbn/scout';

// re-exported performance monitoring from @kbn/scout
export { measurePerformance, measurePerformanceAsync } from '@kbn/scout';

// re-exported EUI components from @kbn/scout
export * from '@kbn/scout/src/playwright/eui_components';

// re-exported CLI tools from @kbn/scout
export { cli } from '@kbn/scout';

// TYPE EXPORTS

// Observability-specific types
export type {
  SecurityApiServicesFixture,
  SecurityPageObjects,
  SecurityTestFixtures,
  SecurityWorkerFixtures,
  SecurityParallelTestFixtures,
  SecurityParallelApiServicesFixture,
  SecurityParallelWorkerFixtures,
  ThreatMatchRuleCreatePage,
} from './src/playwright';

// Re-exported Scout core types
export type {
  ScoutPlaywrightOptions,
  ScoutTestOptions,
  ScoutPage,
  PageObjects,
  ScoutTestFixtures,
  ScoutWorkerFixtures,
  ScoutParallelTestFixtures,
  ScoutParallelWorkerFixtures,
} from '@kbn/scout';

// Re-exported fixture types
export type { ApiServicesFixture, BrowserAuthFixture, SamlAuth } from '@kbn/scout';

// Re-exported service & configuration types
export type {
  EsClient,
  KbnClient,
  KibanaUrl,
  ScoutLogger,
  ScoutServerConfig,
  ScoutTestConfig,
  KibanaRole,
  ElasticsearchRoleDescriptor,
} from '@kbn/scout';

// Re-exported authentication types
export type { RoleApiCredentials } from '@kbn/scout';

// Re-exported Playwright types
export type { Locator, CDPSession } from '@kbn/scout';
