/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import type { RoleApiCredentials } from '@kbn/scout';
import {
  ALERTING_V2_ALERTS_ALL_ROLE,
  ALERTING_V2_ALERTS_READ_ROLE,
  apiTest,
  buildAlertEvent,
  BULK_SNOOZE_SERIES_ACTION_URL,
  BULK_TAG_SERIES_ACTION_URL,
  BULK_UNSNOOZE_SERIES_ACTION_URL,
  NO_ACCESS_ROLE,
  testData,
} from '../fixtures';

apiTest.describe('Bulk series actions API', { tag: '@local-stateful-classic' }, () => {
  let writerCredentials: RoleApiCredentials;
  let writerHeaders: Record<string, string>;

  apiTest.beforeAll(async ({ requestAuth }) => {
    writerCredentials = await requestAuth.getApiKeyForCustomRole(ALERTING_V2_ALERTS_ALL_ROLE);
    writerHeaders = { ...testData.COMMON_HEADERS, ...writerCredentials.apiKeyHeader };
  });

  apiTest.beforeEach(async ({ apiServices }) => {
    await apiServices.alertingV2.ruleEvents.cleanUp();
    await apiServices.alertingV2.alertActionsEvents.cleanUp();
  });

  apiTest.afterAll(async ({ apiServices }) => {
    await apiServices.alertingV2.ruleEvents.cleanUp();
    await apiServices.alertingV2.alertActionsEvents.cleanUp();
  });

  apiTest(
    'bulk tag: processes valid items and persists one doc per series',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'bulk-series-tag-rule';
      const groupHashOne = 'bulk-series-tag-group-one';
      const groupHashTwo = 'bulk-series-tag-group-two';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHashOne,
          episode: { id: 'bulk-series-tag-episode-one', status: 'active' },
        }),
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHashTwo,
          episode: { id: 'bulk-series-tag-episode-two', status: 'active' },
        }),
      ]);

      const response = await apiClient.post(BULK_TAG_SERIES_ACTION_URL, {
        headers: writerHeaders,
        body: {
          items: [
            { group_hash: groupHashOne, tags: ['production'] },
            { group_hash: groupHashTwo, tags: ['important', 'reviewed'] },
          ],
        },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ affected_count: 2, errors: [] });

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['tag'],
      });
      expect(actions).toHaveLength(2);

      const firstAction = actions.find((doc) => doc.group_hash === groupHashOne);
      const secondAction = actions.find((doc) => doc.group_hash === groupHashTwo);

      // Series actions target the series as a whole, so the persisted doc
      // carries `episode_id: null` even though an episode exists.
      expect(firstAction).toMatchObject({
        action_type: 'tag',
        group_hash: groupHashOne,
        episode_id: null,
        rule_id: ruleId,
        tags: ['production'],
      });
      expect(secondAction).toMatchObject({
        action_type: 'tag',
        group_hash: groupHashTwo,
        episode_id: null,
        rule_id: ruleId,
        tags: ['important', 'reviewed'],
      });
    }
  );

  apiTest(
    'bulk snooze: persists the snooze doc with its expiry',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'bulk-series-snooze-rule';
      const groupHash = 'bulk-series-snooze-group';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          episode: { id: 'bulk-series-snooze-episode', status: 'active' },
        }),
      ]);

      const response = await apiClient.post(BULK_SNOOZE_SERIES_ACTION_URL, {
        headers: writerHeaders,
        body: { items: [{ group_hash: groupHash, expiry: '2099-01-01T00:00:00Z' }] },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ affected_count: 1, errors: [] });

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['snooze'],
      });
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        action_type: 'snooze',
        group_hash: groupHash,
        episode_id: null,
        rule_id: ruleId,
        expiry: '2099-01-01T00:00:00Z',
      });
    }
  );

  apiTest('bulk unsnooze: persists the unsnooze doc', async ({ apiClient, apiServices }) => {
    const ruleId = 'bulk-series-unsnooze-rule';
    const groupHash = 'bulk-series-unsnooze-group';

    await apiServices.alertingV2.ruleEvents.seed([
      buildAlertEvent({
        rule: { id: ruleId, version: 1 },
        group_hash: groupHash,
        episode: { id: 'bulk-series-unsnooze-episode', status: 'active' },
      }),
    ]);

    const response = await apiClient.post(BULK_UNSNOOZE_SERIES_ACTION_URL, {
      headers: writerHeaders,
      body: { items: [{ group_hash: groupHash }] },
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body).toStrictEqual({ affected_count: 1, errors: [] });

    const actions = await apiServices.alertingV2.alertActionsEvents.find({
      ruleId,
      actionTypes: ['unsnooze'],
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      action_type: 'unsnooze',
      group_hash: groupHash,
      episode_id: null,
      rule_id: ruleId,
    });
  });

  apiTest(
    'partial success: reports ALERT_GROUP_NOT_FOUND when some group_hashes are unknown',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'bulk-series-partial-rule';
      const knownGroup = 'bulk-series-partial-known-group';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: knownGroup,
          episode: { id: 'bulk-series-partial-known-episode', status: 'active' },
        }),
      ]);

      const response = await apiClient.post(BULK_TAG_SERIES_ACTION_URL, {
        headers: writerHeaders,
        body: {
          items: [
            { group_hash: knownGroup, tags: ['production'] },
            { group_hash: 'bulk-series-partial-unknown-group', tags: ['x'] },
          ],
        },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.affected_count).toBe(1);
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].id).toBe('bulk-series-partial-unknown-group');
      expect(response.body.errors[0].error.code).toBe('ALERT_GROUP_NOT_FOUND');
      expect(response.body.errors[0].error.message).toBe(
        'Alert series with group_hash [bulk-series-partial-unknown-group] not found'
      );

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['tag'],
      });
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        action_type: 'tag',
        group_hash: knownGroup,
        episode_id: null,
      });
    }
  );

  apiTest(
    'partial success: reports a per-item error for every item when every group_hash is unknown',
    async ({ apiClient, apiServices }) => {
      const response = await apiClient.post(BULK_SNOOZE_SERIES_ACTION_URL, {
        headers: writerHeaders,
        body: {
          items: [
            { group_hash: 'bulk-series-allinvalid-1' },
            { group_hash: 'bulk-series-allinvalid-2' },
          ],
        },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.affected_count).toBe(0);
      expect(response.body.errors).toHaveLength(2);
      expect(
        response.body.errors.map((e: { error: { code: string } }) => e.error.code)
      ).toStrictEqual(['ALERT_GROUP_NOT_FOUND', 'ALERT_GROUP_NOT_FOUND']);

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        actionTypes: ['snooze'],
      });
      expect(actions).toHaveLength(0);
    }
  );

  apiTest('schema: rejects a bare array body with 400', async ({ apiClient }) => {
    // The body must be an `{ items: [...] }` envelope, not a bare array.
    const response = await apiClient.post(BULK_TAG_SERIES_ACTION_URL, {
      headers: writerHeaders,
      body: [{ group_hash: 'any-group', tags: ['x'] }],
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects empty items with 400', async ({ apiClient }) => {
    const response = await apiClient.post(BULK_TAG_SERIES_ACTION_URL, {
      headers: writerHeaders,
      body: { items: [] },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects more than 100 items with 400', async ({ apiClient }) => {
    const items = Array.from({ length: 101 }, (_v, i) => ({
      group_hash: `bulk-series-too-many-${i}`,
      tags: ['x'],
    }));

    const response = await apiClient.post(BULK_TAG_SERIES_ACTION_URL, {
      headers: writerHeaders,
      body: { items },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects an unknown envelope key with 400', async ({ apiClient }) => {
    // The envelope is strict: only `items` is accepted.
    const response = await apiClient.post(BULK_TAG_SERIES_ACTION_URL, {
      headers: writerHeaders,
      body: { items: [{ group_hash: 'any-group', tags: ['x'] }], dry_run: true },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects an item missing group_hash with 400', async ({ apiClient }) => {
    const response = await apiClient.post(BULK_TAG_SERIES_ACTION_URL, {
      headers: writerHeaders,
      body: { items: [{ tags: ['x'] }] },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects an item carrying action_type with 400', async ({ apiClient }) => {
    // The verb is in the path now, so action_type is an unrecognized key
    // for the strict item schema.
    const response = await apiClient.post(BULK_TAG_SERIES_ACTION_URL, {
      headers: writerHeaders,
      body: { items: [{ group_hash: 'any-group', action_type: 'tag', tags: ['x'] }] },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects an item carrying episode_id with 400', async ({ apiClient }) => {
    // Series items are identified by group_hash only, so episode_id is an
    // unrecognized key for the strict item schema.
    const response = await apiClient.post(BULK_TAG_SERIES_ACTION_URL, {
      headers: writerHeaders,
      body: { items: [{ group_hash: 'any-group', tags: ['x'], episode_id: 'some-episode' }] },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest(
    'schema: rejects an item with an invalid per-action body with 400',
    async ({ apiClient }) => {
      // Tag items require a `tags` array; sending `tags: 'string'` should
      // fail validation.
      const response = await apiClient.post(BULK_TAG_SERIES_ACTION_URL, {
        headers: writerHeaders,
        body: { items: [{ group_hash: 'any-group', tags: 'not-an-array' }] },
      });

      expect(response).toHaveStatusCode(400);
      expect(response.body.code).toBe('BAD_REQUEST');
    }
  );

  apiTest('schema: rejects an item with empty group_hash with 400', async ({ apiClient }) => {
    const response = await apiClient.post(BULK_TAG_SERIES_ACTION_URL, {
      headers: writerHeaders,
      body: { items: [{ group_hash: '', tags: ['x'] }] },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest(
    'schema: rejects an item with group_hash over 256 chars with 400',
    async ({ apiClient }) => {
      const response = await apiClient.post(BULK_TAG_SERIES_ACTION_URL, {
        headers: writerHeaders,
        body: { items: [{ group_hash: 'a'.repeat(257), tags: ['x'] }] },
      });

      expect(response).toHaveStatusCode(400);
      expect(response.body.code).toBe('BAD_REQUEST');
    }
  );

  apiTest(
    'schema: rejects an item with unknown body fields (strict mode) with 400',
    async ({ apiClient }) => {
      const response = await apiClient.post(BULK_TAG_SERIES_ACTION_URL, {
        headers: writerHeaders,
        body: { items: [{ group_hash: 'any-group', tags: ['x'], unknownField: 'x' }] },
      });

      expect(response).toHaveStatusCode(400);
      expect(response.body.code).toBe('BAD_REQUEST');
    }
  );

  apiTest(
    'authorization: returns 403 for a user with read-only alerting_v2 privileges',
    async ({ apiClient, requestAuth }) => {
      const readerCredentials = await requestAuth.getApiKeyForCustomRole(
        ALERTING_V2_ALERTS_READ_ROLE
      );

      const response = await apiClient.post(BULK_TAG_SERIES_ACTION_URL, {
        headers: { ...testData.COMMON_HEADERS, ...readerCredentials.apiKeyHeader },
        body: { items: [{ group_hash: 'bulk-series-authz-read-group', tags: ['x'] }] },
      });

      expect(response).toHaveStatusCode(403);
    }
  );

  apiTest(
    'authorization: returns 403 for a user without alerting_v2 privileges',
    async ({ apiClient, requestAuth }) => {
      const noAccessCredentials = await requestAuth.getApiKeyForCustomRole(NO_ACCESS_ROLE);

      const response = await apiClient.post(BULK_TAG_SERIES_ACTION_URL, {
        headers: { ...testData.COMMON_HEADERS, ...noAccessCredentials.apiKeyHeader },
        body: { items: [{ group_hash: 'bulk-series-authz-none-group', tags: ['x'] }] },
      });

      expect(response).toHaveStatusCode(403);
    }
  );
});
