/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FlakyTestEntry, FlakyTestReport } from '@kbn/scout-reporting';
import type { GithubIssue } from '../failed_tests_reporter/github_api';

export const GENERATED_AT = new Date('2026-09-09T09:04:41.000Z');

export const SUITE_PATH =
  'x-pack/solutions/observability/plugins/synthetics/test/scout/ui/tests/default_status_alert.spec.ts';

export const flakyTest = (overrides: Partial<FlakyTestEntry> = {}): FlakyTestEntry => ({
  testId: 'playwright:default_status_alert:creates default alert',
  framework: 'playwright',
  title: 'creates default alert, triggers on down status, and recovers',
  filePath: SUITE_PATH,
  configPath:
    'x-pack/solutions/observability/plugins/synthetics/test/scout/ui/playwright.config.ts',
  owners: ['elastic/obs-ux-management-team'],
  areas: [],
  runs: 509,
  fails: 49,
  passes: 460,
  retryFlakes: 12,
  builds: 509,
  failedBuilds: 49,
  buildFailRate: 49 / 509,
  failedBranches: 1,
  byBranch: [
    {
      branch: 'main',
      builds: 509,
      failedBuilds: 49,
      buildFailRate: 49 / 509,
      lastFailedAt: new Date('2026-09-09T06:12:00.000Z'),
      latestRun: {
        status: 'passed',
        timestamp: new Date('2026-09-09T06:04:41.000Z'),
        buildUrl: 'https://buildkite.com/elastic/kibana-on-merge/builds/12346',
      },
    },
  ],
  firstFailedAt: new Date('2026-09-02T10:00:00.000Z'),
  lastFailedAt: new Date('2026-09-09T06:12:00.000Z'),
  latestRun: {
    branch: 'main',
    status: 'passed',
    timestamp: new Date('2026-09-09T06:04:41.000Z'),
    buildUrl: 'https://buildkite.com/elastic/kibana-on-merge/builds/12346',
  },
  sampleFailures: [
    {
      message: 'Error: Timed out 30000ms waiting for expect(locator).toBeVisible()',
      buildUrl: 'https://buildkite.com/elastic/kibana-on-merge/builds/12345#0199-abcd',
      timestamp: new Date('2026-09-09T06:12:00.000Z'),
    },
  ],
  ...overrides,
});

export const flakyReport = (flaky: FlakyTestEntry[]): FlakyTestReport => ({
  schemaVersion: 1,
  generatedAt: GENERATED_AT,
  window: {
    lookbackDays: 7,
    from: new Date('2026-09-02T09:04:41.000Z'),
    to: GENERATED_AT,
  },
  scope: {
    pipelines: ['kibana-on-merge'],
    branches: [],
    frameworks: ['jest', 'ftr', 'cypress', 'playwright'],
    classifications: ['flaky'],
  },
  thresholds: { minBuilds: 10, minFailedBuilds: 2, maxTests: 200 },
  summary: {
    totalFlaky: flaky.length,
    totalConsistentlyFailing: 0,
    flakyByFramework: { playwright: flaky.length },
  },
  flaky,
  consistentlyFailing: [],
});

export const githubIssue = (overrides: Partial<GithubIssue> & { number: number }): GithubIssue => ({
  html_url: `https://github.com/elastic/kibana/issues/${overrides.number}`,
  node_id: `node-${overrides.number}`,
  title: `Issue #${overrides.number}`,
  labels: [],
  body: '',
  state: 'open',
  ...overrides,
});
