/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { apiTest } from '../fixtures';
import { createHelpers } from '../fixtures/helpers';

// API-key auth carries no user profile, so `userStorage.asScoped` yields no client and the
// read-state routes have nowhere to persist. GET carries no read-state and stays available.
apiTest.describe(
  'Notification Center - read-state routes without a user profile',
  { tag: [...tags.stateful.classic] },
  () => {
    let apiKeyHeader: Record<string, string>;
    const h = createHelpers(() => apiKeyHeader);

    apiTest.beforeAll(async ({ requestAuth }) => {
      ({ apiKeyHeader } = await requestAuth.getApiKey('admin'));
    });

    apiTest('mark read is forbidden', async ({ apiClient }) => {
      expect(
        await h.markRead(apiClient, { notification_id: 'inference:modelStatus:model-1' })
      ).toHaveStatusCode(403);
    });

    apiTest('mark all read is forbidden', async ({ apiClient }) => {
      expect(await h.markAllRead(apiClient)).toHaveStatusCode(403);
    });

    apiTest('unread status is forbidden', async ({ apiClient }) => {
      expect(await h.getUnreadStatus(apiClient)).toHaveStatusCode(403);
    });

    // Listing must stay open to profile-less callers: they get items with `isRead`
    // omitted rather than a 403.
    apiTest('listing notifications stays available', async ({ apiClient }) => {
      const response = await h.getNotifications(apiClient);
      expect(response).toHaveStatusCode(200);
      expect(Array.isArray(response.body.items)).toBe(true);
    });
  }
);
