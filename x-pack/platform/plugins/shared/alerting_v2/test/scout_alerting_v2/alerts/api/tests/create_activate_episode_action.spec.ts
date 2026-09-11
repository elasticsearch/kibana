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
  getActivateEpisodeActionUrl,
  NO_ACCESS_ROLE,
  testData,
} from '../fixtures';

apiTest.describe('Create activate episode action API', { tag: '@local-stateful-classic' }, () => {
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
    'activate: writes an activate action and returns 204',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'activate-happy-rule';
      const groupHash = 'activate-happy-group';
      const episodeId = 'activate-happy-episode';
      const reason = 'reopen this';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          status: 'recovered',
          type: 'alert',
          episode: { id: episodeId, status: 'inactive' },
        }),
      ]);

      const response = await apiClient.post(getActivateEpisodeActionUrl(episodeId), {
        headers: writerHeaders,
        body: { reason },
      });
      expect(response).toHaveStatusCode(204);

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['activate'],
      });
      expect(actions).toHaveLength(1);
      // The group_hash is resolved server-side from the episode's events.
      expect(actions[0]).toMatchObject({
        action_type: 'activate',
        group_hash: groupHash,
        episode_id: episodeId,
        rule_id: ruleId,
        space_id: 'default',
        reason,
      });
    }
  );

  apiTest(
    'activate: writes a synthetic .rule-events doc that flips the episode back to active + breached',
    async ({ apiClient, apiServices }) => {
      // The synthetic doc always carries `status: breached` +
      // `episode.status: active`, `@timestamp: now`, and reuses
      // `episode.id` (reopen = incident continuity). Other fields
      // (rule.version, data, severity, space_id) are propagated from
      // the current alert event.
      const ruleId = 'activate-rule-event-rule';
      const groupHash = 'activate-rule-event-group';
      const episodeId = 'activate-rule-event-episode';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 7 },
          group_hash: groupHash,
          status: 'recovered',
          type: 'alert',
          data: { 'host.name': 'host-a' },
          severity: 'high',
          episode: { id: episodeId, status: 'inactive' },
        }),
      ]);

      const response = await apiClient.post(getActivateEpisodeActionUrl(episodeId), {
        headers: writerHeaders,
        body: { reason: 'manual reopen' },
      });
      expect(response).toHaveStatusCode(204);

      // Two rule events exist now: the seeded inactive event and the
      // new activate-synthetic (active/breached).
      const activeBreached = await apiServices.alertingV2.ruleEvents.find(ruleId, {
        status: 'breached',
        type: 'alert',
        episodeStatus: 'active',
      });
      expect(activeBreached).toHaveLength(1);

      const latestStates = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(ruleId);
      expect(latestStates.get(groupHash)).toMatchObject({
        rule: { id: ruleId, version: 7 },
        group_hash: groupHash,
        status: 'breached',
        type: 'alert',
        episode: { id: episodeId, status: 'active' },
        data: { 'host.name': 'host-a' },
        severity: 'high',
        space_id: 'default',
      });
    }
  );

  apiTest('schema: rejects body missing reason with 400', async ({ apiClient }) => {
    const response = await apiClient.post(getActivateEpisodeActionUrl('any-episode'), {
      headers: writerHeaders,
      body: {},
    });
    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects empty reason with 400', async ({ apiClient }) => {
    const response = await apiClient.post(getActivateEpisodeActionUrl('any-episode'), {
      headers: writerHeaders,
      body: { reason: '' },
    });
    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects reason over 1024 chars with 400', async ({ apiClient }) => {
    const response = await apiClient.post(getActivateEpisodeActionUrl('any-episode'), {
      headers: writerHeaders,
      body: { reason: 'a'.repeat(1025) },
    });
    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects unknown body fields (strict mode) with 400', async ({ apiClient }) => {
    const response = await apiClient.post(getActivateEpisodeActionUrl('any-episode'), {
      headers: writerHeaders,
      body: { reason: 'valid', extra: 'nope' },
    });
    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects episode_id over 150 chars with 400', async ({ apiClient }) => {
    const response = await apiClient.post(getActivateEpisodeActionUrl('a'.repeat(151)), {
      headers: writerHeaders,
      body: { reason: 'valid reason' },
    });
    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('returns 404 when episode_id matches no events', async ({ apiClient }) => {
    const response = await apiClient.post(getActivateEpisodeActionUrl('unknown-episode'), {
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
      // Lifecycle actions are guarded to the latest episode: reopening a
      // superseded episode would write a synthetic .rule-events doc that
      // hijacks the group's state machine.
      const ruleId = 'activate-not-latest-rule';
      const groupHash = 'activate-not-latest-group';
      const olderEpisodeId = 'activate-not-latest-older';
      const newerEpisodeId = 'activate-not-latest-newer';
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

      const response = await apiClient.post(getActivateEpisodeActionUrl(olderEpisodeId), {
        headers: writerHeaders,
        body: { reason: 'reopen the old one' },
      });

      expect(response).toHaveStatusCode(404);
      expect(response.body.code).toBe('ALERT_EPISODE_NOT_LATEST');
      expect(response.body.details).toMatchObject({
        episode_id: olderEpisodeId,
        group_hash: groupHash,
      });

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['activate'],
      });
      expect(actions).toHaveLength(0);
    }
  );

  apiTest(
    'precondition: rejects activate when the episode is already active',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'activate-already-active-rule';
      const groupHash = 'activate-already-active-group';
      const episodeId = 'activate-already-active-episode';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          status: 'breached',
          type: 'alert',
          episode: { id: episodeId, status: 'active' },
        }),
      ]);

      const response = await apiClient.post(getActivateEpisodeActionUrl(episodeId), {
        headers: writerHeaders,
        body: { reason: 'reopen' },
      });

      expect(response).toHaveStatusCode(400);
      expect(response.body.code).toBe('INVALID_EPISODE_STATE_TRANSITION');

      const ruleEvents = await apiServices.alertingV2.ruleEvents.find(ruleId);
      expect(ruleEvents).toHaveLength(1);
      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['activate'],
      });

      expect(actions).toHaveLength(0);
    }
  );

  apiTest(
    'activate: allows a recovering episode to be reopened (cancel the wind-down)',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'activate-recovering-rule';
      const groupHash = 'activate-recovering-group';
      const episodeId = 'activate-recovering-episode';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          status: 'recovered',
          type: 'alert',
          episode: { id: episodeId, status: 'recovering', status_count: 2 },
        }),
      ]);

      const response = await apiClient.post(getActivateEpisodeActionUrl(episodeId), {
        headers: writerHeaders,
        body: { reason: 'cancel recovery' },
      });

      expect(response).toHaveStatusCode(204);

      const latestStates = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(ruleId);
      expect(latestStates.get(groupHash)).toMatchObject({
        episode: { id: episodeId, status: 'active' },
        status: 'breached',
      });
    }
  );

  apiTest(
    'activate: allows a pending episode to be forced past the activation counter',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'activate-pending-rule';
      const groupHash = 'activate-pending-group';
      const episodeId = 'activate-pending-episode';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          status: 'breached',
          type: 'alert',
          episode: { id: episodeId, status: 'pending', status_count: 1 },
        }),
      ]);

      const response = await apiClient.post(getActivateEpisodeActionUrl(episodeId), {
        headers: writerHeaders,
        body: { reason: 'force active' },
      });

      expect(response).toHaveStatusCode(204);

      const latestStates = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(ruleId);
      expect(latestStates.get(groupHash)).toMatchObject({
        episode: { id: episodeId, status: 'active' },
        status: 'breached',
      });
    }
  );

  apiTest(
    'activate: allows reopen of a naturally-recovered (never user-deactivated) episode',
    async ({ apiClient, apiServices }) => {
      // The episode reached `inactive` through the normal FSM — no
      // deactivate audit row exists. Users can still reopen it: the
      // contract is "any inactive episode is reactivatable", regardless
      // of how it got there (user deactivate vs engine recovery). This
      // gives users agency to reopen alerts the engine closed
      // prematurely, without having to distinguish origin.
      const ruleId = 'activate-natural-recovery-rule';
      const groupHash = 'activate-natural-recovery-group';
      const episodeId = 'activate-natural-recovery-episode';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          status: 'recovered',
          type: 'alert',
          episode: { id: episodeId, status: 'inactive' },
        }),
      ]);

      const response = await apiClient.post(getActivateEpisodeActionUrl(episodeId), {
        headers: writerHeaders,
        body: { reason: 'reopen' },
      });
      expect(response).toHaveStatusCode(204);

      const activateActions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['activate'],
      });
      expect(activateActions).toHaveLength(1);
      expect(activateActions[0]).toMatchObject({
        action_type: 'activate',
        group_hash: groupHash,
        episode_id: episodeId,
      });

      const latestStates = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(ruleId);
      expect(latestStates.get(groupHash)).toMatchObject({
        episode: { id: episodeId, status: 'active' },
        status: 'breached',
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
        getActivateEpisodeActionUrl('activate-authz-read-episode'),
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
        getActivateEpisodeActionUrl('activate-authz-none-episode'),
        {
          headers: { ...testData.COMMON_HEADERS, ...noAccessCredentials.apiKeyHeader },
          body: { reason: 'valid reason' },
        }
      );
      expect(response).toHaveStatusCode(403);
    }
  );
});
