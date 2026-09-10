/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CountTimeframeStrategy } from './count_timeframe_strategy';
import type {
  AlertEpisodeStatus,
  AlertEventStatus,
} from '../../../resources/datastreams/alert_events';
import { alertEpisodeStatus, alertEventStatus } from '../../../resources/datastreams/alert_events';
import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import { createRuleResponse } from '../../test_utils';
import { createLoggerService } from '../../services/logger_service/logger_service.mock';
import { buildLatestAlertEvent, buildStrategyStateTransitionContext } from '../test_utils';

describe('CountTimeframeStrategy', () => {
  let strategy: CountTimeframeStrategy;

  beforeEach(() => {
    const { loggerService } = createLoggerService();
    strategy = new CountTimeframeStrategy(loggerService);
  });

  const getNextState = (...args: Parameters<typeof buildStrategyStateTransitionContext>) =>
    strategy.getNextState(buildStrategyStateTransitionContext(...args));

  const expectTransition = ({
    from,
    on,
    to,
    stateTransition,
    noDataStrategy,
    statusCount,
    expectedStatusCount,
    eventTimestamp,
    previousTimestamp,
  }: {
    from?: AlertEpisodeStatus;
    on: AlertEventStatus;
    to: AlertEpisodeStatus;
    stateTransition?: RuleResponse['state_transition'];
    noDataStrategy?: RuleResponse['no_data_strategy'];
    statusCount?: number | null;
    expectedStatusCount?: number;
    eventTimestamp?: string;
    previousTimestamp?: string;
  }) => {
    const result = getNextState({
      eventStatus: on,
      stateTransition,
      noDataStrategy,
      eventTimestamp,
      ...(from != null
        ? {
            previousEpisode: buildLatestAlertEvent({
              episodeStatus: from,
              eventStatus: on,
              statusCount,
              previousTimestamp,
            }),
          }
        : {}),
    });

    expect(result).toEqual({
      status: to,
      ...(expectedStatusCount != null ? { statusCount: expectedStatusCount } : {}),
    });
  };

  it('has name "count_timeframe"', () => {
    expect(strategy.name).toBe('count_timeframe');
  });

  describe('canHandle', () => {
    it('returns true when rule has stateTransition', () => {
      expect(
        strategy.canHandle(createRuleResponse({ state_transition: { pending_count: 3 } }))
      ).toBe(true);
    });

    it('returns false when stateTransition is an empty object', () => {
      expect(strategy.canHandle(createRuleResponse({ state_transition: {} }))).toBe(false);
    });

    it('returns false when stateTransition is undefined', () => {
      expect(strategy.canHandle(createRuleResponse({ state_transition: undefined }))).toBe(false);
    });

    it('returns false when stateTransition is null', () => {
      expect(strategy.canHandle(createRuleResponse({ state_transition: null }))).toBe(false);
    });
  });

  describe('without stateTransition config (falls back to basic)', () => {
    it.each<[string, AlertEpisodeStatus, AlertEventStatus, AlertEpisodeStatus]>([
      [
        'pending',
        alertEpisodeStatus.inactive,
        alertEventStatus.breached,
        alertEpisodeStatus.pending,
      ],
      ['active', alertEpisodeStatus.pending, alertEventStatus.breached, alertEpisodeStatus.active],
      [
        'recovering',
        alertEpisodeStatus.active,
        alertEventStatus.recovered,
        alertEpisodeStatus.recovering,
      ],
      [
        'inactive',
        alertEpisodeStatus.recovering,
        alertEventStatus.recovered,
        alertEpisodeStatus.inactive,
      ],
    ])('transitions to %s', (_label, from, on, to) => {
      expectTransition({ from, on, to });
    });
  });

  describe('pendingCount of 0 (skip pending)', () => {
    const stateTransition: RuleResponse['state_transition'] = { pending_count: 0 };

    it('transitions directly to active from inactive on breach', () => {
      expectTransition({
        from: alertEpisodeStatus.inactive,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.active,
        stateTransition,
        expectedStatusCount: 1,
      });
    });

    it('transitions directly to active when no previous episode', () => {
      expectTransition({
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.active,
        stateTransition,
        expectedStatusCount: 1,
      });
    });
  });

  describe('pendingCount threshold', () => {
    const stateTransition: RuleResponse['state_transition'] = { pending_count: 3 };

    it('enters pending with statusCount 1 from inactive', () => {
      expectTransition({
        from: alertEpisodeStatus.inactive,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.pending,
        stateTransition,
        expectedStatusCount: 1,
      });
    });

    it('enters pending with statusCount 1 when no previous episode', () => {
      expectTransition({
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.pending,
        stateTransition,
        expectedStatusCount: 1,
      });
    });

    it('stays in pending when count threshold not met', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.pending,
        stateTransition,
        statusCount: 1,
        expectedStatusCount: 2,
      });
    });

    it('transitions to active when count threshold is met', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.active,
        stateTransition,
        statusCount: 2,
        expectedStatusCount: 1,
      });
    });

    it('transitions to active when count exceeds threshold', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.active,
        stateTransition,
        statusCount: 5,
        expectedStatusCount: 1,
      });
    });

    it('still transitions pending to inactive on recovered event', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.recovered,
        to: alertEpisodeStatus.inactive,
        stateTransition,
        statusCount: 3,
      });
    });
  });

  describe('pendingTimeframe threshold', () => {
    it('transitions to active when timeframe is met', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.active,
        stateTransition: { pending_timeframe: '2m' },
        statusCount: 1,
        expectedStatusCount: 1,
        eventTimestamp: '2025-01-01T00:02:00.000Z',
        previousTimestamp: '2025-01-01T00:00:00.000Z',
      });
    });

    it('stays pending when timeframe is not met', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.pending,
        stateTransition: { pending_timeframe: '5m' },
        statusCount: 2,
        expectedStatusCount: 3,
        eventTimestamp: '2025-01-01T00:03:00.000Z',
        previousTimestamp: '2025-01-01T00:00:00.000Z',
      });
    });

    it('uses OR to combine count and timeframe', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.active,
        stateTransition: {
          pending_count: 5,
          pending_timeframe: '2m',
          pending_operator: 'OR',
        },
        statusCount: 1,
        expectedStatusCount: 1,
        eventTimestamp: '2025-01-01T00:02:00.000Z',
        previousTimestamp: '2025-01-01T00:00:00.000Z',
      });
    });

    it('uses AND to combine count and timeframe', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.pending,
        stateTransition: {
          pending_count: 5,
          pending_timeframe: '2m',
          pending_operator: 'AND',
        },
        statusCount: 1,
        expectedStatusCount: 2,
        eventTimestamp: '2025-01-01T00:02:00.000Z',
        previousTimestamp: '2025-01-01T00:00:00.000Z',
      });
    });
  });

  describe('recoveringCount of 0 (skip recovering)', () => {
    const stateTransition: RuleResponse['state_transition'] = { recovering_count: 0 };

    it('transitions directly to inactive from active on recovered', () => {
      expectTransition({
        from: alertEpisodeStatus.active,
        on: alertEventStatus.recovered,
        to: alertEpisodeStatus.inactive,
        stateTransition,
      });
    });
  });

  describe('recoveringCount threshold', () => {
    const stateTransition: RuleResponse['state_transition'] = { recovering_count: 3 };

    it('enters recovering with statusCount 1 from active', () => {
      expectTransition({
        from: alertEpisodeStatus.active,
        on: alertEventStatus.recovered,
        to: alertEpisodeStatus.recovering,
        stateTransition,
        expectedStatusCount: 1,
      });
    });

    it('stays recovering when count threshold not met', () => {
      expectTransition({
        from: alertEpisodeStatus.recovering,
        on: alertEventStatus.recovered,
        to: alertEpisodeStatus.recovering,
        stateTransition,
        statusCount: 1,
        expectedStatusCount: 2,
      });
    });

    it('transitions to inactive when count threshold is met', () => {
      expectTransition({
        from: alertEpisodeStatus.recovering,
        on: alertEventStatus.recovered,
        to: alertEpisodeStatus.inactive,
        stateTransition,
        statusCount: 2,
      });
    });

    it('still transitions recovering to active on breached event', () => {
      expectTransition({
        from: alertEpisodeStatus.recovering,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.active,
        stateTransition,
        statusCount: 1,
        expectedStatusCount: 1,
      });
    });
  });

  describe('recoveringTimeframe threshold', () => {
    it('transitions to inactive when timeframe is met', () => {
      expectTransition({
        from: alertEpisodeStatus.recovering,
        on: alertEventStatus.recovered,
        to: alertEpisodeStatus.inactive,
        stateTransition: { recovering_timeframe: '2m' },
        statusCount: 1,
        eventTimestamp: '2025-01-01T00:02:00.000Z',
        previousTimestamp: '2025-01-01T00:00:00.000Z',
      });
    });

    it('stays recovering when timeframe is not met', () => {
      expectTransition({
        from: alertEpisodeStatus.recovering,
        on: alertEventStatus.recovered,
        to: alertEpisodeStatus.recovering,
        stateTransition: { recovering_timeframe: '5m' },
        statusCount: 2,
        expectedStatusCount: 3,
        eventTimestamp: '2025-01-01T00:03:00.000Z',
        previousTimestamp: '2025-01-01T00:00:00.000Z',
      });
    });

    it('uses OR to combine count and timeframe', () => {
      expectTransition({
        from: alertEpisodeStatus.recovering,
        on: alertEventStatus.recovered,
        to: alertEpisodeStatus.inactive,
        stateTransition: {
          recovering_count: 5,
          recovering_timeframe: '2m',
          recovering_operator: 'OR',
        },
        statusCount: 1,
        eventTimestamp: '2025-01-01T00:02:00.000Z',
        previousTimestamp: '2025-01-01T00:00:00.000Z',
      });
    });

    it('uses AND to combine count and timeframe', () => {
      expectTransition({
        from: alertEpisodeStatus.recovering,
        on: alertEventStatus.recovered,
        to: alertEpisodeStatus.recovering,
        stateTransition: {
          recovering_count: 5,
          recovering_timeframe: '2m',
          recovering_operator: 'AND',
        },
        statusCount: 1,
        expectedStatusCount: 2,
        eventTimestamp: '2025-01-01T00:02:00.000Z',
        previousTimestamp: '2025-01-01T00:00:00.000Z',
      });
    });
  });

  describe('combined pending and recovering thresholds', () => {
    const stateTransition: RuleResponse['state_transition'] = {
      pending_count: 2,
      recovering_count: 2,
    };

    it('applies pending threshold independently of recovering', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.active,
        stateTransition,
        statusCount: 1,
        expectedStatusCount: 1,
      });
    });

    it('applies recovering threshold independently of pending', () => {
      expectTransition({
        from: alertEpisodeStatus.recovering,
        on: alertEventStatus.recovered,
        to: alertEpisodeStatus.inactive,
        stateTransition,
        statusCount: 1,
      });
    });
  });

  describe('no previous episode or status count', () => {
    it('treats status count as 0 when the previous episode is not present', () => {
      expectTransition({
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.pending,
        stateTransition: { pending_count: 3 },
        expectedStatusCount: 1,
      });
    });

    it('treats status count as 0 when the previous episode has a null status count', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.pending,
        stateTransition: { pending_count: 3 },
        statusCount: null,
        expectedStatusCount: 1,
      });
    });

    it('increments from 1 when a legacy active episode has a null status count', () => {
      expectTransition({
        from: alertEpisodeStatus.active,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.active,
        stateTransition: { pending_count: 3 },
        statusCount: null,
        expectedStatusCount: 1,
      });
    });
  });

  describe('malformed duration fallback', () => {
    it('ignores an invalid pending_timeframe and evaluates count only', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.active,
        stateTransition: { pending_count: 2, pending_timeframe: 'bad' },
        statusCount: 1,
        expectedStatusCount: 1,
      });
    });

    it('ignores an invalid recovering_timeframe and evaluates count only', () => {
      expectTransition({
        from: alertEpisodeStatus.recovering,
        on: alertEventStatus.recovered,
        to: alertEpisodeStatus.inactive,
        stateTransition: { recovering_count: 2, recovering_timeframe: 'bad' },
        statusCount: 1,
      });
    });
  });

  describe('unaffected transitions (same as basic)', () => {
    const stateTransition: RuleResponse['state_transition'] = {
      pending_count: 5,
      recovering_count: 5,
    };

    it.each<[string, AlertEpisodeStatus, AlertEventStatus, AlertEpisodeStatus]>([
      [
        'inactive',
        alertEpisodeStatus.inactive,
        alertEventStatus.recovered,
        alertEpisodeStatus.inactive,
      ],
      [
        'inactive',
        alertEpisodeStatus.inactive,
        alertEventStatus.no_data,
        alertEpisodeStatus.inactive,
      ],
    ])('stays %s', (_label, from, on, to) => {
      expectTransition({ from, on, to, stateTransition });
    });
  });

  describe('active status_count', () => {
    const stateTransition: RuleResponse['state_transition'] = {
      pending_count: 3,
      recovering_count: 3,
    };

    it('enters active with statusCount 1 from pending when the threshold is met', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.active,
        stateTransition,
        statusCount: 2,
        expectedStatusCount: 1,
      });
    });

    it('increments statusCount while staying active', () => {
      expectTransition({
        from: alertEpisodeStatus.active,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.active,
        stateTransition,
        statusCount: 1,
        expectedStatusCount: 2,
      });
    });

    it('keeps incrementing statusCount across consecutive active evaluations', () => {
      expectTransition({
        from: alertEpisodeStatus.active,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.active,
        stateTransition,
        statusCount: 4,
        expectedStatusCount: 5,
      });
    });

    it('resets statusCount to 1 on a new active span after recovering (flap)', () => {
      expectTransition({
        from: alertEpisodeStatus.recovering,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.active,
        stateTransition,
        statusCount: 3,
        expectedStatusCount: 1,
      });
    });

    it('enters active with statusCount 1 when skipping pending', () => {
      expectTransition({
        from: alertEpisodeStatus.inactive,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.active,
        stateTransition: { pending_count: 0 },
        expectedStatusCount: 1,
      });
    });

    it('resets statusCount independently across active ↔ recovering flaps', () => {
      const flapStateTransition: RuleResponse['state_transition'] = {
        pending_count: 3,
        recovering_count: 10,
      };

      const step = (
        from: AlertEpisodeStatus,
        on: AlertEventStatus,
        statusCount: number
      ): { status: AlertEpisodeStatus; statusCount?: number } =>
        getNextState({
          eventStatus: on,
          stateTransition: flapStateTransition,
          previousEpisode: buildLatestAlertEvent({
            episodeStatus: from,
            eventStatus: on,
            statusCount,
          }),
        });

      // Each contiguous run starts at 1 and increments while staying;
      // a flap starts a new run and must not carry the previous span's count.
      // Sequence: active → recovering → active → recovering → active → recovering
      const ticks: Array<{
        on: AlertEventStatus;
        status: AlertEpisodeStatus;
        statusCount: number;
      }> = [
        { on: alertEventStatus.breached, status: alertEpisodeStatus.active, statusCount: 2 },
        { on: alertEventStatus.recovered, status: alertEpisodeStatus.recovering, statusCount: 1 },
        { on: alertEventStatus.recovered, status: alertEpisodeStatus.recovering, statusCount: 2 },
        { on: alertEventStatus.breached, status: alertEpisodeStatus.active, statusCount: 1 },
        { on: alertEventStatus.breached, status: alertEpisodeStatus.active, statusCount: 2 },
        { on: alertEventStatus.recovered, status: alertEpisodeStatus.recovering, statusCount: 1 },
        { on: alertEventStatus.breached, status: alertEpisodeStatus.active, statusCount: 1 },
        { on: alertEventStatus.recovered, status: alertEpisodeStatus.recovering, statusCount: 1 },
      ];

      let previous: { status: AlertEpisodeStatus; statusCount: number } = {
        status: alertEpisodeStatus.active,
        statusCount: 1,
      };

      for (const tick of ticks) {
        const result = step(previous.status, tick.on, previous.statusCount);
        expect(result).toEqual({ status: tick.status, statusCount: tick.statusCount });
        previous = { status: tick.status, statusCount: tick.statusCount };
      }
    });
  });

  describe("no_data event with no_data_strategy: 'recover'", () => {
    const stateTransition: RuleResponse['state_transition'] = {
      pending_count: 3,
      recovering_count: 3,
    };

    it('transitions inactive → inactive immediately, ignoring pending gating', () => {
      expectTransition({
        from: alertEpisodeStatus.inactive,
        on: alertEventStatus.no_data,
        to: alertEpisodeStatus.inactive,
        stateTransition,
        noDataStrategy: 'recover',
      });
    });

    it('transitions pending → inactive immediately, ignoring pending gating', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.no_data,
        to: alertEpisodeStatus.inactive,
        stateTransition,
        noDataStrategy: 'recover',
        statusCount: 1,
      });
    });

    it('transitions active → inactive immediately, ignoring recovery delay', () => {
      expectTransition({
        from: alertEpisodeStatus.active,
        on: alertEventStatus.no_data,
        to: alertEpisodeStatus.inactive,
        stateTransition,
        noDataStrategy: 'recover',
      });
    });

    it('transitions recovering → inactive immediately, ignoring recovery delay', () => {
      expectTransition({
        from: alertEpisodeStatus.recovering,
        on: alertEventStatus.no_data,
        to: alertEpisodeStatus.inactive,
        stateTransition,
        noDataStrategy: 'recover',
        statusCount: 1,
      });
    });
  });

  describe("no_data event with no_data_strategy: 'last_known_status'", () => {
    const stateTransition: RuleResponse['state_transition'] = {
      pending_count: 3,
      recovering_count: 3,
    };

    it.each<[string, AlertEpisodeStatus, number | null]>([
      ['pending', alertEpisodeStatus.pending, 1],
      ['pending', alertEpisodeStatus.pending, 2],
      ['recovering', alertEpisodeStatus.recovering, 1],
      ['recovering', alertEpisodeStatus.recovering, 2],
      ['active', alertEpisodeStatus.active, 1],
      ['active', alertEpisodeStatus.active, 4],
      ['inactive', alertEpisodeStatus.inactive, null],
    ])('omits statusCount on %s hold (count %s)', (_label, from, statusCount) => {
      const result = getNextState({
        eventStatus: alertEventStatus.no_data,
        stateTransition,
        noDataStrategy: 'last_known_status',
        previousEpisode: buildLatestAlertEvent({
          episodeStatus: from,
          eventStatus: alertEventStatus.no_data,
          statusCount,
        }),
      });

      expect(result.status).toBe(from);
      expect(result).not.toHaveProperty('statusCount');
    });
  });

  // In production, no_data events are never emitted when no_data_strategy is 'none'
  // because getNoDataEsqlQuery returns undefined and ClassifyAbsentGroupsStep skips
  // no-data detection entirely. These tests document what the strategy would do if
  // a no_data event reached it — the general staying-in-status path increments.
  describe("no_data event with no_data_strategy: 'none'", () => {
    const stateTransition: RuleResponse['state_transition'] = {
      pending_count: 3,
      recovering_count: 3,
    };

    it('increments statusCount on active hold', () => {
      expectTransition({
        from: alertEpisodeStatus.active,
        on: alertEventStatus.no_data,
        to: alertEpisodeStatus.active,
        stateTransition,
        noDataStrategy: 'none',
        statusCount: 3,
        expectedStatusCount: 4,
      });
    });

    it('increments statusCount on pending hold', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.no_data,
        to: alertEpisodeStatus.pending,
        stateTransition,
        noDataStrategy: 'none',
        statusCount: 2,
        expectedStatusCount: 3,
      });
    });
  });

  describe("no_data event with no_data_strategy: 'emit'", () => {
    const stateTransition: RuleResponse['state_transition'] = {
      pending_count: 3,
      recovering_count: 3,
    };

    it('transitions inactive → active with statusCount 1', () => {
      expectTransition({
        from: alertEpisodeStatus.inactive,
        on: alertEventStatus.no_data,
        to: alertEpisodeStatus.active,
        stateTransition,
        noDataStrategy: 'emit',
        expectedStatusCount: 1,
      });
    });

    it('increments statusCount while staying active', () => {
      expectTransition({
        from: alertEpisodeStatus.active,
        on: alertEventStatus.no_data,
        to: alertEpisodeStatus.active,
        stateTransition,
        noDataStrategy: 'emit',
        statusCount: 2,
        expectedStatusCount: 3,
      });
    });

    it('transitions recovering → active with statusCount 1 (new span)', () => {
      expectTransition({
        from: alertEpisodeStatus.recovering,
        on: alertEventStatus.no_data,
        to: alertEpisodeStatus.active,
        stateTransition,
        noDataStrategy: 'emit',
        statusCount: 2,
        expectedStatusCount: 1,
      });
    });

    it('keeps a pending episode in pending when the consecutive-breach threshold is not yet met', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.no_data,
        to: alertEpisodeStatus.pending,
        stateTransition,
        noDataStrategy: 'emit',
        statusCount: 1,
        expectedStatusCount: 2,
      });
    });

    it('advances a pending episode to active once the consecutive-breach threshold is met', () => {
      expectTransition({
        from: alertEpisodeStatus.pending,
        on: alertEventStatus.no_data,
        to: alertEpisodeStatus.active,
        stateTransition,
        noDataStrategy: 'emit',
        statusCount: 2,
        expectedStatusCount: 1,
      });
    });
  });
});
