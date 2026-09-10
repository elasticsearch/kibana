/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { DeeplyMockedApi } from '@kbn/core-elasticsearch-client-server-mocks';
import { ALERT_EPISODE_ACTION_TYPE } from '@kbn/alerting-v2-schemas';
import { DirectorService } from './director';
import { createLoggerService } from '../services/logger_service/logger_service.mock';
import { createQueryService } from '../services/query_service/query_service.mock';
import { createTransitionStrategyFactory } from './strategies/strategy_resolver.mock';
import { alertEpisodeStatus } from '../../resources/datastreams/alert_events';
import { createAlertEvent, createEsqlResponse } from '../rule_executor/test_utils';
import { createRuleResponse } from '../test_utils';
import type { LatestAlertEventState } from './queries';
import { createExecutionContext } from '../execution_context';

const testExecutionContext = createExecutionContext(new AbortController().signal);

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mocked-uuid'),
}));

// The existing precondition-matrix tests default `last_lifecycle_action_type`
// to `null` — no user has issued activate/deactivate on the group. Tests that
// exercise the user-lock path override this explicitly.
type LatestAlertEventStateInput = Omit<LatestAlertEventState, 'last_lifecycle_action_type'> &
  Partial<Pick<LatestAlertEventState, 'last_lifecycle_action_type'>>;

function createLatestAlertEventStateResponse(records: Array<LatestAlertEventStateInput>) {
  return createEsqlResponse(
    [
      { name: 'last_status', type: 'keyword' },
      { name: 'last_episode_id', type: 'keyword' },
      { name: 'last_episode_status', type: 'keyword' },
      { name: 'last_episode_status_count', type: 'long' },
      { name: 'last_episode_timestamp', type: 'date' },
      { name: 'last_lifecycle_action_type', type: 'keyword' },
      { name: 'group_hash', type: 'keyword' },
    ],
    records.map((r) => [
      r.last_status,
      r.last_episode_id,
      r.last_episode_status,
      r.last_episode_status_count,
      r.last_episode_timestamp ?? null,
      r.last_lifecycle_action_type ?? null,
      r.group_hash,
    ])
  );
}

