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
  getUnackEpisodeActionUrl,
  NO_ACCESS_ROLE,
  testData,
} from '../fixtures';

apiTest.describe('Create unack episode action API', { tag: '@local-stateful-classic' }, () => {
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

  apiTest('unack: writes an unack action and returns 204', async ({ apiClient, apiServices }) => {
    const ruleId = 'unack-happy-rule';
    const groupHash = 'unack-happy-group';
    const episodeId = 'unack-happy-episode';
    await apiServices.alertingV2.ruleEvents.seed([
      buildAlertEvent({
        rule: { id: ruleId, version: 1 },
        group_hash: groupHash,
        episode: { id: episodeId, status: 'active' },
      }),
    ]);
    const response = await apiClient.post(getUnackEpisodeActionUrl(episodeId), {
      headers: writerHeaders,
      body: {},
    });
    expect(response).toHaveStatusCode(204);
    const actions = await apiServices.alertingV2.alertActionsEvents.find({
      ruleId,
      actionTypes: ['unack'],
    });
    expect(actions).toHaveLength(1);
    // The group_hash is resolved server-side from the episode's events.
    expect(actions[0]).toMatchObject({
      action_type: 'unack',
      group_hash: groupHash,
      episode_id: episodeId,
      rule_id: ruleId,
      space_id: 'default',
    });
  });

  apiTest(
    'unack: audit actions work on old (superseded) episodes',
    async ({ apiClient, apiServices }) => {
      // Two episodes for the same series: the older one closed, a newer one
      // is active. Unack is a pure audit record, so unacking the OLDER
      // episode must succeed and the persisted doc must carry the older
      // episode id.
      const ruleId = 'unack-old-episode-rule';
      const groupHash = 'unack-old-episode-group';
      const olderEpisodeId = 'unack-old-episode-older';
      const newerEpisodeId = 'unack-old-episode-newer';
      const now = Date.now();

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          '@timestamp': new Date(now - 60_000).toISOString(),
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          status: 'recovered',
          episode: { id: olderEpisodeId, status: 'inactive' },
        }),
        buildAlertEvent({
          '@timestamp': new Date(now).toISOString(),
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          episode: { id: newerEpisodeId, status: 'active' },
        }),
      ]);

      const response = await apiClient.post(getUnackEpisodeActionUrl(olderEpisodeId), {
        headers: writerHeaders,
        body: {},
      });
      expect(response).toHaveStatusCode(204);

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['unack'],
      });
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        action_type: 'unack',
        group_hash: groupHash,
        episode_id: olderEpisodeId,
      });
    }
  );

  apiTest(
    'schema: rejects episode_id in the body (strict mode) with 400',
    async ({ apiClient }) => {
      // The episode id moved to the path; the unack body must be empty.
      const response = await apiClient.post(getUnackEpisodeActionUrl('any-episode'), {
        headers: writerHeaders,
        body: { episode_id: 'any-episode' },
      });
      expect(response).toHaveStatusCode(400);
      expect(response.body.code).toBe('BAD_REQUEST');
    }
  );

  apiTest('schema: rejects unknown body fields (strict mode) with 400', async ({ apiClient }) => {
    const response = await apiClient.post(getUnackEpisodeActionUrl('any-episode'), {
      headers: writerHeaders,
      body: { extra: 'nope' },
    });
    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects episode_id over 150 chars with 400', async ({ apiClient }) => {
    const response = await apiClient.post(getUnackEpisodeActionUrl('a'.repeat(151)), {
      headers: writerHeaders,
      body: {},
    });
    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('returns 404 when episode_id matches no events', async ({ apiClient }) => {
    const response = await apiClient.post(getUnackEpisodeActionUrl('unknown-episode'), {
      headers: writerHeaders,
      body: {},
    });
    expect(response).toHaveStatusCode(404);
    expect(response.body.code).toBe('ALERT_EPISODE_NOT_FOUND');
    expect(response.body.details).toMatchObject({ episode_id: 'unknown-episode' });
  });

  apiTest(
    'authorization: returns 403 for a user with read-only alerting_v2 privileges',
    async ({ apiClient, requestAuth }) => {
      const readerCredentials = await requestAuth.getApiKeyForCustomRole(
        ALERTING_V2_ALERTS_READ_ROLE
      );
      const response = await apiClient.post(getUnackEpisodeActionUrl('unack-authz-read-episode'), {
        headers: { ...testData.COMMON_HEADERS, ...readerCredentials.apiKeyHeader },
        body: {},
      });
      expect(response).toHaveStatusCode(403);
    }
  );

  apiTest(
    'authorization: returns 403 for a user without alerting_v2 privileges',
    async ({ apiClient, requestAuth }) => {
      const noAccessCredentials = await requestAuth.getApiKeyForCustomRole(NO_ACCESS_ROLE);
      const response = await apiClient.post(getUnackEpisodeActionUrl('unack-authz-none-episode'), {
        headers: { ...testData.COMMON_HEADERS, ...noAccessCredentials.apiKeyHeader },
        body: {},
      });
      expect(response).toHaveStatusCode(403);
    }
  );
});
