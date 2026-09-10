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
  BulkCreateAlertActionItemBody,
  BulkCreateEpisodeAlertActionItemBody,
  BulkCreateSeriesAlertActionItemBody,
} from '@kbn/alerting-v2-schemas';
import { ALERT_EPISODE_ACTION_TYPE, type CreateAlertActionBody } from '@kbn/alerting-v2-schemas';
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

  describe('createAction', () => {
    const actionData: CreateAlertActionBody = {
      action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
      episode_id: 'episode-1',
    };

    it('should successfully create an action', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getAlertEventESQLResponse());

      await client.createAction({
        groupHash: 'test-group-hash',
        action: actionData,
      });

      expect(storageServiceEsClient.bulk).toHaveBeenCalledTimes(1);
      const callArgs = storageServiceEsClient.bulk.mock.calls[0][0];
      const operations = callArgs.operations ?? [];
      const docs = operations.filter((_, index) => index % 2 === 1);
      expect(operations).toHaveLength(2);
      expect(operations[0]).toEqual({ create: { _index: '.alert-actions' } });
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({
        group_hash: 'test-group-hash',
        action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
        episode_id: 'episode-1',
        rule_id: 'test-rule-id',
        last_series_event_timestamp: '2025-01-01T00:00:00.000Z',
        actor: 'test-uid',
        space_id: 'default',
      });
      expect(docs[0]).toHaveProperty('@timestamp');
    });

    it('should handle action with episode_id', async () => {
      const actionWithEpisode: CreateAlertActionBody = {
        action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
        episode_id: 'episode-2',
      };

      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([{ episode_id: 'episode-2' }])
      );

      await client.createAction({
        groupHash: 'test-group-hash',
        action: actionWithEpisode,
      });

      expect(storageServiceEsClient.bulk).toHaveBeenCalledTimes(1);
      const callArgs = storageServiceEsClient.bulk.mock.calls[0][0];
      const operations = callArgs.operations ?? [];
      const docs = operations.filter((_, index) => index % 2 === 1);
      expect(docs[0]).toMatchObject({ episode_id: 'episode-2' });
    });

    it('should handle action with tags', async () => {
      const tagAction: CreateAlertActionBody = {
        action_type: ALERT_EPISODE_ACTION_TYPE.TAG,
        tags: ['critical', 'network'],
      };

      queryServiceEsClient.esql.query.mockResolvedValueOnce(getAlertEventESQLResponse());

      await client.createAction({
        groupHash: 'test-group-hash',
        action: tagAction,
      });

      expect(storageServiceEsClient.bulk).toHaveBeenCalledTimes(1);
      const callArgs = storageServiceEsClient.bulk.mock.calls[0][0];
      const operations = callArgs.operations ?? [];
      const docs = operations.filter((_, index) => index % 2 === 1);
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({
        group_hash: 'test-group-hash',
        action_type: ALERT_EPISODE_ACTION_TYPE.TAG,
        tags: ['critical', 'network'],
        rule_id: 'test-rule-id',
        actor: 'test-uid',
      });
    });

    it('should handle null profile uid when security is not available', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getAlertEventESQLResponse());
      userProfileService.getCurrentProfileId.mockResolvedValueOnce(null);

      await client.createAction({
        groupHash: 'test-group-hash',
        action: actionData,
      });

      expect(storageServiceEsClient.bulk).toHaveBeenCalledTimes(1);
      const callArgs = storageServiceEsClient.bulk.mock.calls[0][0];
      const operations = callArgs.operations ?? [];
      const docs = operations.filter((_, index) => index % 2 === 1);
      expect(docs[0]).toMatchObject({ actor: null });
    });

    it('persists source from the resolved alert event', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([{ source: 'pagerduty' }])
      );

      await client.createAction({
        groupHash: 'test-group-hash',
        action: actionData,
      });

      expect(storageServiceEsClient.bulk).toHaveBeenCalledTimes(1);
      const callArgs = storageServiceEsClient.bulk.mock.calls[0][0];
      const operations = callArgs.operations ?? [];
      const docs = operations.filter((_, index) => index % 2 === 1);
      expect(docs[0]).toMatchObject({ source: 'pagerduty' });
    });

    it('accepts a null rule_id and writes it as null for external episodes', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([{ rule_id: null, source: 'pagerduty' }])
      );

      await client.createAction({
        groupHash: 'test-group-hash',
        action: actionData,
      });

      expect(storageServiceEsClient.bulk).toHaveBeenCalledTimes(1);
      const callArgs = storageServiceEsClient.bulk.mock.calls[0][0];
      const operations = callArgs.operations ?? [];
      const docs = operations.filter((_, index) => index % 2 === 1);
      expect(docs[0]).toMatchObject({ rule_id: null, source: 'pagerduty' });
    });
  });

  describe('createAction deactivate', () => {
    const deactivateAction: CreateAlertActionBody = {
      action_type: ALERT_EPISODE_ACTION_TYPE.DEACTIVATE,
      reason: 'no longer relevant',
    };

    /** Pulls the [create-meta, doc, create-meta, doc, ...] tuples from the single bulk call. */
    const getBulkPairs = () => {
      const callArgs = storageServiceEsClient.bulk.mock.calls[0][0];
      const operations = callArgs.operations ?? [];
      const pairs: Array<{ create: unknown; doc: unknown }> = [];
      for (let i = 0; i < operations.length; i += 2) {
        pairs.push({ create: operations[i], doc: operations[i + 1] });
      }
      return pairs;
    };

    beforeEach(() => {
      storageServiceEsClient.bulk.mockReset();
      storageServiceEsClient.bulk.mockResolvedValue({ items: [], errors: false, took: 1 });
    });

    // Handler-internal behaviour (synthetic rule-event shape, severity
    // omission, malformed `data_json`, and the
    // active/recovering/inactive/pending precondition variants) is
    // covered exhaustively by `handlers/deactivate.test.ts`. The tests
    // here cover only what the orchestrator owns: persistence layout,
    // audit-doc construction, event emission, and the surfacing of
    // loader errors.

    it('submits both the synthetic .rule-events doc and the .alert-actions audit doc in a single bulk call', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getAlertEventESQLResponse());

      await client.createAction({ groupHash: 'test-group-hash', action: deactivateAction });

      expect(storageServiceEsClient.bulk).toHaveBeenCalledTimes(1);
      const pairs = getBulkPairs();
      expect(pairs).toHaveLength(2);
      expect(pairs[0].create).toEqual({ create: { _index: '.rule-events' } });
      expect(pairs[1].create).toEqual({ create: { _index: '.alert-actions' } });
    });

    it('builds the .alert-actions audit doc with fields drawn from the latest event', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getAlertEventESQLResponse());

      await client.createAction({ groupHash: 'test-group-hash', action: deactivateAction });

      expect(getBulkPairs()[1].doc).toMatchObject({
        action_type: 'deactivate',
        group_hash: 'test-group-hash',
        episode_id: 'episode-1',
        rule_id: 'test-rule-id',
        last_series_event_timestamp: '2025-01-01T00:00:00.000Z',
        reason: 'no longer relevant',
        space_id: 'default',
        actor: 'test-uid',
      });
    });

    it('uses wait_for refresh so the deactivation is immediately visible', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getAlertEventESQLResponse());

      await client.createAction({ groupHash: 'test-group-hash', action: deactivateAction });

      expect(storageServiceEsClient.bulk.mock.calls[0][0].refresh).toBe('wait_for');
    });

    it('emits the persisted deactivate action document', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getAlertEventESQLResponse());

      await client.createAction({ groupHash: 'test-group-hash', action: deactivateAction });

      expect(emitEpisodeActionsSpy).toHaveBeenCalledTimes(1);
      expect(emitEpisodeActionsSpy).toHaveBeenCalledWith(expect.anything(), [
        expect.objectContaining({ action_type: 'deactivate', group_hash: 'test-group-hash' }),
      ]);
    });

    it('does not emit the action event when the bulk write rejects', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getAlertEventESQLResponse());
      storageServiceEsClient.bulk.mockReset();
      storageServiceEsClient.bulk.mockRejectedValueOnce(new Error('bulk write failed'));

      await expect(
        client.createAction({ groupHash: 'test-group-hash', action: deactivateAction })
      ).rejects.toThrow('bulk write failed');

      expect(emitEpisodeActionsSpy).not.toHaveBeenCalled();
    });

    it('throws ALERT_EVENT_NOT_FOUND and writes nothing when there is no prior rule event', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getEmptyESQLResponse());

      await expect(
        client.createAction({ groupHash: 'unknown-group-hash', action: deactivateAction })
      ).rejects.toMatchObject({
        output: { statusCode: 404 },
        data: { code: 'ALERT_EVENT_NOT_FOUND', details: { group_hash: 'unknown-group-hash' } },
      });

      expect(storageServiceEsClient.bulk).not.toHaveBeenCalled();
      expect(emitEpisodeActionsSpy).not.toHaveBeenCalled();
    });
  });

  describe('createAction activate', () => {
    const activateAction: CreateAlertActionBody = {
      action_type: ALERT_EPISODE_ACTION_TYPE.ACTIVATE,
      reason: 'reopen this episode',
    };

    /** Pulls the [create-meta, doc, create-meta, doc, ...] tuples from the single bulk call. */
    const getBulkPairs = () => {
      const callArgs = storageServiceEsClient.bulk.mock.calls[0][0];
      const operations = callArgs.operations ?? [];
      const pairs: Array<{ create: unknown; doc: unknown }> = [];
      for (let i = 0; i < operations.length; i += 2) {
        pairs.push({ create: operations[i], doc: operations[i + 1] });
      }
      return pairs;
    };

    /**
     * Activate is a pure, synchronous handler: the only ES|QL read is
     * the client-level `.rule-events` lookup that resolves the latest
     * event for `group_hash`. Everything else the handler needs is on
     * that record — see `handlers/activate.ts`.
     */
    const mockHappyPathReads = () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([{ episode_status: 'inactive' }])
      );
    };

    beforeEach(() => {
      storageServiceEsClient.bulk.mockReset();
      storageServiceEsClient.bulk.mockResolvedValue({ items: [], errors: false, took: 1 });
    });

    // Handler-internal behaviour (synthetic rule-event reconstruction,
    // severity omission, status_count on entry, and the
    // `episode_status !== 'inactive'` precondition variants) is
    // covered exhaustively by `handlers/activate.test.ts`. The tests
    // here cover only what the orchestrator owns: persistence layout,
    // audit-doc construction, event emission, and the client-level
    // `ALERT_EVENT_NOT_FOUND` surface.

    it('submits both the synthetic .rule-events doc and the .alert-actions audit doc in a single bulk call', async () => {
      mockHappyPathReads();

      await client.createAction({ groupHash: 'test-group-hash', action: activateAction });

      expect(storageServiceEsClient.bulk).toHaveBeenCalledTimes(1);
      const pairs = getBulkPairs();
      expect(pairs).toHaveLength(2);
      expect(pairs[0].create).toEqual({ create: { _index: '.rule-events' } });
      expect(pairs[1].create).toEqual({ create: { _index: '.alert-actions' } });
    });

    it('builds the .alert-actions audit doc from the latest event and the activate body', async () => {
      mockHappyPathReads();

      await client.createAction({ groupHash: 'test-group-hash', action: activateAction });

      expect(getBulkPairs()[1].doc).toMatchObject({
        action_type: 'activate',
        group_hash: 'test-group-hash',
        episode_id: 'episode-1',
        rule_id: 'test-rule-id',
        last_series_event_timestamp: '2025-01-01T00:00:00.000Z',
        reason: 'reopen this episode',
        space_id: 'default',
        actor: 'test-uid',
      });
    });

    it('emits the persisted activate action document', async () => {
      mockHappyPathReads();

      await client.createAction({ groupHash: 'test-group-hash', action: activateAction });

      expect(emitEpisodeActionsSpy).toHaveBeenCalledTimes(1);
      expect(emitEpisodeActionsSpy).toHaveBeenCalledWith(expect.anything(), [
        expect.objectContaining({ action_type: 'activate', group_hash: 'test-group-hash' }),
      ]);
    });

    it('throws ALERT_EVENT_NOT_FOUND when there is no prior rule event for the group_hash', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getEmptyESQLResponse());

      await expect(
        client.createAction({ groupHash: 'unknown-group-hash', action: activateAction })
      ).rejects.toMatchObject({
        output: { statusCode: 404 },
        data: { code: 'ALERT_EVENT_NOT_FOUND', details: { group_hash: 'unknown-group-hash' } },
      });

      expect(storageServiceEsClient.bulk).not.toHaveBeenCalled();
      expect(emitEpisodeActionsSpy).not.toHaveBeenCalled();
    });
  });

  describe('createBulkActions', () => {
    it('should process all actions successfully', async () => {
      const actions: BulkCreateAlertActionItemBody[] = [
        {
          group_hash: 'group-hash-1',
          action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
          episode_id: 'episode-1',
        },
        { group_hash: 'group-hash-2', action_type: ALERT_EPISODE_ACTION_TYPE.SNOOZE },
      ];

      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([
          { group_hash: 'group-hash-1', episode_id: 'episode-1' },
          { group_hash: 'group-hash-2', episode_id: 'episode-2' },
        ])
      );

      const result = await client.createBulkActions(actions);

      expect(result).toEqual({ affected_count: 2, errors: [] });
      expect(storageServiceEsClient.bulk).toHaveBeenCalledTimes(1);
      const callArgs = storageServiceEsClient.bulk.mock.calls[0][0];
      const operations = callArgs.operations ?? [];
      const docs = operations.filter((_, index) => index % 2 === 1);
      expect(docs).toHaveLength(2);
    });

    it('reports ALERT_GROUP_NOT_FOUND for an item whose group has no alert event', async () => {
      const actions: BulkCreateAlertActionItemBody[] = [
        {
          group_hash: 'group-hash-1',
          action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
          episode_id: 'episode-1',
        },
        {
          group_hash: 'unknown-group-hash',
          action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
          episode_id: 'episode-1',
        },
      ];

      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([{ group_hash: 'group-hash-1', episode_id: 'episode-1' }])
      );

      const result = await client.createBulkActions(actions);

      expect(result.affected_count).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].id).toBe('unknown-group-hash');
      expect(result.errors[0].error.code).toBe('ALERT_GROUP_NOT_FOUND');
      expect(storageServiceEsClient.bulk).toHaveBeenCalledTimes(1);
      const callArgs = storageServiceEsClient.bulk.mock.calls[0][0];
      const operations = callArgs.operations ?? [];
      const docs = operations.filter((_, index) => index % 2 === 1);
      expect(docs).toHaveLength(1);
    });

    it('reports ALERT_EPISODE_NOT_FOUND for items whose targeted episode_id has been superseded by a newer episode of the same group', async () => {
      const actions: BulkCreateAlertActionItemBody[] = [
        {
          group_hash: 'group-hash-1',
          action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
          episode_id: 'old-episode',
        },
        { group_hash: 'group-hash-2', action_type: ALERT_EPISODE_ACTION_TYPE.SNOOZE },
      ];

      // The engine has moved group-hash-1 to a newer episode
      // ('new-episode') since the caller resolved 'old-episode'. The
      // loader returns the group's *current* latest event, so the
      // pair-step must silently drop the item rather than write against
      // the wrong episode. The unnarrowed snooze against group-hash-2
      // still processes normally.
      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([
          { group_hash: 'group-hash-1', episode_id: 'new-episode' },
          { group_hash: 'group-hash-2', episode_id: 'episode-2' },
        ])
      );

      const result = await client.createBulkActions(actions);

      expect(result.affected_count).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].id).toBe('group-hash-1');
      expect(result.errors[0].error.code).toBe('ALERT_EPISODE_NOT_FOUND');
      expect(storageServiceEsClient.bulk).toHaveBeenCalledTimes(1);
      const callArgs = storageServiceEsClient.bulk.mock.calls[0][0];
      const operations = callArgs.operations ?? [];
      const docs = operations.filter((_, index) => index % 2 === 1);
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({
        action_type: 'snooze',
        group_hash: 'group-hash-2',
      });
    });

    it('returns affected_count 0 with a per-item error for every action when all fail', async () => {
      const actions: BulkCreateAlertActionItemBody[] = [
        {
          group_hash: 'unknown-1',
          action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
          episode_id: 'episode-1',
        },
        {
          group_hash: 'unknown-2',
          action_type: ALERT_EPISODE_ACTION_TYPE.SNOOZE,
        },
      ];

      queryServiceEsClient.esql.query.mockResolvedValueOnce(getAlertEventESQLResponse([]));

      const result = await client.createBulkActions(actions);

      expect(result.affected_count).toBe(0);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].id).toBe('unknown-1');
      expect(result.errors[0].error.code).toBe('ALERT_GROUP_NOT_FOUND');
      expect(result.errors[1].id).toBe('unknown-2');
      expect(result.errors[1].error.code).toBe('ALERT_GROUP_NOT_FOUND');
      expect(storageServiceEsClient.bulk).not.toHaveBeenCalled();
    });

    describe('lifecycle dispatch (deactivate/activate)', () => {
      const getBulkOperations = () => storageServiceEsClient.bulk.mock.calls[0][0].operations ?? [];

      it('writes a synthetic .rule-events doc alongside the audit doc for a bulk deactivate', async () => {
        const actions: BulkCreateAlertActionItemBody[] = [
          {
            group_hash: 'group-hash-1',
            action_type: ALERT_EPISODE_ACTION_TYPE.DEACTIVATE,
            reason: 'bulk deactivate',
          },
        ];

        queryServiceEsClient.esql.query.mockResolvedValueOnce(
          getAlertEventESQLResponse([
            { group_hash: 'group-hash-1', episode_id: 'episode-1', episode_status: 'active' },
          ])
        );

        const result = await client.createBulkActions(actions);

        expect(result).toEqual({ affected_count: 1, errors: [] });
        expect(storageServiceEsClient.bulk).toHaveBeenCalledTimes(1);

        const operations = getBulkOperations();
        expect(operations[0]).toEqual({ create: { _index: '.rule-events' } });
        expect(operations[1]).toMatchObject({
          group_hash: 'group-hash-1',
          status: 'recovered',
          episode: { id: 'episode-1', status: 'inactive' },
          type: 'alert',
          source: 'internal',
        });
        expect(operations[2]).toEqual({ create: { _index: '.alert-actions' } });
        expect(operations[3]).toMatchObject({
          action_type: 'deactivate',
          group_hash: 'group-hash-1',
          episode_id: 'episode-1',
          reason: 'bulk deactivate',
        });
      });

      it('reports INVALID_EPISODE_STATE_TRANSITION for a bulk deactivate item whose precondition fails (already inactive)', async () => {
        const actions: BulkCreateAlertActionItemBody[] = [
          {
            group_hash: 'group-hash-1',
            action_type: ALERT_EPISODE_ACTION_TYPE.DEACTIVATE,
            reason: 'should be skipped',
          },
          {
            group_hash: 'group-hash-2',
            action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
            episode_id: 'episode-2',
          },
        ];

        queryServiceEsClient.esql.query.mockResolvedValueOnce(
          getAlertEventESQLResponse([
            { group_hash: 'group-hash-1', episode_id: 'episode-1', episode_status: 'inactive' },
            { group_hash: 'group-hash-2', episode_id: 'episode-2', episode_status: 'active' },
          ])
        );

        const result = await client.createBulkActions(actions);

        expect(result.affected_count).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].id).toBe('group-hash-1');
        expect(result.errors[0].error.code).toBe('INVALID_EPISODE_STATE_TRANSITION');
        expect(storageServiceEsClient.bulk).toHaveBeenCalledTimes(1);
        const operations = getBulkOperations();
        expect(operations).toHaveLength(2);
        expect(operations[0]).toEqual({ create: { _index: '.alert-actions' } });
        expect(operations[1]).toMatchObject({ action_type: 'ack', group_hash: 'group-hash-2' });
        expect(emitEpisodeActionsSpy.mock.calls[0][1]).toHaveLength(1);
      });

      it('writes a synthetic .rule-events doc alongside the audit doc for a bulk activate', async () => {
        const actions: BulkCreateAlertActionItemBody[] = [
          {
            group_hash: 'group-hash-1',
            action_type: ALERT_EPISODE_ACTION_TYPE.ACTIVATE,
            reason: 'bulk activate',
          },
        ];

        queryServiceEsClient.esql.query.mockResolvedValueOnce(
          getAlertEventESQLResponse([
            {
              group_hash: 'group-hash-1',
              episode_id: 'episode-1',
              episode_status: 'inactive',
            },
          ])
        );

        const result = await client.createBulkActions(actions);

        expect(result).toEqual({ affected_count: 1, errors: [] });
        const operations = getBulkOperations();
        expect(operations[0]).toEqual({ create: { _index: '.rule-events' } });
        expect(operations[1]).toMatchObject({
          group_hash: 'group-hash-1',
          episode: { id: 'episode-1', status: 'active' },
          status: 'breached',
          type: 'alert',
          source: 'internal',
        });
        expect(operations[2]).toEqual({ create: { _index: '.alert-actions' } });
        expect(operations[3]).toMatchObject({
          action_type: 'activate',
          group_hash: 'group-hash-1',
          episode_id: 'episode-1',
          reason: 'bulk activate',
        });
      });

      // NOTE: the silent-skip orchestration channel is covered by the
      // bulk-deactivate test above. The activate-specific precondition
      // (`episode_status !== 'inactive'`) is exercised at the handler
      // level in `handlers/activate.test.ts`.

      it('rethrows unexpected (non-Boom-4xx) errors so the whole batch fails loudly', async () => {
        const actions: BulkCreateAlertActionItemBody[] = [
          {
            group_hash: 'group-hash-1',
            action_type: ALERT_EPISODE_ACTION_TYPE.ACTIVATE,
            reason: 'unexpected error path',
          },
        ];

        // Client-level `.rule-events` bulk load is the only ES|QL
        // read on the activate path. A raw (non-Boom) rejection here
        // must bypass silent-skip and tear down the whole batch.
        queryServiceEsClient.esql.query.mockRejectedValueOnce(new Error('ES outage'));

        await expect(client.createBulkActions(actions)).rejects.toThrow('ES outage');
        expect(storageServiceEsClient.bulk).not.toHaveBeenCalled();
        expect(emitEpisodeActionsSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('episode action domain events', () => {
    it('calls emitEpisodeActions with the persisted assign action document', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getAlertEventESQLResponse());

      await client.createAction({
        groupHash: 'test-group-hash',
        action: {
          action_type: ALERT_EPISODE_ACTION_TYPE.ASSIGN,
          episode_id: 'episode-1',
          assignee_uid: 'assignee-uid-1',
        },
      });

      expect(emitEpisodeActionsSpy).toHaveBeenCalledTimes(1);
      expect(emitEpisodeActionsSpy).toHaveBeenCalledWith(expect.anything(), [
        expect.objectContaining({
          action_type: ALERT_EPISODE_ACTION_TYPE.ASSIGN,
          assignee_uid: 'assignee-uid-1',
          episode_id: 'episode-1',
          group_hash: 'test-group-hash',
          actor: 'test-uid',
        }),
      ]);
    });

    it('does not call emitEpisodeActions when persistence fails', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getEmptyESQLResponse());

      await expect(
        client.createAction({
          groupHash: 'unknown-group-hash',
          action: {
            action_type: ALERT_EPISODE_ACTION_TYPE.ASSIGN,
            episode_id: 'episode-1',
            assignee_uid: 'assignee-uid-1',
          },
        })
      ).rejects.toThrow();

      expect(emitEpisodeActionsSpy).not.toHaveBeenCalled();
    });

    it('calls emitEpisodeActions for bulk assign actions only among persisted docs', async () => {
      const actions: BulkCreateAlertActionItemBody[] = [
        {
          group_hash: 'group-hash-1',
          action_type: ALERT_EPISODE_ACTION_TYPE.ASSIGN,
          episode_id: 'episode-1',
          assignee_uid: 'assignee-uid-1',
        },
        {
          group_hash: 'group-hash-2',
          action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
          episode_id: 'episode-2',
        },
      ];

      queryServiceEsClient.esql.query.mockResolvedValueOnce(
        getAlertEventESQLResponse([
          { group_hash: 'group-hash-1', episode_id: 'episode-1' },
          { group_hash: 'group-hash-2', episode_id: 'episode-2' },
        ])
      );

      await client.createBulkActions(actions);

      expect(emitEpisodeActionsSpy).toHaveBeenCalledTimes(1);
      expect(emitEpisodeActionsSpy.mock.calls[0][1]).toHaveLength(2);
      expect(emitEpisodeActionsSpy.mock.calls[0][1][0]).toMatchObject({
        action_type: ALERT_EPISODE_ACTION_TYPE.ASSIGN,
      });
      expect(emitEpisodeActionsSpy.mock.calls[0][1][1]).toMatchObject({
        action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
      });
    });
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
  });

  describe('error codes and details', () => {
    it('attaches ALERT_EVENT_NOT_FOUND code with group_hash and episode_id details on createAction', async () => {
      queryServiceEsClient.esql.query.mockResolvedValueOnce(getEmptyESQLResponse());

      await expect(
        client.createAction({
          groupHash: 'unknown-group-hash',
          action: {
            action_type: ALERT_EPISODE_ACTION_TYPE.ACK,
            episode_id: 'episode-1',
          },
        })
      ).rejects.toMatchObject({
        output: { statusCode: 404 },
        data: {
          code: 'ALERT_EVENT_NOT_FOUND',
          details: {
            group_hash: 'unknown-group-hash',
            episode_id: 'episode-1',
          },
        },
      });

      expect(storageServiceEsClient.bulk).not.toHaveBeenCalled();
    });
  });
});