describe('DirectorService', () => {
  let directorService: DirectorService;
  let mockEsClient: DeeplyMockedApi<ElasticsearchClient>;

  beforeEach(() => {
    const strategyFactory = createTransitionStrategyFactory();
    const { queryService, mockEsClient: esClient } = createQueryService();
    const { loggerService } = createLoggerService();

    mockEsClient = esClient;
    directorService = new DirectorService(strategyFactory, queryService, loggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const rule = createRuleResponse();

  describe('run', () => {
    it('returns empty array and zero stats when no alert events provided', async () => {
      const result = await directorService.run({
        spaceId: 'default',
        rule,
        executionContext: testExecutionContext,
        alertEvents: [],
      });

      expect(result).toEqual({ alertEvents: [], stats: { newEpisodeIds: [] } });
      expect(mockEsClient.esql.query).not.toHaveBeenCalled();
    });

    it('preserves the incoming alert event type — it never rewrites `type`', async () => {
      // The director's SRP is episode tracking. `type` is stamped at creation
      // time by CreateAlertEventsStep from `rule.kind`, so the director must
      // leave it untouched. This test pins that invariant.
      const alertEvent = createAlertEvent({
        group_hash: 'hash-1',
        status: 'breached',
        type: 'alert',
        episode: undefined,
      });

      mockEsClient.esql.query.mockResolvedValue(createLatestAlertEventStateResponse([]));

      const result = await directorService.run({
        spaceId: 'default',
        rule,
        executionContext: testExecutionContext,
        alertEvents: [alertEvent],
      });

      expect(result.alertEvents[0].type).toBe('alert');
    });

    it('sets alerts to pending if there is no previous alert event state', async () => {
      const alertEvent = createAlertEvent({
        group_hash: 'hash-1',
        status: 'breached',
        episode: undefined,
      });

      mockEsClient.esql.query.mockResolvedValue(createLatestAlertEventStateResponse([]));

      const result = await directorService.run({
        spaceId: 'default',
        rule,
        executionContext: testExecutionContext,
        alertEvents: [alertEvent],
      });

      expect(result.alertEvents).toHaveLength(1);
      expect(result.alertEvents[0].episode).toEqual({
        id: 'mocked-uuid',
        status: alertEpisodeStatus.pending,
      });
      expect(result.stats.newEpisodeIds).toHaveLength(1);
    });

    it('sets alerts to pending if the previous alert event state has no episode status', async () => {
      const alertEvent = createAlertEvent({
        group_hash: 'hash-1',
        status: 'breached',
        episode: undefined,
      });

      mockEsClient.esql.query.mockResolvedValue(
        createLatestAlertEventStateResponse([
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'breached',
            last_episode_id: 'episode-1',
            last_episode_status: null,
            last_episode_status_count: null,
            group_hash: 'hash-1',
          },
        ])
      );

      const result = await directorService.run({
        spaceId: 'default',
        rule,
        executionContext: testExecutionContext,
        alertEvents: [alertEvent],
      });

      expect(result.alertEvents).toHaveLength(1);
      expect(result.alertEvents[0].episode).toEqual({
        id: 'mocked-uuid',
        status: alertEpisodeStatus.pending,
      });
      expect(result.stats.newEpisodeIds).toHaveLength(1);
    });

    it('transitions from inactive to pending', async () => {
      const alertEvent = createAlertEvent({
        group_hash: 'hash-1',
        status: 'breached',
        episode: undefined,
      });

      mockEsClient.esql.query.mockResolvedValue(
        createLatestAlertEventStateResponse([
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'breached',
            last_episode_id: 'existing-episode-1',
            last_episode_status: 'inactive',
            last_episode_status_count: null,
            group_hash: 'hash-1',
          },
        ])
      );

      const result = await directorService.run({
        spaceId: 'default',
        rule,
        executionContext: testExecutionContext,
        alertEvents: [alertEvent],
      });

      expect(result.alertEvents[0].episode).toEqual({
        id: 'mocked-uuid',
        status: alertEpisodeStatus.pending,
      });
      expect(result.stats.newEpisodeIds).toHaveLength(1);
    });

    it('transitions from pending to active', async () => {
      const alertEvent = createAlertEvent({
        group_hash: 'hash-1',
        status: 'breached',
        episode: undefined,
      });

      mockEsClient.esql.query.mockResolvedValue(
        createLatestAlertEventStateResponse([
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'breached',
            last_episode_id: 'existing-episode',
            last_episode_status: 'pending',
            last_episode_status_count: null,
            group_hash: 'hash-1',
          },
        ])
      );

      const result = await directorService.run({
        spaceId: 'default',
        rule,
        executionContext: testExecutionContext,
        alertEvents: [alertEvent],
      });

      expect(result.alertEvents[0].episode).toEqual({
        id: 'existing-episode',
        status: alertEpisodeStatus.active,
      });
      expect(result.stats.newEpisodeIds).toHaveLength(0);
    });

    it('transitions from active to recovering ', async () => {
      const alertEvent = createAlertEvent({
        group_hash: 'hash-1',
        status: 'recovered',
        episode: undefined,
      });

      mockEsClient.esql.query.mockResolvedValue(
        createLatestAlertEventStateResponse([
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'breached',
            last_episode_id: 'existing-episode',
            last_episode_status: 'active',
            last_episode_status_count: null,
            group_hash: 'hash-1',
          },
        ])
      );

      const result = await directorService.run({
        spaceId: 'default',
        rule,
        executionContext: testExecutionContext,
        alertEvents: [alertEvent],
      });

      expect(result.alertEvents[0].episode).toEqual({
        id: 'existing-episode',
        status: alertEpisodeStatus.recovering,
      });
      expect(result.stats.newEpisodeIds).toHaveLength(0);
    });

    it('transitions from recovering to inactive', async () => {
      const alertEvent = createAlertEvent({
        group_hash: 'hash-1',
        status: 'recovered',
        episode: undefined,
      });

      mockEsClient.esql.query.mockResolvedValue(
        createLatestAlertEventStateResponse([
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'recovered',
            last_episode_id: 'existing-episode',
            last_episode_status: 'recovering',
            last_episode_status_count: null,
            group_hash: 'hash-1',
          },
        ])
      );

      const result = await directorService.run({
        spaceId: 'default',
        rule,
        executionContext: testExecutionContext,
        alertEvents: [alertEvent],
      });

      expect(result.alertEvents[0].episode).toEqual({
        id: 'existing-episode',
        status: alertEpisodeStatus.inactive,
      });
      expect(result.stats.newEpisodeIds).toHaveLength(0);
    });

    it("sets the episode status to active on a no_data event when no_data_strategy is 'emit'", async () => {
      const ruleWithEmit = createRuleResponse({ no_data_strategy: 'emit' });
      const alertEvent = createAlertEvent({
        group_hash: 'hash-1',
        status: 'no_data',
        episode: undefined,
      });

      mockEsClient.esql.query.mockResolvedValue(
        createLatestAlertEventStateResponse([
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'breached',
            last_episode_id: 'existing-episode',
            last_episode_status: alertEpisodeStatus.active,
            last_episode_status_count: null,
            group_hash: 'hash-1',
          },
        ])
      );

      const result = await directorService.run({
        spaceId: 'default',
        rule: ruleWithEmit,
        executionContext: testExecutionContext,
        alertEvents: [alertEvent],
      });

      expect(result.alertEvents[0].episode).toEqual({
        id: 'existing-episode',
        status: alertEpisodeStatus.active,
      });
    });

    it("preserves the prior episode status on a no_data event when no_data_strategy is 'last_known_status'", async () => {
      const ruleWithLastKnown = createRuleResponse({ no_data_strategy: 'last_known_status' });
      const alertEvent = createAlertEvent({
        group_hash: 'hash-1',
        status: 'no_data',
        episode: undefined,
      });

      mockEsClient.esql.query.mockResolvedValue(
        createLatestAlertEventStateResponse([
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'breached',
            last_episode_id: 'existing-episode',
            last_episode_status: alertEpisodeStatus.recovering,
            last_episode_status_count: null,
            group_hash: 'hash-1',
          },
        ])
      );

      const result = await directorService.run({
        spaceId: 'default',
        rule: ruleWithLastKnown,
        executionContext: testExecutionContext,
        alertEvents: [alertEvent],
      });

      expect(result.alertEvents[0].episode).toEqual({
        id: 'existing-episode',
        status: alertEpisodeStatus.recovering,
      });
    });

    it('processes multiple alert events correctly', async () => {
      const alertEvents = [
        createAlertEvent({ group_hash: 'hash-1', status: 'breached', episode: undefined }),
        createAlertEvent({ group_hash: 'hash-2', status: 'recovered', episode: undefined }),
      ];

      mockEsClient.esql.query.mockResolvedValue(
        createLatestAlertEventStateResponse([
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'breached',
            last_episode_id: 'episode-1',
            last_episode_status: 'active',
            last_episode_status_count: null,
            group_hash: 'hash-1',
          },
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'breached',
            last_episode_id: 'episode-2',
            last_episode_status: 'active',
            last_episode_status_count: null,
            group_hash: 'hash-2',
          },
        ])
      );

      const result = await directorService.run({
        spaceId: 'default',
        rule,
        executionContext: testExecutionContext,
        alertEvents,
      });

      expect(result.alertEvents).toHaveLength(2);
      expect(result.alertEvents[0].episode).toEqual({
        id: 'episode-1',
        status: alertEpisodeStatus.active,
      });
      expect(result.alertEvents[1].episode).toEqual({
        id: 'episode-2',
        status: alertEpisodeStatus.recovering,
      });
      expect(result.stats.newEpisodeIds).toHaveLength(0);
    });

    it('generates new episode ID when transitioning from inactive', async () => {
      const alertEvent = createAlertEvent({
        group_hash: 'hash-1',
        status: 'breached',
        episode: undefined,
      });

      mockEsClient.esql.query.mockResolvedValue(
        createLatestAlertEventStateResponse([
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'recovered',
            last_episode_id: 'old-episode',
            last_episode_status: 'inactive',
            last_episode_status_count: null,
            group_hash: 'hash-1',
          },
        ])
      );

      const result = await directorService.run({
        spaceId: 'default',
        rule,
        executionContext: testExecutionContext,
        alertEvents: [alertEvent],
      });

      expect(result.alertEvents[0].episode?.id).toBe('mocked-uuid');
      expect(result.stats.newEpisodeIds).toHaveLength(1);
    });

    it('preserves episode ID when not transitioning from inactive', async () => {
      const alertEvent = createAlertEvent({
        group_hash: 'hash-1',
        status: 'breached',
        episode: undefined,
      });

      mockEsClient.esql.query.mockResolvedValue(
        createLatestAlertEventStateResponse([
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'breached',
            last_episode_id: 'existing-episode',
            last_episode_status: alertEpisodeStatus.active,
            last_episode_status_count: null,
            group_hash: 'hash-1',
          },
        ])
      );

      const result = await directorService.run({
        spaceId: 'default',
        rule,
        executionContext: testExecutionContext,
        alertEvents: [alertEvent],
      });

      expect(result.alertEvents[0].episode?.id).toBe('existing-episode');
      expect(result.stats.newEpisodeIds).toHaveLength(0);
    });

    it('throws when execution context is already aborted before processing', async () => {
      const abortController = new AbortController();
      abortController.abort();
      const abortedContext = createExecutionContext(abortController.signal);

      const alertEvent = createAlertEvent();

      await expect(
        directorService.run({
          spaceId: 'default',
          rule,
          executionContext: abortedContext,
          alertEvents: [alertEvent],
        })
      ).rejects.toThrow(/aborted/i);

      expect(mockEsClient.esql.query).not.toHaveBeenCalled();
    });

    it('propagates query service errors', async () => {
      const alertEvent = createAlertEvent();
      mockEsClient.esql.query.mockRejectedValue(new Error('Query failed'));

      await expect(
        directorService.run({
          spaceId: 'default',
          rule,
          executionContext: testExecutionContext,
          alertEvents: [alertEvent],
        })
      ).rejects.toThrow('Query failed');
    });

    it('includes status_count in episode when strategy returns one', async () => {
      const ruleWithTransition = createRuleResponse({
        state_transition: { pending_count: 3 },
      });

      const alertEvent = createAlertEvent({
        group_hash: 'hash-1',
        status: 'breached',
        episode: undefined,
      });

      mockEsClient.esql.query.mockResolvedValue(
        createLatestAlertEventStateResponse([
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'breached',
            last_episode_id: 'episode-1',
            last_episode_status: 'pending',
            last_episode_status_count: 1,
            group_hash: 'hash-1',
          },
        ])
      );

      const result = await directorService.run({
        spaceId: 'default',
        rule: ruleWithTransition,
        executionContext: testExecutionContext,
        alertEvents: [alertEvent],
      });

      expect(result.alertEvents[0].episode).toEqual({
        id: 'episode-1',
        status: alertEpisodeStatus.pending,
        status_count: 2,
      });
    });

    it('transitions to active when count threshold is met', async () => {
      const ruleWithTransition = createRuleResponse({
        state_transition: { pending_count: 3 },
      });

      const alertEvent = createAlertEvent({
        group_hash: 'hash-1',
        status: 'breached',
        episode: undefined,
      });

      mockEsClient.esql.query.mockResolvedValue(
        createLatestAlertEventStateResponse([
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'breached',
            last_episode_id: 'episode-1',
            last_episode_status: 'pending',
            last_episode_status_count: 2,
            group_hash: 'hash-1',
          },
        ])
      );

      const result = await directorService.run({
        spaceId: 'default',
        rule: ruleWithTransition,
        executionContext: testExecutionContext,
        alertEvents: [alertEvent],
      });

      expect(result.alertEvents[0].episode).toEqual({
        id: 'episode-1',
        status: alertEpisodeStatus.active,
        status_count: 1,
      });
    });

    it('increments status_count while the episode stays active', async () => {
      const ruleWithTransition = createRuleResponse({
        state_transition: { pending_count: 3 },
      });

      const alertEvent = createAlertEvent({
        group_hash: 'hash-1',
        status: 'breached',
        episode: undefined,
      });

      mockEsClient.esql.query.mockResolvedValue(
        createLatestAlertEventStateResponse([
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'breached',
            last_episode_id: 'episode-1',
            last_episode_status: 'active',
            last_episode_status_count: 3,
            group_hash: 'hash-1',
          },
        ])
      );

      const result = await directorService.run({
        spaceId: 'default',
        rule: ruleWithTransition,
        executionContext: testExecutionContext,
        alertEvents: [alertEvent],
      });

      expect(result.alertEvents[0].episode).toEqual({
        id: 'episode-1',
        status: alertEpisodeStatus.active,
        status_count: 4,
      });
    });

    it('aggregates newEpisodeCount only for fresh episodes across a mixed batch', async () => {
      const alertEvents = [
        createAlertEvent({ group_hash: 'hash-new', status: 'breached', episode: undefined }),
        createAlertEvent({ group_hash: 'hash-existing', status: 'breached', episode: undefined }),
        createAlertEvent({ group_hash: 'hash-inactive', status: 'breached', episode: undefined }),
      ];

      mockEsClient.esql.query.mockResolvedValue(
        createLatestAlertEventStateResponse([
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'breached',
            last_episode_id: 'existing-episode',
            last_episode_status: 'active',
            last_episode_status_count: null,
            group_hash: 'hash-existing',
          },
          {
            last_episode_timestamp: '2026-01-01T00:00:00.000Z',
            last_status: 'recovered',
            last_episode_id: 'old-episode',
            last_episode_status: 'inactive',
            last_episode_status_count: null,
            group_hash: 'hash-inactive',
          },
        ])
      );

      const result = await directorService.run({
        spaceId: 'default',
        rule,
        executionContext: testExecutionContext,
        alertEvents,
      });

      expect(result.alertEvents).toHaveLength(3);
      expect(result.stats.newEpisodeIds).toHaveLength(2);
    });

    // A group is "user-locked" when its most recent lifecycle action in
    // `.alert-actions` is `activate`. In that state the director must hold
    // the episode in `active` regardless of what the strategy computes,
    // until the user issues a `deactivate` (which flips
    // `last_lifecycle_action_type` back to `deactivate` and lets the
    // strategy own transitions again). See DirectorService.isUserLocked.
    describe('user lock (last_lifecycle_action_type === activate)', () => {
      it('forces episode.status to active on a recovery event, preserving the raw event status', async () => {
        // The engine emitted a recovery for a user-activated episode.
        // The director must NOT flip the episode to `recovering`. The
        // user has taken ownership.
        const alertEvent = createAlertEvent({
          group_hash: 'hash-1',
          status: 'recovered',
          episode: undefined,
        });

        mockEsClient.esql.query.mockResolvedValue(
          createLatestAlertEventStateResponse([
            {
              last_episode_timestamp: '2026-01-01T00:00:00.000Z',
              last_status: 'breached',
              last_episode_id: 'user-activated-episode',
              last_episode_status: 'active',
              last_episode_status_count: 1,
              last_lifecycle_action_type: ALERT_EPISODE_ACTION_TYPE.ACTIVATE,
              group_hash: 'hash-1',
            },
          ])
        );

        const result = await directorService.run({
          spaceId: 'default',
          rule,
          executionContext: testExecutionContext,
          alertEvents: [alertEvent],
        });

        expect(result.alertEvents).toHaveLength(1);
        expect(result.alertEvents[0].status).toBe('recovered');
        expect(result.alertEvents[0].episode).toEqual({
          id: 'user-activated-episode',
          status: alertEpisodeStatus.active,
          status_count: 2,
        });
      });

      it('forces episode.status to active on a breach event (no double-flip)', async () => {
        // A subsequent breach on a user-activated episode is a no-op at
        // the episode level. We're already active. Same forced-active
        // emit. The raw event status is preserved as-is.
        const alertEvent = createAlertEvent({
          group_hash: 'hash-1',
          status: 'breached',
          episode: undefined,
        });

        mockEsClient.esql.query.mockResolvedValue(
          createLatestAlertEventStateResponse([
            {
              last_episode_timestamp: '2026-01-01T00:00:00.000Z',
              last_status: 'breached',
              last_episode_id: 'user-activated-episode',
              last_episode_status: 'active',
              last_episode_status_count: 1,
              last_lifecycle_action_type: ALERT_EPISODE_ACTION_TYPE.ACTIVATE,
              group_hash: 'hash-1',
            },
          ])
        );

        const result = await directorService.run({
          spaceId: 'default',
          rule,
          executionContext: testExecutionContext,
          alertEvents: [alertEvent],
        });

        expect(result.alertEvents[0].status).toBe('breached');
        expect(result.alertEvents[0].episode).toEqual({
          id: 'user-activated-episode',
          status: alertEpisodeStatus.active,
          status_count: 2,
        });
      });

      it('increments status_count on the forced-active event (same per-span counting as the engine)', async () => {
        // User-lock follows the same per-span rules: entering a status
        // resets to 1, staying increments. A recovering engine signal
        // does not reset the count because the episode is held in active.
        const ruleWithTransition = createRuleResponse({
          state_transition: { pending_count: 3 },
        });

        const alertEvent = createAlertEvent({
          group_hash: 'hash-1',
          status: 'recovered',
          episode: undefined,
        });

        mockEsClient.esql.query.mockResolvedValue(
          createLatestAlertEventStateResponse([
            {
              last_episode_timestamp: '2026-01-01T00:00:00.000Z',
              last_status: 'breached',
              last_episode_id: 'user-activated-episode',
              last_episode_status: 'active',
              last_episode_status_count: 5,
              last_lifecycle_action_type: ALERT_EPISODE_ACTION_TYPE.ACTIVATE,
              group_hash: 'hash-1',
            },
          ])
        );

        const result = await directorService.run({
          spaceId: 'default',
          rule: ruleWithTransition,
          executionContext: testExecutionContext,
          alertEvents: [alertEvent],
        });

        expect(result.alertEvents[0].episode).toEqual({
          id: 'user-activated-episode',
          status: alertEpisodeStatus.active,
          status_count: 6,
        });
      });

      it('does not lock when the last lifecycle action is deactivate — strategy owns transitions', async () => {
        // Deactivate releases the lock: the director falls back to the
        // strategy for subsequent ticks. A rebreach on a
        // just-user-deactivated group should follow the normal
        // inactive → new-episode path (see resolveEpisodeId), NOT the
        // forced-active path.
        const alertEvent = createAlertEvent({
          group_hash: 'hash-1',
          status: 'breached',
          episode: undefined,
        });

        mockEsClient.esql.query.mockResolvedValue(
          createLatestAlertEventStateResponse([
            {
              last_episode_timestamp: '2026-01-01T00:00:00.000Z',
              last_status: 'recovered',
              last_episode_id: 'user-deactivated-episode',
              last_episode_status: 'inactive',
              last_episode_status_count: null,
              last_lifecycle_action_type: ALERT_EPISODE_ACTION_TYPE.DEACTIVATE,
              group_hash: 'hash-1',
            },
          ])
        );

        const result = await directorService.run({
          spaceId: 'default',
          rule,
          executionContext: testExecutionContext,
          alertEvents: [alertEvent],
        });

        expect(result.alertEvents[0].episode).toEqual({
          id: 'mocked-uuid',
          status: alertEpisodeStatus.pending,
        });
      });

      it('does not lock when no lifecycle action has ever been issued (last_lifecycle_action_type is null)', async () => {
        // The default state for any group that has never received an
        // activate/deactivate audit doc. Belt-and-braces coverage for the
        // `null` branch of isUserLocked.
        const alertEvent = createAlertEvent({
          group_hash: 'hash-1',
          status: 'recovered',
          episode: undefined,
        });

        mockEsClient.esql.query.mockResolvedValue(
          createLatestAlertEventStateResponse([
            {
              last_episode_timestamp: '2026-01-01T00:00:00.000Z',
              last_status: 'breached',
              last_episode_id: 'engine-episode',
              last_episode_status: 'active',
              last_episode_status_count: null,
              last_lifecycle_action_type: null,
              group_hash: 'hash-1',
            },
          ])
        );

        const result = await directorService.run({
          spaceId: 'default',
          rule,
          executionContext: testExecutionContext,
          alertEvents: [alertEvent],
        });

        expect(result.alertEvents[0].episode).toEqual({
          id: 'engine-episode',
          status: alertEpisodeStatus.recovering,
        });
      });

      it('falls back to the strategy when last_lifecycle_action_type is activate but the rule-events stream has no episode id (defensive)', async () => {
        // Guards the pruned-rule-events edge: if the audit stream still
        // holds an activate but the rule-events stream has no state to
        // pin the forced emit to, we cannot lock — fall through to the
        // strategy, which will spawn a fresh episode on the next breach.
        const alertEvent = createAlertEvent({
          group_hash: 'hash-1',
          status: 'breached',
          episode: undefined,
        });

        mockEsClient.esql.query.mockResolvedValue(
          createLatestAlertEventStateResponse([
            {
              last_episode_timestamp: null,
              last_status: 'no_data',
              last_episode_id: null,
              last_episode_status: null,
              last_episode_status_count: null,
              last_lifecycle_action_type: ALERT_EPISODE_ACTION_TYPE.ACTIVATE,
              group_hash: 'hash-1',
            },
          ])
        );

        const result = await directorService.run({
          spaceId: 'default',
          rule,
          executionContext: testExecutionContext,
          alertEvents: [alertEvent],
        });

        expect(result.alertEvents[0].episode).toEqual({
          id: 'mocked-uuid',
          status: alertEpisodeStatus.pending,
        });
      });

      it('locks only the affected group in a mixed-group batch', async () => {
        // The lock is per-group_hash. Groups without an activate stay
        // under strategy control.
        const alertEvents = [
          createAlertEvent({ group_hash: 'locked-group', status: 'recovered', episode: undefined }),
          createAlertEvent({
            group_hash: 'engine-group',
            status: 'recovered',
            episode: undefined,
          }),
        ];

        mockEsClient.esql.query.mockResolvedValue(
          createLatestAlertEventStateResponse([
            {
              last_episode_timestamp: '2026-01-01T00:00:00.000Z',
              last_status: 'breached',
              last_episode_id: 'locked-episode',
              last_episode_status: 'active',
              last_episode_status_count: 1,
              last_lifecycle_action_type: ALERT_EPISODE_ACTION_TYPE.ACTIVATE,
              group_hash: 'locked-group',
            },
            {
              last_episode_timestamp: '2026-01-01T00:00:00.000Z',
              last_status: 'breached',
              last_episode_id: 'engine-episode',
              last_episode_status: 'active',
              last_episode_status_count: null,
              last_lifecycle_action_type: null,
              group_hash: 'engine-group',
            },
          ])
        );

        const result = await directorService.run({
          spaceId: 'default',
          rule,
          executionContext: testExecutionContext,
          alertEvents,
        });

        expect(result.alertEvents[0].episode).toEqual({
          id: 'locked-episode',
          status: alertEpisodeStatus.active,
          status_count: 2,
        });
        expect(result.alertEvents[1].episode).toEqual({
          id: 'engine-episode',
          status: alertEpisodeStatus.recovering,
        });
      });
    });
  });
});
