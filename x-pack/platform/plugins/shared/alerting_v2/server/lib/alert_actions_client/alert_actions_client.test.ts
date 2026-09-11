/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { UserProfileServiceStart } from '@kbn/core-user-profile-server';
import type { DeeplyMockedApi } from '@kbn/core-elasticsearch-client-server-mocks';
import type {
  BulkCreateEpisodeAlertActionItemBody,
  BulkCreateSeriesAlertActionItemBody,
} from '@kbn/alerting-v2-schemas';
import { ALERT_EPISODE_ACTION_TYPE } from '@kbn/alerting-v2-schemas';
import type { AlertActionEventPublisher } from '../events/alert_action_event_publisher/alert_action_event_publisher';
import type { AlertActionsClient } from './alert_actions_client';
import { createAlertActionsClient } from './alert_actions_client.mock';
import { getAlertEventESQLResponse, getEmptyESQLResponse } from './fixtures/query_responses';

describe('AlertActionsClient', () => {
  jest.useFakeTimers().setSystemTime(new Date('2025-01-01T11:12:13.000Z'));
  let client: AlertActionsClient;
  let queryServiceEsClient: DeeplyMockedApi<ElasticsearchClient>;
  let storageServiceEsClient: jest.Mocked<ElasticsearchClient>;
  let userProfileService: jest.Mocked<UserProfileServiceStart>;
  let alertActionEventPublisher: AlertActionEventPublisher;
  let emitEpisodeActionsSpy: jest.SpyInstance;

  beforeEach(() => {
    ({
      alertActionsClient: client,
      queryServiceEsClient,
      storageServiceEsClient,
      userProfileService,
      alertActionEventPublisher,
    } = createAlertActionsClient());
    emitEpisodeActionsSpy = jest.spyOn(alertActionEventPublisher, 'emitEpisodeActions');
    storageServiceEsClient.bulk.mockResolvedValueOnce({ items: [], errors: false, took: 1 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSeriesAction', () => {
    const getDocs = () => {
      const operations = storageServiceEsClient.bulk.mock.calls[0][0].operations ?? [];
      return operations.filter((_, index) => index % 2 === 1);
    };

    it('persists the audit doc with episode_id null and series anchors from the latest event', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getAlertEventESQLResponse());

      await client.createSeriesAction({
        groupHash: 'test-group-hash',
        action: { action_type: ALERT_EPISODE_ACTION_TYPE.TAG, tags: ['critical'] },
      });

      expect(queryServiceEsClient.esql.query).toHaveBeenCalledTimes(1);
      const docs = getDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({
        action_type: ALERT_EPISODE_ACTION_TYPE.TAG,
        tags: ['critical'],
        group_hash: 'test-group-hash',
        episode_id: null,
        rule_id: 'test-rule-id',
        last_series_event_timestamp: '2025-01-01T00:00:00.000Z',
        actor: 'test-uid',
        space_id: 'default',
      });
    });

    it('emits the domain event with episode_id null, like the persisted doc', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([{ episode_id: 'episode-7' }])
      );

      await client.createSeriesAction({
        groupHash: 'test-group-hash',
        action: { action_type: ALERT_EPISODE_ACTION_TYPE.SNOOZE },
      });

      expect(getDocs()[0]).toMatchObject({ episode_id: null });
      expect(emitEpisodeActionsSpy).toHaveBeenCalledWith(expect.anything(), [
        expect.objectContaining({
          action_type: ALERT_EPISODE_ACTION_TYPE.SNOOZE,
          episode_id: null,
        }),
      ]);
    });

    it('throws ALERT_EVENT_NOT_FOUND with the group_hash detail when the series has no event', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getEmptyESQLResponse());

      await expect(
        client.createSeriesAction({
          groupHash: 'unknown-group-hash',
          action: { action_type: ALERT_EPISODE_ACTION_TYPE.UNSNOOZE },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 404 },
        data: { code: 'ALERT_EVENT_NOT_FOUND', details: { group_hash: 'unknown-group-hash' } },
      });

      expect(storageServiceEsClient.bulk).not.toHaveBeenCalled();
      expect(emitEpisodeActionsSpy).not.toHaveBeenCalled();
    });

    it('handles null profile uid when security is not available', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getAlertEventESQLResponse());
      userProfileService.getCurrentProfileId.mockResolvedValueOnce(null);

      await client.createSeriesAction({
        groupHash: 'test-group-hash',
        action: { action_type: ALERT_EPISODE_ACTION_TYPE.SNOOZE },
      });

      expect(getDocs()[0]).toMatchObject({ actor: null });
    });
  });

  describe('createEpisodeAction', () => {
    const getDocs = () => {
      const operations = storageServiceEsClient.bulk.mock.calls[0][0].operations ?? [];
      return operations.filter((_, index) => index % 2 === 1);
    };

    it('persists an ack with the episode id and the group_hash resolved from the episode event', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([{ episode_id: 'episode-3', group_hash: 'resolved-group' }])
      );

      await client.createEpisodeAction({
        episodeId: 'episode-3',
        action: { action_type: ALERT_EPISODE_ACTION_TYPE.ACK },
      });

      // Audit-only actions need no latest-episode guard, so only the
      // by-episode lookup runs.
      expect(queryServiceEsClient.esql.query).toHaveBeenCalledTimes(1);
      const docs = getDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({
        action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
        episode_id: 'episode-3',
        group_hash: 'resolved-group',
        actor: 'test-uid',
      });
      expect(emitEpisodeActionsSpy).toHaveBeenCalledWith(expect.anything(), [
        expect.objectContaining({ episode_id: 'episode-3' }),
      ]);
    });

    it('persists an assign payload', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([{ episode_id: 'episode-3' }])
      );

      await client.createEpisodeAction({
        episodeId: 'episode-3',
        action: { action_type: ALERT_EPISODE_ACTION_TYPE.ASSIGN, assignee_uid: 'assignee-1' },
      });

      expect(getDocs()[0]).toMatchObject({
        action_type: ALERT_EPISODE_ACTION_TYPE.ASSIGN,
        assignee_uid: 'assignee-1',
        episode_id: 'episode-3',
      });
    });

    it('throws ALERT_EPISODE_NOT_FOUND with the episode_id detail when the episode does not exist', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getEmptyESQLResponse());

      await expect(
        client.createEpisodeAction({
          episodeId: 'unknown-episode',
          action: { action_type: ALERT_EPISODE_ACTION_TYPE.ACK },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 404 },
        data: { code: 'ALERT_EPISODE_NOT_FOUND', details: { episode_id: 'unknown-episode' } },
      });

      expect(storageServiceEsClient.bulk).not.toHaveBeenCalled();
    });

    it('acks a superseded episode without a latest-episode guard', async () => {
      // The episode exists but a newer episode of the same group has since
      // started; ack is a pure audit record, so it still succeeds.
      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([{ episode_id: 'old-episode', group_hash: 'group-1' }])
      );

      await client.createEpisodeAction({
        episodeId: 'old-episode',
        action: { action_type: ALERT_EPISODE_ACTION_TYPE.ACK },
      });

      expect(queryServiceEsClient.esql.query).toHaveBeenCalledTimes(1);
      expect(getDocs()[0]).toMatchObject({ episode_id: 'old-episode' });
    });

    it('deactivates the latest episode of its series, writing the synthetic rule-event', async () => {
      // By-episode lookup, then the latest-of-group guard lookup.
      queryServiceEsClient.esql.query
        .mockResolvedValueOnce(
          getAlertEventESQLResponse([
            { episode_id: 'episode-3', group_hash: 'group-1', episode_status: 'active' },
          ])
        )
        .mockResolvedValueOnce(
          getAlertEventESQLResponse([{ episode_id: 'episode-3', group_hash: 'group-1' }])
        );

      await client.createEpisodeAction({
        episodeId: 'episode-3',
        action: { action_type: ALERT_EPISODE_ACTION_TYPE.DEACTIVATE, reason: 'resolved' },
      });

      expect(queryServiceEsClient.esql.query).toHaveBeenCalledTimes(2);
      const operations = storageServiceEsClient.bulk.mock.calls[0][0].operations ?? [];
      expect(operations[0]).toEqual({ create: { _index: '.rule-events' } });
      expect(operations[1]).toMatchObject({
        episode: { id: 'episode-3', status: 'inactive' },
        status: 'recovered',
      });
      expect(operations[2]).toEqual({ create: { _index: '.alert-actions' } });
      expect(operations[3]).toMatchObject({
        action_type: ALERT_EPISODE_ACTION_TYPE.DEACTIVATE,
        episode_id: 'episode-3',
        reason: 'resolved',
      });
    });

    it('rejects activate on a superseded episode with ALERT_EPISODE_NOT_LATEST', async () => {
      queryServiceEsClient.esql.query
        .mockResolvedValueOnce(
          getAlertEventESQLResponse([
            { episode_id: 'old-episode', group_hash: 'group-1', episode_status: 'inactive' },
          ])
        )
        .mockResolvedValueOnce(
          getAlertEventESQLResponse([{ episode_id: 'new-episode', group_hash: 'group-1' }])
        );

      await expect(
        client.createEpisodeAction({
          episodeId: 'old-episode',
          action: { action_type: ALERT_EPISODE_ACTION_TYPE.ACTIVATE, reason: 'reopen' },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 404 },
        data: {
          code: 'ALERT_EPISODE_NOT_LATEST',
          details: { episode_id: 'old-episode', group_hash: 'group-1' },
        },
      });

      expect(storageServiceEsClient.bulk).not.toHaveBeenCalled();
      expect(emitEpisodeActionsSpy).not.toHaveBeenCalled();
    });

    it('uses wait_for refresh so the deactivation is immediately visible', async () => {
      queryServiceEsClient.esql.query
        .mockResolvedValueOnce(
          getAlertEventESQLResponse([
            { episode_id: 'episode-3', group_hash: 'group-1', episode_status: 'active' },
          ])
        )
        .mockResolvedValueOnce(
          getAlertEventESQLResponse([{ episode_id: 'episode-3', group_hash: 'group-1' }])
        );

      await client.createEpisodeAction({
        episodeId: 'episode-3',
        action: { action_type: ALERT_EPISODE_ACTION_TYPE.DEACTIVATE, reason: 'resolved' },
      });

      expect(storageServiceEsClient.bulk.mock.calls[0][0].refresh).toBe('wait_for');
    });

    it('does not emit the action event when the bulk write rejects', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([{ episode_id: 'episode-3' }])
      );
      storageServiceEsClient.bulk.mockReset();
      storageServiceEsClient.bulk.mockRejectedValueOnce(new Error('bulk write failed'));

      await expect(
        client.createEpisodeAction({
          episodeId: 'episode-3',
          action: { action_type: ALERT_EPISODE_ACTION_TYPE.ACK },
        })
      ).rejects.toThrow('bulk write failed');

      expect(emitEpisodeActionsSpy).not.toHaveBeenCalled();
    });

    it('persists source and a null rule_id from the resolved alert event for external episodes', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([{ episode_id: 'episode-3', source: 'pagerduty', rule_id: null }])
      );

      await client.createEpisodeAction({
        episodeId: 'episode-3',
        action: { action_type: ALERT_EPISODE_ACTION_TYPE.ACK },
      });

      expect(getDocs()[0]).toMatchObject({ source: 'pagerduty', rule_id: null });
    });
  });

  describe('createBulkSeriesActions', () => {
    const getDocs = () => {
      const operations = storageServiceEsClient.bulk.mock.calls[0][0].operations ?? [];
      return operations.filter((_, index) => index % 2 === 1);
    };

    it('persists every action and emits every event with episode_id null', async () => {
      const items: BulkCreateSeriesAlertActionItemBody[] = [
        { group_hash: 'group-1', action_type: ALERT_EPISODE_ACTION_TYPE.TAG, tags: ['t1'] },
        { group_hash: 'group-2', action_type: ALERT_EPISODE_ACTION_TYPE.SNOOZE },
      ];

      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([
          { group_hash: 'group-1', episode_id: 'episode-1' },
          { group_hash: 'group-2', episode_id: 'episode-2' },
        ])
      );

      const result = await client.createBulkSeriesActions(items);

      expect(result).toEqual({ affected_count: 2, errors: [] });
      expect(queryServiceEsClient.esql.query).toHaveBeenCalledTimes(1);
      const docs = getDocs();
      expect(docs).toHaveLength(2);
      expect(docs[0]).toMatchObject({ group_hash: 'group-1', episode_id: null, tags: ['t1'] });
      expect(docs[1]).toMatchObject({ group_hash: 'group-2', episode_id: null });
      expect(emitEpisodeActionsSpy.mock.calls[0][1]).toEqual([
        expect.objectContaining({ group_hash: 'group-1', episode_id: null }),
        expect.objectContaining({ group_hash: 'group-2', episode_id: null }),
      ]);
    });

    it('reports ALERT_GROUP_NOT_FOUND keyed by group_hash for missing series', async () => {
      const items: BulkCreateSeriesAlertActionItemBody[] = [
        { group_hash: 'group-1', action_type: ALERT_EPISODE_ACTION_TYPE.UNSNOOZE },
        { group_hash: 'unknown-group', action_type: ALERT_EPISODE_ACTION_TYPE.UNSNOOZE },
      ];

      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([{ group_hash: 'group-1' }])
      );

      const result = await client.createBulkSeriesActions(items);

      expect(result.affected_count).toBe(1);
      expect(result.errors).toEqual([
        {
          id: 'unknown-group',
          error: expect.objectContaining({ code: 'ALERT_GROUP_NOT_FOUND' }),
        },
      ]);
    });
  });

  describe('createBulkEpisodeActions', () => {
    const getDocs = () => {
      const operations = storageServiceEsClient.bulk.mock.calls[0][0].operations ?? [];
      return operations.filter((_, index) => index % 2 === 1);
    };

    it('persists audit-only actions with a single by-episode lookup', async () => {
      const items: BulkCreateEpisodeAlertActionItemBody[] = [
        { episode_id: 'episode-1', action_type: ALERT_EPISODE_ACTION_TYPE.ACK },
        {
          episode_id: 'episode-2',
          action_type: ALERT_EPISODE_ACTION_TYPE.ASSIGN,
          assignee_uid: 'assignee-1',
        },
      ];

      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([
          { episode_id: 'episode-1', group_hash: 'group-1' },
          { episode_id: 'episode-2', group_hash: 'group-2' },
        ])
      );

      const result = await client.createBulkEpisodeActions(items);

      expect(result).toEqual({ affected_count: 2, errors: [] });
      expect(queryServiceEsClient.esql.query).toHaveBeenCalledTimes(1);
      const docs = getDocs();
      expect(docs[0]).toMatchObject({ episode_id: 'episode-1', group_hash: 'group-1' });
      expect(docs[1]).toMatchObject({
        episode_id: 'episode-2',
        group_hash: 'group-2',
        assignee_uid: 'assignee-1',
      });
    });

    it('reports ALERT_EPISODE_NOT_FOUND keyed by episode_id for missing episodes', async () => {
      const items: BulkCreateEpisodeAlertActionItemBody[] = [
        { episode_id: 'episode-1', action_type: ALERT_EPISODE_ACTION_TYPE.ACK },
        { episode_id: 'unknown-episode', action_type: ALERT_EPISODE_ACTION_TYPE.UNACK },
      ];

      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([{ episode_id: 'episode-1', group_hash: 'group-1' }])
      );

      const result = await client.createBulkEpisodeActions(items);

      expect(result.affected_count).toBe(1);
      expect(result.errors).toEqual([
        {
          id: 'unknown-episode',
          error: expect.objectContaining({ code: 'ALERT_EPISODE_NOT_FOUND' }),
        },
      ]);
    });

    it('rejects lifecycle items on superseded episodes while the rest of the batch proceeds', async () => {
      const items: BulkCreateEpisodeAlertActionItemBody[] = [
        {
          episode_id: 'old-episode',
          action_type: ALERT_EPISODE_ACTION_TYPE.DEACTIVATE,
          reason: 'stale',
        },
        { episode_id: 'old-episode', action_type: ALERT_EPISODE_ACTION_TYPE.ACK },
      ];

      // By-episode lookup resolves the superseded episode; the guard lookup
      // shows the group has moved on to a newer episode.
      queryServiceEsClient.esql.query
        .mockResolvedValueOnce(
          getAlertEventESQLResponse([
            { episode_id: 'old-episode', group_hash: 'group-1', episode_status: 'active' },
          ])
        )
        .mockResolvedValueOnce(
          getAlertEventESQLResponse([{ episode_id: 'new-episode', group_hash: 'group-1' }])
        );

      const result = await client.createBulkEpisodeActions(items);

      expect(queryServiceEsClient.esql.query).toHaveBeenCalledTimes(2);
      expect(result.affected_count).toBe(1);
      expect(result.errors).toEqual([
        {
          id: 'old-episode',
          error: expect.objectContaining({
            code: 'ALERT_EPISODE_NOT_LATEST',
            details: { group_hash: 'group-1' },
          }),
        },
      ]);
      // The audit-only ack on the same superseded episode still persists.
      expect(getDocs()[0]).toMatchObject({
        action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
        episode_id: 'old-episode',
      });
    });

    it('writes the synthetic rule-event for a lifecycle item on the latest episode', async () => {
      const items: BulkCreateEpisodeAlertActionItemBody[] = [
        {
          episode_id: 'episode-1',
          action_type: ALERT_EPISODE_ACTION_TYPE.ACTIVATE,
          reason: 'reopen',
        },
      ];

      queryServiceEsClient.esql.query
        .mockResolvedValueOnce(
          getAlertEventESQLResponse([
            { episode_id: 'episode-1', group_hash: 'group-1', episode_status: 'inactive' },
          ])
        )
        .mockResolvedValueOnce(
          getAlertEventESQLResponse([{ episode_id: 'episode-1', group_hash: 'group-1' }])
        );

      const result = await client.createBulkEpisodeActions(items);

      expect(result).toEqual({ affected_count: 1, errors: [] });
      const operations = storageServiceEsClient.bulk.mock.calls[0][0].operations ?? [];
      expect(operations[0]).toEqual({ create: { _index: '.rule-events' } });
      expect(operations[1]).toMatchObject({
        episode: { id: 'episode-1', status: 'active' },
        status: 'breached',
      });
      expect(operations[3]).toMatchObject({
        action_type: ALERT_EPISODE_ACTION_TYPE.ACTIVATE,
        episode_id: 'episode-1',
      });
    });

    it('reports INVALID_EPISODE_STATE_TRANSITION keyed by episode_id when a lifecycle precondition fails', async () => {
      const items: BulkCreateEpisodeAlertActionItemBody[] = [
        {
          episode_id: 'episode-1',
          action_type: ALERT_EPISODE_ACTION_TYPE.DEACTIVATE,
          reason: 'already inactive',
        },
      ];

      queryServiceEsClient.esql.query
        .mockResolvedValueOnce(
          getAlertEventESQLResponse([
            { episode_id: 'episode-1', group_hash: 'group-1', episode_status: 'inactive' },
          ])
        )
        .mockResolvedValueOnce(
          getAlertEventESQLResponse([{ episode_id: 'episode-1', group_hash: 'group-1' }])
        );

      const result = await client.createBulkEpisodeActions(items);

      expect(result.affected_count).toBe(0);
      expect(result.errors).toEqual([
        {
          id: 'episode-1',
          error: expect.objectContaining({ code: 'INVALID_EPISODE_STATE_TRANSITION' }),
        },
      ]);
      expect(storageServiceEsClient.bulk).not.toHaveBeenCalled();
    });

    it('rethrows unexpected (non-Boom-4xx) errors so the whole batch fails loudly', async () => {
      const items: BulkCreateEpisodeAlertActionItemBody[] = [
        { episode_id: 'episode-1', action_type: ALERT_EPISODE_ACTION_TYPE.ACK },
      ];

      // The by-episode bulk load is the first ES|QL read. A raw (non-Boom)
      // rejection here must bypass silent-skip and tear down the whole batch.
      queryServiceEsClient.esql.query.mockRejectedValueOnce(new Error('ES outage'));

      await expect(client.createBulkEpisodeActions(items)).rejects.toThrow('ES outage');
      expect(storageServiceEsClient.bulk).not.toHaveBeenCalled();
      expect(emitEpisodeActionsSpy).not.toHaveBeenCalled();
    });

    it('calls emitEpisodeActions with the persisted assign and ack action documents', async () => {
      const items: BulkCreateEpisodeAlertActionItemBody[] = [
        {
          episode_id: 'episode-1',
          action_type: ALERT_EPISODE_ACTION_TYPE.ASSIGN,
          assignee_uid: 'assignee-uid-1',
        },
        { episode_id: 'episode-2', action_type: ALERT_EPISODE_ACTION_TYPE.ACK },
      ];

      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([
          { episode_id: 'episode-1', group_hash: 'group-1' },
          { episode_id: 'episode-2', group_hash: 'group-2' },
        ])
      );

      await client.createBulkEpisodeActions(items);

      expect(emitEpisodeActionsSpy).toHaveBeenCalledTimes(1);
      expect(emitEpisodeActionsSpy.mock.calls[0][1]).toHaveLength(2);
      expect(emitEpisodeActionsSpy.mock.calls[0][1][0]).toMatchObject({
        action_type: ALERT_EPISODE_ACTION_TYPE.ASSIGN,
        assignee_uid: 'assignee-uid-1',
      });
      expect(emitEpisodeActionsSpy.mock.calls[0][1][1]).toMatchObject({
        action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
      });
    });
  });
});
