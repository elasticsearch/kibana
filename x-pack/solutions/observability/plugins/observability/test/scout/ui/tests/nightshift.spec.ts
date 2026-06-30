/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import {
  OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS,
  OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_DISCOVERY,
} from '@kbn/management-settings-ids';
import { STREAMS_SIGNIFICANT_EVENTS_AVAILABLE_FLAG } from '@kbn/streams-plugin/common';
import { test } from '../fixtures';

test.describe(
  'Nightshift navigation from Significant Events Discovery',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    test.beforeAll(async ({ apiServices, kbnClient, config }) => {
      // Significant events discovery is gated behind the streams.significantEventsAvailable feature
      // flag (defaults to false). The /internal/core/_settings route used to force it on is only
      // registered when coreApp.allowDynamicConfigOverrides=true (Scout's local base configs);
      // ECH/MKI deployments don't carry that override, so the PUT 404s — skip there.
      // eslint-disable-next-line playwright/no-skipped-test
      test.skip(
        config.isCloud === true,
        `Cannot override '${STREAMS_SIGNIFICANT_EVENTS_AVAILABLE_FLAG}' on Cloud deployments`
      );
      // skip() in beforeAll only skips the tests, not the hook body, so guard the requests too.
      if (config.isCloud) {
        return;
      }

      await apiServices.core.settings({
        'feature_flags.overrides': {
          [STREAMS_SIGNIFICANT_EVENTS_AVAILABLE_FLAG]: true,
        },
      });
      await kbnClient.uiSettings.update({
        [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS]: true,
        [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_DISCOVERY]: true,
      });
    });

    test.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsAdmin();
    });

    test.afterAll(async ({ apiServices, kbnClient, config }) => {
      if (config.isCloud) {
        return;
      }
      await kbnClient.uiSettings.update({
        [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS]: false,
        [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_DISCOVERY]: false,
      });
      await apiServices.core.settings({
        'feature_flags.overrides': {
          [STREAMS_SIGNIFICANT_EVENTS_AVAILABLE_FLAG]: false,
        },
      });
    });

    test('navigates to Nightshift page from Streams discovery', async ({ page }) => {
      await page.gotoApp('streams/_discovery/streams');

      const nightshiftButton = page.getByRole('link', { name: /nightshift/i });
      await expect(nightshiftButton).toBeVisible({ timeout: 60_000 });
      await nightshiftButton.click();

      await expect(page).toHaveURL(/\/app\/observability\/nightshift/, { timeout: 60_000 });
      await expect(page.testSubj.locator('nightshiftPage')).toBeVisible({ timeout: 60_000 });
    });
  }
);
