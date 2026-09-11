/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Observability-specific test framework
export {
  test,
  apiTest,
  spaceTest,
  ObservabilityNavigation,
  OBSERVABILITY_SPA_SHELL_TIMEOUT_MS,
} from './src/playwright';

// Worker fixtures for observability tests (e.g. sloData for API tests)
export { sloDataFixture } from './src/playwright/fixtures/worker';
export type { SloDataFixture } from './src/playwright/fixtures/worker';

// re-exported test framework from @kbn/scout
export { lighthouseTest, tags } from '@kbn/scout';

// Custom global setup/teardown hooks with profiling support
export { globalSetupHook, globalTeardownHook } from './src/playwright/global_hook';

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
  ObltApiServicesFixture,
  ObltPageObjects,
  ObltTestFixtures,
  ObltWorkerFixtures,
  ObltParallelTestFixtures,
  ObltParallelWorkerFixtures,
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
export type {
  ApiClientFixture,
  ApiClientResponse,
} from '@kbn/scout/src/playwright/fixtures/scope/worker/api_client';

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
export type { RoleApiCredentials, RequestAuthFixture } from '@kbn/scout';

// Re-exported Playwright types
export type { Locator, CDPSession } from '@kbn/scout';
