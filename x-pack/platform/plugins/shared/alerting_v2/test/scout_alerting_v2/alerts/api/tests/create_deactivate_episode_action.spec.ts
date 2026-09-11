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
  getDeactivateEpisodeActionUrl,
  NO_ACCESS_ROLE,
  testData,
} from '../fixtures';

apiTest.describe('Create deactivate episode action API', { tag: '@local-stateful-classic' }, () => {
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
    'deactivate: writes a deactivate action and returns 204',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'deactivate-happy-rule';
      const groupHash = 'deactivate-happy-group';
      const episodeId = 'deactivate-happy-episode';
      const reason = 'no longer relevant';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          episode: { id: episodeId, status: 'active' },
        }),
      ]);

      const response = await apiClient.post(getDeactivateEpisodeActionUrl(episodeId), {
        headers: writerHeaders,
        body: { reason },
      });

      expect(response).toHaveStatusCode(204);

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['deactivate'],
      });
      expect(actions).toHaveLength(1);
      // The group_hash is resolved server-side from the episode's events.
      expect(actions[0]).toMatchObject({
        action_type: 'deactivate',
        group_hash: groupHash,
        episode_id: episodeId,
        rule_id: ruleId,
        space_id: 'default',
        reason,
      });
    }
  );

  apiTest(
    'deactivate: writes a synthetic recovered/inactive rule event carrying the prior event data',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'deactivate-rule-event-rule';
      const groupHash = 'deactivate-rule-event-group';
      const episodeId = 'deactivate-rule-event-episode';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 7 },
          group_hash: groupHash,
          episode: { id: episodeId, status: 'active' },
          data: { 'host.name': 'host-a' },
          severity: 'high',
          status: 'breached',
          type: 'alert',
        }),
      ]);

      const response = await apiClient.post(getDeactivateEpisodeActionUrl(episodeId), {
        headers: writerHeaders,
        body: { reason: 'manual close' },
      });

      expect(response).toHaveStatusCode(204);

      const ruleEvents = await apiServices.alertingV2.ruleEvents.find(ruleId, {
        status: 'recovered',
        type: 'alert',
        episodeStatus: 'inactive',
      });

      expect(ruleEvents).toHaveLength(1);
      expect(ruleEvents[0]).toMatchObject({
        rule: { id: ruleId, version: 7 },
        group_hash: groupHash,
        status: 'recovered',
        type: 'alert',
        episode: { id: episodeId, status: 'inactive' },
        data: { 'host.name': 'host-a' },
        severity: 'high',
        space_id: 'default',
      });

      // The synthetic inactive event is the latest state, so a re-breach starts a new episode.
      const latestStates = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(ruleId);
      expect(latestStates.get(groupHash)).toMatchObject({
        episode: { id: episodeId, status: 'inactive' },
      });
    }
  );

  apiTest('schema: rejects body missing reason with 400', async ({ apiClient }) => {
    const response = await apiClient.post(getDeactivateEpisodeActionUrl('any-episode'), {
      headers: writerHeaders,
      body: {},
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects empty reason with 400', async ({ apiClient }) => {
    const response = await apiClient.post(getDeactivateEpisodeActionUrl('any-episode'), {
      headers: writerHeaders,
      body: { reason: '' },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects reason over 1024 chars with 400', async ({ apiClient }) => {
    const response = await apiClient.post(getDeactivateEpisodeActionUrl('any-episode'), {
      headers: writerHeaders,
      body: { reason: 'a'.repeat(1025) },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects unknown body fields (strict mode) with 400', async ({ apiClient }) => {
    const response = await apiClient.post(getDeactivateEpisodeActionUrl('any-episode'), {
      headers: writerHeaders,
      body: { reason: 'valid', extra: 'nope' },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects episode_id over 150 chars with 400', async ({ apiClient }) => {
    const response = await apiClient.post(getDeactivateEpisodeActionUrl('a'.repeat(151)), {
      headers: writerHeaders,
      body: { reason: 'valid reason' },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('returns 404 when episode_id matches no events', async ({ apiClient }) => {
    const response = await apiClient.post(getDeactivateEpisodeActionUrl('unknown-episode'), {
      headers: writerHeaders,
      body: { reason: 'valid reason' },
    });

    expect(response).toHaveStatusCode(404);
    expect(response.body.code).toBe('ALERT_EPISODE_NOT_FOUND');
    expect(response.body.details).toMatchObject({ episode_id: 'unknown-episode' });
  });

  apiTest(
    'returns 404 when the episode exists but is not the latest of its series',
    async ({ apiClient, apiServices }) => {
      // Lifecycle actions are guarded to the latest episode: closing a
      // superseded episode would write a synthetic .rule-events doc that
      // hijacks the group's state machine.
      const ruleId = 'deactivate-not-latest-rule';
      const groupHash = 'deactivate-not-latest-group';
      const olderEpisodeId = 'deactivate-not-latest-older';
      const newerEpisodeId = 'deactivate-not-latest-newer';
      const now = Date.now();

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          '@timestamp': new Date(now - 60_000).toISOString(),
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          episode: { id: olderEpisodeId, status: 'active' },
        }),
        buildAlertEvent({
          '@timestamp': new Date(now).toISOString(),
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          episode: { id: newerEpisodeId, status: 'active' },
        }),
      ]);

      const response = await apiClient.post(getDeactivateEpisodeActionUrl(olderEpisodeId), {
        headers: writerHeaders,
        body: { reason: 'close the old one' },
      });

      expect(response).toHaveStatusCode(404);
      expect(response.body.code).toBe('ALERT_EPISODE_NOT_LATEST');
      expect(response.body.details).toMatchObject({
        episode_id: olderEpisodeId,
        group_hash: groupHash,
      });

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['deactivate'],
      });
      expect(actions).toHaveLength(0);
    }
  );

  apiTest(
    'precondition: rejects deactivate of an already-inactive episode with INVALID_EPISODE_STATE_TRANSITION (400)',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'deactivate-already-inactive-rule';
      const groupHash = 'deactivate-already-inactive-group';
      const episodeId = 'deactivate-already-inactive-episode';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          status: 'recovered',
          type: 'alert',
          episode: { id: episodeId, status: 'inactive' },
        }),
      ]);

      const response = await apiClient.post(getDeactivateEpisodeActionUrl(episodeId), {
        headers: writerHeaders,
        body: { reason: 'valid reason' },
      });

      expect(response).toHaveStatusCode(400);
      expect(response.body.code).toBe('INVALID_EPISODE_STATE_TRANSITION');

      const ruleEvents = await apiServices.alertingV2.ruleEvents.find(ruleId);
      expect(ruleEvents).toHaveLength(1);
      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['deactivate'],
      });
      expect(actions).toHaveLength(0);
    }
  );

  apiTest(
    'precondition: allows deactivate of a pending episode (forces it closed before activation)',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'deactivate-pending-rule';
      const groupHash = 'deactivate-pending-group';
      const episodeId = 'deactivate-pending-episode';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          status: 'breached',
          type: 'alert',
          episode: { id: episodeId, status: 'pending', status_count: 1 },
        }),
      ]);

      const response = await apiClient.post(getDeactivateEpisodeActionUrl(episodeId), {
        headers: writerHeaders,
        body: { reason: 'dismiss before activation' },
      });

      expect(response).toHaveStatusCode(204);

      const latestStates = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(ruleId);
      expect(latestStates.get(groupHash)).toMatchObject({
        episode: { id: episodeId, status: 'inactive' },
        status: 'recovered',
      });
    }
  );

  apiTest(
    'precondition: allows deactivate of a recovering episode',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'deactivate-recovering-rule';
      const groupHash = 'deactivate-recovering-group';
      const episodeId = 'deactivate-recovering-episode';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          status: 'recovered',
          type: 'alert',
          episode: { id: episodeId, status: 'recovering' },
        }),
      ]);

      const response = await apiClient.post(getDeactivateEpisodeActionUrl(episodeId), {
        headers: writerHeaders,
        body: { reason: 'valid reason' },
      });

      expect(response).toHaveStatusCode(204);

      const latestStates = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(ruleId);
      expect(latestStates.get(groupHash)).toMatchObject({
        episode: { id: episodeId, status: 'inactive' },
      });
    }
  );

  apiTest(
    'authorization: returns 403 for a user with read-only alerting_v2 privileges',
    async ({ apiClient, requestAuth }) => {
      const readerCredentials = await requestAuth.getApiKeyForCustomRole(
        ALERTING_V2_ALERTS_READ_ROLE
      );

      const response = await apiClient.post(
        getDeactivateEpisodeActionUrl('deactivate-authz-read-episode'),
        {
          headers: { ...testData.COMMON_HEADERS, ...readerCredentials.apiKeyHeader },
          body: { reason: 'valid reason' },
        }
      );

      expect(response).toHaveStatusCode(403);
    }
  );

  apiTest(
    'authorization: returns 403 for a user without alerting_v2 privileges',
    async ({ apiClient, requestAuth }) => {
      const noAccessCredentials = await requestAuth.getApiKeyForCustomRole(NO_ACCESS_ROLE);

      const response = await apiClient.post(
        getDeactivateEpisodeActionUrl('deactivate-authz-none-episode'),
        {
          headers: { ...testData.COMMON_HEADERS, ...noAccessCredentials.apiKeyHeader },
          body: { reason: 'valid reason' },
        }
      );

      expect(response).toHaveStatusCode(403);
    }
  );
});
