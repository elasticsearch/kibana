/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RetryService } from '@kbn/ftr-common-functional-services';

interface DiscoverAlertsMenuTestSubjects {
  click: (testSubject: string) => Promise<unknown>;
  exists: (testSubject: string) => Promise<boolean>;
  find: (testSubject: string) => Promise<{ isEnabled: () => Promise<boolean> }>;
  existOrFail: (testSubject: string) => Promise<unknown>;
}

/**
 * Opens the v1 search-threshold rule flyout from Discover's app menu.
 * Supports both the v1 popover and the alerting v2 selector flyout (legacy option).
 */
export async function openDiscoverSearchThresholdRuleFlyout({
  testSubjects,
  retry,
}: {
  testSubjects: DiscoverAlertsMenuTestSubjects;
  retry: RetryService;
}) {
  await testSubjects.click('app-menu-overflow-button');
  await testSubjects.click('discoverAlertsButton');

  await retry.try(async () => {
    if (await testSubjects.exists('createAlertFlyoutLoading')) {
      throw new Error('Waiting for alert rule options flyout to load');
    }

    if (await testSubjects.exists('discoverLegacySearchThresholdRule')) {
      await testSubjects.click('discoverLegacySearchThresholdRule');
      return;
    }

    if (await testSubjects.exists('discoverCreateAlertButton')) {
      const createButton = await testSubjects.find('discoverCreateAlertButton');
      if (await createButton.isEnabled()) {
        await testSubjects.click('discoverCreateAlertButton');
        return;
      }
    }

    throw new Error('Waiting for search threshold rule option in the Discover alerts menu');
  });

  await testSubjects.existOrFail('addRuleFlyoutTitle');
}
