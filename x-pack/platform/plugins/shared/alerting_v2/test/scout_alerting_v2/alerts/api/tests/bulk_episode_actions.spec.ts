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
  BULK_ACK_EPISODE_ACTION_URL,
  BULK_ACTIVATE_EPISODE_ACTION_URL,
  BULK_ASSIGN_EPISODE_ACTION_URL,
  BULK_DEACTIVATE_EPISODE_ACTION_URL,
  BULK_UNACK_EPISODE_ACTION_URL,
  NO_ACCESS_ROLE,
  testData,
} from '../fixtures';

apiTest.describe('Bulk episode actions API', { tag: '@local-stateful-classic' }, () => {
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
    'bulk ack: processes valid items and persists one doc per episode',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'bulk-episode-ack-rule';
      const groupHashOne = 'bulk-episode-ack-group-one';
      const groupHashTwo = 'bulk-episode-ack-group-two';
      const episodeIdOne = 'bulk-episode-ack-episode-one';
      const episodeIdTwo = 'bulk-episode-ack-episode-two';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHashOne,
          episode: { id: episodeIdOne, status: 'active' },
        }),
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHashTwo,
          episode: { id: episodeIdTwo, status: 'active' },
        }),
      ]);

      const response = await apiClient.post(BULK_ACK_EPISODE_ACTION_URL, {
        headers: writerHeaders,
        body: { items: [{ episode_id: episodeIdOne }, { episode_id: episodeIdTwo }] },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ affected_count: 2, errors: [] });

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['ack'],
      });
      expect(actions).toHaveLength(2);

      const firstAction = actions.find((doc) => doc.episode_id === episodeIdOne);
      const secondAction = actions.find((doc) => doc.episode_id === episodeIdTwo);

      // The group_hash is resolved server-side from the episode's events.
      expect(firstAction).toMatchObject({
        action_type: 'ack',
        group_hash: groupHashOne,
        episode_id: episodeIdOne,
        rule_id: ruleId,
      });
      expect(secondAction).toMatchObject({
        action_type: 'ack',
        group_hash: groupHashTwo,
        episode_id: episodeIdTwo,
        rule_id: ruleId,
      });
    }
  );

  apiTest('bulk unack: persists the unack doc', async ({ apiClient, apiServices }) => {
    const ruleId = 'bulk-episode-unack-rule';
    const groupHash = 'bulk-episode-unack-group';
    const episodeId = 'bulk-episode-unack-episode';

    await apiServices.alertingV2.ruleEvents.seed([
      buildAlertEvent({
        rule: { id: ruleId, version: 1 },
        group_hash: groupHash,
        episode: { id: episodeId, status: 'active' },
      }),
    ]);

    const response = await apiClient.post(BULK_UNACK_EPISODE_ACTION_URL, {
      headers: writerHeaders,
      body: { items: [{ episode_id: episodeId }] },
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body).toStrictEqual({ affected_count: 1, errors: [] });

    const actions = await apiServices.alertingV2.alertActionsEvents.find({
      ruleId,
      actionTypes: ['unack'],
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      action_type: 'unack',
      group_hash: groupHash,
      episode_id: episodeId,
      rule_id: ruleId,
    });
  });

  apiTest(
    'bulk assign: persists the assign doc with its assignee_uid',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'bulk-episode-assign-rule';
      const groupHash = 'bulk-episode-assign-group';
      const episodeId = 'bulk-episode-assign-episode';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          episode: { id: episodeId, status: 'active' },
        }),
      ]);

      const response = await apiClient.post(BULK_ASSIGN_EPISODE_ACTION_URL, {
        headers: writerHeaders,
        body: { items: [{ episode_id: episodeId, assignee_uid: 'u_someone' }] },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ affected_count: 1, errors: [] });

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['assign'],
      });
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        action_type: 'assign',
        group_hash: groupHash,
        episode_id: episodeId,
        rule_id: ruleId,
        assignee_uid: 'u_someone',
      });
    }
  );

  apiTest(
    'partial success: reports ALERT_EPISODE_NOT_FOUND when some episode_ids are unknown',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'bulk-episode-partial-rule';
      const knownGroup = 'bulk-episode-partial-known-group';
      const knownEpisode = 'bulk-episode-partial-known-episode';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: knownGroup,
          episode: { id: knownEpisode, status: 'active' },
        }),
      ]);

      const response = await apiClient.post(BULK_ACK_EPISODE_ACTION_URL, {
        headers: writerHeaders,
        body: {
          items: [
            { episode_id: knownEpisode },
            { episode_id: 'bulk-episode-partial-unknown-episode' },
          ],
        },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.affected_count).toBe(1);
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].id).toBe('bulk-episode-partial-unknown-episode');
      expect(response.body.errors[0].error.code).toBe('ALERT_EPISODE_NOT_FOUND');

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['ack'],
      });
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        action_type: 'ack',
        group_hash: knownGroup,
        episode_id: knownEpisode,
      });
    }
  );

  apiTest(
    'partial success: reports a per-item error for every item when every episode_id is unknown',
    async ({ apiClient, apiServices }) => {
      const response = await apiClient.post(BULK_UNACK_EPISODE_ACTION_URL, {
        headers: writerHeaders,
        body: {
          items: [
            { episode_id: 'bulk-episode-allinvalid-1' },
            { episode_id: 'bulk-episode-allinvalid-2' },
          ],
        },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.affected_count).toBe(0);
      expect(response.body.errors).toHaveLength(2);
      expect(
        response.body.errors.map((e: { error: { code: string } }) => e.error.code)
      ).toStrictEqual(['ALERT_EPISODE_NOT_FOUND', 'ALERT_EPISODE_NOT_FOUND']);

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        actionTypes: ['unack'],
      });
      expect(actions).toHaveLength(0);
    }
  );

  apiTest(
    'lifecycle: bulk deactivate writes the synthetic .rule-events doc and flips episode.status to inactive',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'bulk-deactivate-rule';
      const groupHash = 'bulk-deactivate-group';
      const episodeId = 'bulk-deactivate-episode';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          status: 'breached',
          source: 'engine-x',
          type: 'alert',
          episode: { id: episodeId, status: 'active' },
        }),
      ]);

      const response = await apiClient.post(BULK_DEACTIVATE_EPISODE_ACTION_URL, {
        headers: writerHeaders,
        body: { items: [{ episode_id: episodeId, reason: 'bulk deactivate' }] },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ affected_count: 1, errors: [] });

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['deactivate'],
      });
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        action_type: 'deactivate',
        group_hash: groupHash,
        episode_id: episodeId,
        rule_id: ruleId,
        reason: 'bulk deactivate',
      });

      // The bulk dispatch must produce the synthetic rule-event so the next
      // UI/API read sees the deactivation immediately, without waiting for
      // the next rule run. The `source` is propagated from the last
      // engine-emitted event, not hardcoded, so the synthetic doc stays
      // consistent with the alert lineage.
      const latestStates = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(ruleId);
      expect(latestStates.get(groupHash)).toMatchObject({
        rule: { id: ruleId },
        group_hash: groupHash,
        status: 'recovered',
        source: 'engine-x',
        type: 'alert',
        episode: { id: episodeId, status: 'inactive' },
      });
    }
  );

  apiTest(
    'lifecycle: bulk activate writes the synthetic .rule-events doc and flips episode.status to active + breached',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'bulk-activate-rule';
      const groupHash = 'bulk-activate-group';
      const episodeId = 'bulk-activate-episode';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          status: 'recovered',
          source: 'engine-x',
          type: 'alert',
          episode: { id: episodeId, status: 'inactive' },
        }),
      ]);

      const response = await apiClient.post(BULK_ACTIVATE_EPISODE_ACTION_URL, {
        headers: writerHeaders,
        body: { items: [{ episode_id: episodeId, reason: 'bulk activate' }] },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ affected_count: 1, errors: [] });

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['activate'],
      });
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        action_type: 'activate',
        group_hash: groupHash,
        episode_id: episodeId,
        reason: 'bulk activate',
      });

      // The synthetic activate doc propagates `source` from the current
      // alert event (the seeded inactive doc from a prior recovery),
      // so the reopened event stays consistent with the alert lineage.
      const latestStates = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(ruleId);
      expect(latestStates.get(groupHash)).toMatchObject({
        rule: { id: ruleId },
        group_hash: groupHash,
        status: 'breached',
        source: 'engine-x',
        type: 'alert',
        episode: { id: episodeId, status: 'active' },
      });
    }
  );

  apiTest(
    'lifecycle: reports INVALID_EPISODE_STATE_TRANSITION for a bulk deactivate item whose episode is already inactive',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'bulk-skip-deactivate-rule';
      const episodeIdOk = 'bulk-skip-deactivate-ok-episode';
      const episodeIdInactive = 'bulk-skip-deactivate-inactive-episode';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: 'bulk-skip-deactivate-ok-group',
          status: 'breached',
          type: 'alert',
          episode: { id: episodeIdOk, status: 'active' },
        }),
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: 'bulk-skip-deactivate-inactive-group',
          status: 'recovered',
          type: 'alert',
          episode: { id: episodeIdInactive, status: 'inactive' },
        }),
      ]);

      const response = await apiClient.post(BULK_DEACTIVATE_EPISODE_ACTION_URL, {
        headers: writerHeaders,
        body: {
          items: [
            { episode_id: episodeIdOk, reason: 'should write' },
            { episode_id: episodeIdInactive, reason: 'should be skipped' },
          ],
        },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.affected_count).toBe(1);
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].id).toBe(episodeIdInactive);
      expect(response.body.errors[0].error.code).toBe('INVALID_EPISODE_STATE_TRANSITION');

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['deactivate'],
      });
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        episode_id: episodeIdOk,
        action_type: 'deactivate',
        reason: 'should write',
      });
    }
  );

  apiTest(
    'lifecycle: reports INVALID_EPISODE_STATE_TRANSITION for a bulk activate item whose episode is still active',
    async ({ apiClient, apiServices }) => {
      const ruleId = 'bulk-skip-activate-rule';
      const groupHash = 'bulk-skip-activate-group';
      const episodeId = 'bulk-skip-activate-episode';

      await apiServices.alertingV2.ruleEvents.seed([
        buildAlertEvent({
          rule: { id: ruleId, version: 1 },
          group_hash: groupHash,
          status: 'breached',
          type: 'alert',
          episode: { id: episodeId, status: 'active' },
        }),
      ]);

      const response = await apiClient.post(BULK_ACTIVATE_EPISODE_ACTION_URL, {
        headers: writerHeaders,
        body: { items: [{ episode_id: episodeId, reason: 'precondition will fail' }] },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.affected_count).toBe(0);
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].id).toBe(episodeId);
      expect(response.body.errors[0].error.code).toBe('INVALID_EPISODE_STATE_TRANSITION');

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['activate'],
      });
      expect(actions).toHaveLength(0);

      // The latest .rule-events state must remain unchanged.
      const latestStates = await apiServices.alertingV2.ruleEvents.getLatestEpisodeStates(ruleId);
      expect(latestStates.get(groupHash)).toMatchObject({
        episode: { id: episodeId, status: 'active' },
      });
    }
  );

  apiTest(
    'lifecycle: reports ALERT_EPISODE_NOT_LATEST for a bulk activate item targeting a superseded episode',
    async ({ apiClient, apiServices }) => {
      // Lifecycle actions are guarded to the latest episode of the series;
      // in bulk the guard is reported per item, keyed by the episode_id.
      const ruleId = 'bulk-not-latest-rule';
      const groupHash = 'bulk-not-latest-group';
      const olderEpisodeId = 'bulk-not-latest-older';
      const newerEpisodeId = 'bulk-not-latest-newer';
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

      const response = await apiClient.post(BULK_ACTIVATE_EPISODE_ACTION_URL, {
        headers: writerHeaders,
        body: { items: [{ episode_id: olderEpisodeId, reason: 'reopen old' }] },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.affected_count).toBe(0);
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].id).toBe(olderEpisodeId);
      expect(response.body.errors[0].error.code).toBe('ALERT_EPISODE_NOT_LATEST');
      expect(response.body.errors[0].error.details).toMatchObject({ group_hash: groupHash });

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['activate'],
      });
      expect(actions).toHaveLength(0);
    }
  );

  apiTest(
    'lifecycle: bulk ack succeeds on a superseded episode',
    async ({ apiClient, apiServices }) => {
      // The latest-episode guard only applies to lifecycle actions;
      // ack/unack/assign still work on superseded episodes.
      const ruleId = 'bulk-ack-superseded-rule';
      const groupHash = 'bulk-ack-superseded-group';
      const olderEpisodeId = 'bulk-ack-superseded-older';
      const newerEpisodeId = 'bulk-ack-superseded-newer';
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

      const response = await apiClient.post(BULK_ACK_EPISODE_ACTION_URL, {
        headers: writerHeaders,
        body: { items: [{ episode_id: olderEpisodeId }] },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ affected_count: 1, errors: [] });

      const actions = await apiServices.alertingV2.alertActionsEvents.find({
        ruleId,
        actionTypes: ['ack'],
      });
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        action_type: 'ack',
        group_hash: groupHash,
        episode_id: olderEpisodeId,
        rule_id: ruleId,
      });
    }
  );

  apiTest('schema: rejects a bare array body with 400', async ({ apiClient }) => {
    // The body must be an `{ items: [...] }` envelope, not a bare array.
    const response = await apiClient.post(BULK_ACK_EPISODE_ACTION_URL, {
      headers: writerHeaders,
      body: [{ episode_id: 'any-episode' }],
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects empty items with 400', async ({ apiClient }) => {
    const response = await apiClient.post(BULK_ACK_EPISODE_ACTION_URL, {
      headers: writerHeaders,
      body: { items: [] },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects more than 100 items with 400', async ({ apiClient }) => {
    const items = Array.from({ length: 101 }, (_v, i) => ({
      episode_id: `bulk-episode-too-many-${i}`,
    }));

    const response = await apiClient.post(BULK_ACK_EPISODE_ACTION_URL, {
      headers: writerHeaders,
      body: { items },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects an unknown envelope key with 400', async ({ apiClient }) => {
    // The envelope is strict: only `items` is accepted.
    const response = await apiClient.post(BULK_ACK_EPISODE_ACTION_URL, {
      headers: writerHeaders,
      body: { items: [{ episode_id: 'any-episode' }], dry_run: true },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects an item missing episode_id with 400', async ({ apiClient }) => {
    const response = await apiClient.post(BULK_ASSIGN_EPISODE_ACTION_URL, {
      headers: writerHeaders,
      body: { items: [{ assignee_uid: 'u_someone' }] },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects an item carrying action_type with 400', async ({ apiClient }) => {
    // The verb is in the path now, so action_type is an unrecognized key
    // for the strict item schema.
    const response = await apiClient.post(BULK_ACK_EPISODE_ACTION_URL, {
      headers: writerHeaders,
      body: { items: [{ episode_id: 'any-episode', action_type: 'ack' }] },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('schema: rejects an item carrying group_hash with 400', async ({ apiClient }) => {
    // Episode items are identified by episode_id only; the group_hash is
    // resolved server-side, so sending it is an unrecognized key.
    const response = await apiClient.post(BULK_ACK_EPISODE_ACTION_URL, {
      headers: writerHeaders,
      body: { items: [{ episode_id: 'any-episode', group_hash: 'any-group' }] },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest(
    'schema: rejects an item with an invalid per-action body with 400',
    async ({ apiClient }) => {
      // Assign items require an `assignee_uid`; omitting it should fail
      // validation.
      const response = await apiClient.post(BULK_ASSIGN_EPISODE_ACTION_URL, {
        headers: writerHeaders,
        body: { items: [{ episode_id: 'any-episode' }] },
      });

      expect(response).toHaveStatusCode(400);
      expect(response.body.code).toBe('BAD_REQUEST');
    }
  );

  apiTest('schema: rejects an item with empty episode_id with 400', async ({ apiClient }) => {
    const response = await apiClient.post(BULK_ACK_EPISODE_ACTION_URL, {
      headers: writerHeaders,
      body: { items: [{ episode_id: '' }] },
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest(
    'schema: rejects an item with episode_id over 150 chars with 400',
    async ({ apiClient }) => {
      const response = await apiClient.post(BULK_ACK_EPISODE_ACTION_URL, {
        headers: writerHeaders,
        body: { items: [{ episode_id: 'a'.repeat(151) }] },
      });

      expect(response).toHaveStatusCode(400);
      expect(response.body.code).toBe('BAD_REQUEST');
    }
  );

  apiTest(
    'schema: rejects an item with unknown body fields (strict mode) with 400',
    async ({ apiClient }) => {
      const response = await apiClient.post(BULK_ACK_EPISODE_ACTION_URL, {
        headers: writerHeaders,
        body: { items: [{ episode_id: 'any-episode', unknownField: 'x' }] },
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

      const response = await apiClient.post(BULK_ACK_EPISODE_ACTION_URL, {
        headers: { ...testData.COMMON_HEADERS, ...readerCredentials.apiKeyHeader },
        body: { items: [{ episode_id: 'bulk-episode-authz-read-episode' }] },
      });

      expect(response).toHaveStatusCode(403);
    }
  );

  apiTest(
    'authorization: returns 403 for a user without alerting_v2 privileges',
    async ({ apiClient, requestAuth }) => {
      const noAccessCredentials = await requestAuth.getApiKeyForCustomRole(NO_ACCESS_ROLE);

      const response = await apiClient.post(BULK_ACK_EPISODE_ACTION_URL, {
        headers: { ...testData.COMMON_HEADERS, ...noAccessCredentials.apiKeyHeader },
        body: { items: [{ episode_id: 'bulk-episode-authz-none-episode' }] },
      });

      expect(response).toHaveStatusCode(403);
    }
  );
});
