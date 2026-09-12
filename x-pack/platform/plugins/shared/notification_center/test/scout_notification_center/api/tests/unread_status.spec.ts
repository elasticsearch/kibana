/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { apiTest } from '../fixtures';
import { clearNotifications, createHelpers, makeDoc, seedNotifications } from '../fixtures/helpers';

const NAMESPACE = 'nc_api_unread_status_test';

apiTest.describe('Notification Center - unread status', { tag: [...tags.stateful.classic] }, () => {
  let cookieHeader: Record<string, string>;
  const h = createHelpers(() => cookieHeader);

  apiTest.beforeAll(async ({ samlAuth, esClient, apiClient }) => {
    ({ cookieHeader } = await samlAuth.asInteractiveUser('admin'));
    await h.getNotifications(apiClient);
    const markAll = await h.markAllRead(apiClient);
    const marker = Date.parse(markAll.body.read_all_before);

    await seedNotifications(esClient, [
      makeDoc('unread-status-a', {
        namespace: NAMESPACE,
        '@timestamp': new Date(marker + 1).toISOString(),
      }),
      makeDoc('unread-status-b', {
        namespace: NAMESPACE,
        '@timestamp': new Date(marker + 2).toISOString(),
      }),
    ]);
  });

  apiTest.afterAll(async ({ esClient }) => {
    await clearNotifications(esClient, NAMESPACE);
  });

  apiTest('tracks read-state transitions', async ({ apiClient }) => {
    await apiTest.step('reports unread after seeding', async () => {
      const initial = await h.getUnreadStatus(apiClient);
      expect(initial).toHaveStatusCode(200);
      expect(initial.body).toStrictEqual({ hasUnread: true });
    });

    await apiTest.step('scan looks past the newest override', async () => {
      // The newer of the two, so the scan has to look past its override to stay correct.
      expect(await h.markRead(apiClient, { notification_id: 'unread-status-b' })).toHaveStatusCode(
        200
      );
      const afterMarkRead = await h.getUnreadStatus(apiClient);
      expect(afterMarkRead).toHaveStatusCode(200);
      expect(afterMarkRead.body).toStrictEqual({ hasUnread: true });
    });

    await apiTest.step('mark-all-read clears the badge', async () => {
      expect(await h.markAllRead(apiClient)).toHaveStatusCode(200);
      const afterMarkAllRead = await h.getUnreadStatus(apiClient);
      expect(afterMarkAllRead).toHaveStatusCode(200);
      expect(afterMarkAllRead.body).toStrictEqual({ hasUnread: false });
    });
  });
});
