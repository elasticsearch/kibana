/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Type-aware rules applied to every file of every TS project.
 */
export const BASE_RULES = {
  'typescript/consistent-type-exports': 'error',
} as const;

/**
 * Let's focus on server-side errors first to avoid server crashes.
 * We'll tackle /public eventually.
 */
export const NO_FLOATING_PROMISES_RULE = [
  'error',
  {
    ignoreIIFE: false,
    checkThenables: true, // check for thenable objects (not just native Promises)
  },
] as const;

/**
 * Globs, relative to each TS project's directory, selecting the files that
 * `typescript/no-floating-promises` is enforced on.
 */
export const NO_FLOATING_PROMISES_GLOBS = [
  'server/**/*',
  'accessibility/apps/**/*',
  'analytics/tests/**/*',
  '*functional*/**/*',
  '*api_integration*/**/*',
  'cloud_integration/tests/**/*',
  'custom_branding/tests/**/*',
  'disable_ems/tests/**/*',
  'examples/**/*',
  'fleet_multi_cluster/apps/**/*',
  'ftr_apis/**/*',
  'health_gateway/tests/**/*',
  'localization/tests/**/*',
  'plugin_api_perf/test_suites/**/*',
  'rule_registry/**/*',
  'search_sessions_integration/tests/**/*',
  'screenshot_creation/apps/**/*',
  'serverless/api_integration/**/*',
  'serverless/functional/**/*',
  'ui_capabilities/**/*',
  'upgrade/apps/**/*',
  'usage_collection/test_suites/**/*',
  'src/playwright/page_objects/**/*',
  'test/scout/**/*',
  // when tsconfig.json is defined in 'scout/test/ui|api' folders
  'parallel_tests/**/*.spec.ts',
  'tests/**/*.spec.ts',
  'fixtures/page_objects/**/*',
];

/**
 * Globs, relative to each TS project's directory, exempted from
 * `typescript/no-floating-promises`.
 */
export const NO_FLOATING_PROMISES_EXEMPT_GLOBS = [
  '*spaces_api_integration/common/services/basic_auth_supertest.ts',
  '*security_solution_api_integration/scripts/mki_api_ftr_execution.ts',
];
