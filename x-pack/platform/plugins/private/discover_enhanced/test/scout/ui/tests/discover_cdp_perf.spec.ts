/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CDPSession } from '@kbn/scout';
import { test, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { evaluateDiscoverBundlePluginAssertion } from '../fixtures/discover_bundle_expectations';
import { testData } from '../fixtures';

/**
 * Extra bundle labels produced only by the unified RSPack build (split chunks + shell).
 * In RSPack dist mode, unnamed split chunks are labelled 'rspack-chunk' by
 * getLogicalBundlePluginLabel. In dev mode, named labels like 'plugin-discover' appear.
 * Named lazy split chunks (lazy_*, from dynamic import() magic comments) are handled
 * dynamically in evaluateDiscoverBundlePluginAssertion and do not need to be listed here.
 * [rspack-transition] Remove this allowlist when the legacy webpack optimizer is gone
 * and tests only target RSPack output — see packages/kbn-rspack-optimizer/LEGACY_REMOVAL_CHECKLIST.md
 */
const RSPACK_ONLY_BUNDLE_LABELS: readonly string[] = [
  'core',
  'kibana',
  'one_discover_shared_deps',
  'rspack-chunk',
  'shared-core',
  'shared-misc',
  'shared-packages',
  'shared-plugins',
  'shared-root-packages',
  'shared-solution-packages',
  'vendors',
  'vendors-heavy',
];

function getExpectedDiscoverPluginIds(projectType: string | undefined): string[] {
  return [
    'aiops',
    'discover',
    'embeddable',
    'eventAnnotation',
    'expressionXY',
    'kbn-ui-shared-deps-npm',
    'kql',
    'lens',
    'maps',
    ...(projectType === 'security' ? ['securitySolution'] : []),
    'unifiedSearch',
  ];
}

/**
 * [rspack-transition] RSPack unified build loads shared chunks (vendors, shared-plugins, etc.)
 * that inflate totalSize compared to legacy per-plugin bundles, but individual plugin sizes shrink.
 * Returns separate thresholds until the legacy optimizer is removed.
 *
 * In RSPack dist mode, named plugin entry chunks (plugin-discover, etc.) are preloaded
 * during bootstrap and NOT re-fetched during SPA navigation, so only on-demand split
 * chunks with numeric IDs are captured by CDP. Per-plugin size assertions are not
 * meaningful in that mode.
 */
function getBundleSizeLimits() {
  const isRspack = process.env.KBN_USE_RSPACK === 'true' || process.env.KBN_USE_RSPACK === '1';
  return {
    isRspack,
    totalSize: isRspack ? 4.5 * 1024 * 1024 : 3.2 * 1024 * 1024,
    bundleCount: isRspack ? 70 : 100,
    discoverSize: 650 * 1024,
    unifiedSearchSize: 450 * 1024,
  };
}

/**
 * Per-plugin size assertions are only meaningful in legacy mode where individual
 * plugin entry bundles are fetched during navigation. In RSPack dist mode,
 * named plugin chunks are preloaded during bootstrap and not re-fetched.
 */
function assertLegacyPerPluginSizes(
  plugins: Array<{ name: string; totalSize: number }>,
  limits: ReturnType<typeof getBundleSizeLimits>
) {
  if (limits.isRspack) return { ok: true };

  const discoverSize = plugins.find((p) => p.name === 'discover')?.totalSize ?? Infinity;
  const unifiedSearchSize = plugins.find((p) => p.name === 'unifiedSearch')?.totalSize ?? Infinity;

  if (discoverSize >= limits.discoverSize) {
    return { ok: false, detail: `discover size ${discoverSize} >= ${limits.discoverSize}` };
  }
  if (unifiedSearchSize >= limits.unifiedSearchSize) {
    return {
      ok: false,
      detail: `unifiedSearch size ${unifiedSearchSize} >= ${limits.unifiedSearchSize}`,
    };
  }
  return { ok: true };
}

// Failing: See https://github.com/elastic/kibana/issues/242678
test.describe.skip(
  'Discover App - Performance Metrics & Bundle Analysis',
  { tag: [...tags.deploymentAgnostic, ...tags.performance] },
  () => {
    let cdp: CDPSession;

    test.beforeAll(async ({ esArchiver, kbnClient, uiSettings }) => {
      await esArchiver.loadIfNeeded(testData.ES_ARCHIVES.LOGSTASH);
      await kbnClient.importExport.load(testData.KBN_ARCHIVES.DASHBOARD_DRILLDOWNS);
      await uiSettings.set({
        defaultIndex: testData.DATA_VIEW_ID.LOGSTASH,
        'timepicker:timeDefaults': `{ "from": "${testData.LOGSTASH_DEFAULT_START_TIME}", "to": "${testData.LOGSTASH_DEFAULT_END_TIME}"}`,
      });
    });

    test.beforeEach(async ({ browserAuth, page, context, perfTracker }) => {
      await browserAuth.loginAsAdmin();
      cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await page.gotoApp('home');
      await page.testSubj.waitForSelector('homeApp', { timeout: 20000 });
      await perfTracker.waitForJsLoad(cdp); // Ensure JS bundles are fully loaded
    });

    test.afterAll(async ({ kbnClient, uiSettings }) => {
      await uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
      await kbnClient.savedObjects.cleanStandardList();
    });

    test('collects and validates JS Bundles loaded on page', async ({
      page,
      pageObjects,
      perfTracker,
      config,
    }) => {
      perfTracker.captureBundleResponses(cdp); // Start tracking

      // Navigate to Discover app
      await pageObjects.collapsibleNav.clickItem('Discover');
      const currentUrl = page.url();
      expect(currentUrl).toContain('app/discover#/');

      // Ensure all JS bundles are loaded (longer timeout to account for lazy-loaded plugins like aiops)
      await perfTracker.waitForJsLoad(cdp, 5000);

      // Collect and validate stats
      const stats = perfTracker.collectJsBundleStats(currentUrl);
      const loadedPluginNames = stats.plugins.map((p) => p.name).sort((a, b) => a.localeCompare(b));
      const limits = getBundleSizeLimits();

      expect(
        stats.totalSize,
        `Total bundles size loaded on page should not exceed ${(
          limits.totalSize /
          (1024 * 1024)
        ).toFixed(1)} MB`
      ).toBeLessThan(limits.totalSize);
      expect(
        stats.bundleCount,
        `Total bundle chunks count loaded on page should not exceed ${limits.bundleCount}`
      ).toBeLessThan(limits.bundleCount);

      const expectedPlugins = getExpectedDiscoverPluginIds(config.projectType);
      const bundleAssertion = evaluateDiscoverBundlePluginAssertion(
        loadedPluginNames,
        expectedPlugins,
        RSPACK_ONLY_BUNDLE_LABELS
      );
      expect(bundleAssertion, 'Unexpected plugins were loaded on page').toStrictEqual({ ok: true });
      expect(
        assertLegacyPerPluginSizes(stats.plugins, limits),
        'Individual plugin bundle sizes exceeded limits'
      ).toStrictEqual({ ok: true });
    });

    test('measures Performance Metrics before and after Discover load', async ({
      page,
      pageObjects,
      perfTracker,
      log,
    }) => {
      const beforeMetrics = await perfTracker.capturePagePerformanceMetrics(cdp);

      // Navigate to Discover app
      await pageObjects.collapsibleNav.clickItem('Discover');
      await page.testSubj.waitForSelector('discoverLayoutResizableContainer', { timeout: 20000 });
      const currentUrl = page.url();
      expect(currentUrl).toContain('app/discover#/');

      await pageObjects.discover.waitForHistogramRendered();

      const afterMetrics = await perfTracker.capturePagePerformanceMetrics(cdp);
      const perfStats = perfTracker.collectPagePerformanceStats(
        currentUrl,
        beforeMetrics,
        afterMetrics
      );

      log.info(`Performance Metrics for Discover app: ${JSON.stringify(perfStats, null, 2)}`);
    });
  }
);
