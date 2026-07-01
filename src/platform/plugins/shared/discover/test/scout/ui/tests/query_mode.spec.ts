/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Discover supports two query modes: "classic" (data view based) and "esql".
 * Which mode Discover opens in by default is controlled by the server-wide
 * `discover.isEsqlDefault` feature flag, and the last mode the user picked is
 * persisted in browser storage.
 *
 * To get full coverage without duplicating specs, this suite is parameterized
 * over both values of `discover.isEsqlDefault`: the entire describe block below
 * runs once with the flag off (classic default) and once with it on (ES|QL
 * default). The flag is toggled per iteration in `beforeAll`/`afterAll`.
 *
 * Because `discover.isEsqlDefault` is server-wide, this suite lives in the
 * sequential `playwright.config.ts` (single worker) rather than the parallel
 * config: toggling it while other spec files run concurrently against the same
 * Kibana server would leak the flag into those specs.
 */

import { expect } from '@kbn/scout/ui';
import type { ScoutTestFixtures } from '@kbn/scout';
import { clearStoredQueryMode, getStoredQueryMode } from '../fixtures/common/helpers';
import { spaceTest } from '../fixtures/common';

type QueryMode = 'classic' | 'esql';

// The two query modes are treated as data so the persistence test can be
// generated for each of them instead of being written out by hand.
const QUERY_MODES: readonly QueryMode[] = ['esql', 'classic'];

// Performs the UI action that switches Discover into the given mode. Each mode
// has its own control, so this maps a mode to the right interaction.
const switchToMode = async (pageObjects: ScoutTestFixtures['pageObjects'], mode: QueryMode) => {
  if (mode === 'esql') {
    await pageObjects.discover.selectTextBaseLang();
  } else {
    await pageObjects.discover.selectClassicMode();
  }
};

// The two states of the `discover.isEsqlDefault` feature flag to run the suite for.
const FLAG_SETTINGS = [false, true];

for (const isEsqlDefault of FLAG_SETTINGS) {
  // The mode Discover is expected to open in for this flag value.
  const defaultMode: QueryMode = isEsqlDefault ? 'esql' : 'classic';

  // Persistence is only triggered by an actual mode *change*. If Discover already
  // opens in `targetMode`, selecting it again would be a no-op and nothing would
  // be stored, so we first switch away to the other mode. When the default is the
  // other mode this is a no-op and the test switches straight into `targetMode`.
  const ensureTransitionInto = async (
    pageObjects: ScoutTestFixtures['pageObjects'],
    targetMode: QueryMode
  ) => {
    if (defaultMode === targetMode) {
      const otherMode = targetMode === 'esql' ? 'classic' : 'esql';
      await switchToMode(pageObjects, otherMode);
    }
  };

  spaceTest.describe.serial(
    `Discover query mode (discover.isEsqlDefault: ${isEsqlDefault})`,
    { tag: '@local-stateful-classic' },
    () => {
      // Apply this iteration's feature flag value and set up the Discover data
      // (data views, sample docs, etc.) before any test runs.
      spaceTest.beforeAll(async ({ apiServices, discoverScoutSpace }) => {
        await apiServices.core.settings({
          'feature_flags.overrides': {
            'discover.isEsqlDefault': isEsqlDefault,
          },
        });
        await discoverScoutSpace.setupDiscoverDefaults();
      });

      // Start every test from a clean slate: a fresh viewer session on Discover
      // with no previously persisted query mode, so each test controls its own
      // starting state.
      spaceTest.beforeEach(async ({ browserAuth, page }) => {
        await browserAuth.loginAsViewer();
        await page.gotoApp('discover');
        await clearStoredQueryMode(page);
      });

      // Tear down Discover data, reset the feature flag so it can't leak into
      // other suites, and clear any persisted query mode.
      spaceTest.afterAll(async ({ apiServices, discoverScoutSpace }) => {
        await discoverScoutSpace.teardownDiscoverDefaults();
        await apiServices.core.settings({
          'feature_flags.overrides': {
            'discover.isEsqlDefault': null,
          },
        });
      });

      // With nothing persisted, Discover should fall back to the mode dictated by
      // the feature flag (and confirm that nothing was stored yet).
      spaceTest(
        `opens Discover in ${defaultMode} mode when no default query mode is stored`,
        async ({ page, pageObjects }) => {
          await page.gotoApp('discover');
          await pageObjects.discover.waitUntilTabIsLoaded();
          expect(await pageObjects.discover.getCurrentQueryMode()).toBe(defaultMode);
          expect(await getStoredQueryMode(page)).toBeNull();
        }
      );

      // For each mode: switching into it should persist that choice, so a reload
      // reopens Discover in the same mode. Generated for both modes regardless of
      // which one is the default.
      for (const targetMode of QUERY_MODES) {
        spaceTest(
          `persists ${targetMode} as the default query mode after the user switches modes`,
          async ({ page, pageObjects }) => {
            await page.gotoApp('discover');
            await pageObjects.discover.waitUntilTabIsLoaded();

            // Guarantee a real switch into `targetMode`, then verify it was stored.
            await ensureTransitionInto(pageObjects, targetMode);
            await switchToMode(pageObjects, targetMode);
            expect(await getStoredQueryMode(page)).toBe(targetMode);

            // Reload and confirm the persisted mode is restored.
            await page.gotoApp('discover');
            await pageObjects.discover.waitUntilTabIsLoaded();
            expect(await getStoredQueryMode(page)).toBe(targetMode);
          }
        );
      }
    }
  );
}
