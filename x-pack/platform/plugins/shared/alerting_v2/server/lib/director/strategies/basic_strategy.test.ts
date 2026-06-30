/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BasicTransitionStrategy } from './basic_strategy';
import type {
  AlertEpisodeStatus,
  AlertEventStatus,
} from '../../../resources/datastreams/alert_events';
import { alertEpisodeStatus, alertEventStatus } from '../../../resources/datastreams/alert_events';
import { createRuleResponse } from '../../test_utils';
import { buildLatestAlertEvent, buildStrategyStateTransitionContext } from '../test_utils';

describe('BasicTransitionStrategy', () => {
  let strategy: BasicTransitionStrategy;

  beforeEach(() => {
    strategy = new BasicTransitionStrategy();
  });

  const getNextState = (...args: Parameters<typeof buildStrategyStateTransitionContext>) =>
    strategy.getNextState(buildStrategyStateTransitionContext(...args));

  const expectTransition = ({
    from,
    on,
    to,
  }: {
    from?: AlertEpisodeStatus | null;
    on: AlertEventStatus;
    to: AlertEpisodeStatus;
  }) => {
    const result = getNextState({
      eventStatus: on,
      ...(from !== undefined
        ? {
            previousEpisode: buildLatestAlertEvent({
              episodeStatus: from,
              eventStatus: on,
            }),
          }
        : {}),
    });

    expect(result).toEqual({ status: to });
  };

  it('has name "basic"', () => {
    expect(strategy.name).toBe('basic');
  });

  describe('canHandle', () => {
    it('returns true for any rule (acts as fallback)', () => {
      expect(strategy.canHandle(createRuleResponse())).toBe(true);
      expect(
        strategy.canHandle(createRuleResponse({ state_transition: { pending_count: 3 } }))
      ).toBe(true);
    });
  });

  describe('no previous episode', () => {
    it('returns pending when there is no previous episode', () => {
      expectTransition({
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.pending,
      });
    });

    it('returns pending when previous episode status is null', () => {
      expectTransition({
        from: null,
        on: alertEventStatus.breached,
        to: alertEpisodeStatus.pending,
      });
    });

    it('returns pending when the current state is unknown', () => {
      const result = getNextState({
        eventStatus: alertEventStatus.breached,
        previousEpisode: {
          ...buildLatestAlertEvent({
            episodeStatus: alertEpisodeStatus.pending,
            eventStatus: alertEventStatus.breached,
          }),
          // @ts-expect-error - unknown state testing
          last_episode_status: 'unknown_state',
        },
      });
      expect(result).toEqual({ status: alertEpisodeStatus.pending });
    });
  });

  describe('state transitions from inactive', () => {
    it.each<[string, AlertEventStatus, AlertEpisodeStatus]>([
      ['pending', alertEventStatus.breached, alertEpisodeStatus.pending],
      ['inactive', alertEventStatus.recovered, alertEpisodeStatus.inactive],
      ['inactive', alertEventStatus.no_data, alertEpisodeStatus.inactive],
    ])('transitions to %s on %s event', (_label, on, to) => {
      expectTransition({ from: alertEpisodeStatus.inactive, on, to });
    });
  });

  describe('state transitions from pending', () => {
    it.each<[string, AlertEventStatus, AlertEpisodeStatus]>([
      ['active', alertEventStatus.breached, alertEpisodeStatus.active],
      ['inactive', alertEventStatus.recovered, alertEpisodeStatus.inactive],
      ['pending', alertEventStatus.no_data, alertEpisodeStatus.pending],
    ])('transitions to %s on %s event', (_label, on, to) => {
      expectTransition({ from: alertEpisodeStatus.pending, on, to });
    });
  });

  describe('state transitions from active', () => {
    it.each<[string, AlertEventStatus, AlertEpisodeStatus]>([
      ['active', alertEventStatus.breached, alertEpisodeStatus.active],
      ['recovering', alertEventStatus.recovered, alertEpisodeStatus.recovering],
      ['active', alertEventStatus.no_data, alertEpisodeStatus.active],
    ])('transitions to %s on %s event', (_label, on, to) => {
      expectTransition({ from: alertEpisodeStatus.active, on, to });
    });
  });

  describe('state transitions from recovering', () => {
    it.each<[string, AlertEventStatus, AlertEpisodeStatus]>([
      ['active', alertEventStatus.breached, alertEpisodeStatus.active],
      ['inactive', alertEventStatus.recovered, alertEpisodeStatus.inactive],
      ['recovering', alertEventStatus.no_data, alertEpisodeStatus.recovering],
    ])('transitions to %s on %s event', (_label, on, to) => {
      expectTransition({ from: alertEpisodeStatus.recovering, on, to });
    });
  });

  describe('defensive fallbacks', () => {
    it('returns pending for unknown current state', () => {
      const result = getNextState({
        eventStatus: alertEventStatus.breached,
        previousEpisode: {
          ...buildLatestAlertEvent({
            episodeStatus: alertEpisodeStatus.pending,
            eventStatus: alertEventStatus.breached,
          }),
          // @ts-expect-error - unknown state testing
          last_episode_status: 'unknown_state',
        },
      });
      expect(result).toEqual({ status: alertEpisodeStatus.pending });
    });

    it('returns current state for unknown event status', () => {
      const result = getNextState({
        // @ts-expect-error - unknown event status testing
        eventStatus: 'unknown_event',
        previousEpisode: buildLatestAlertEvent({
          episodeStatus: alertEpisodeStatus.active,
          eventStatus: alertEventStatus.breached,
        }),
      });
      expect(result).toEqual({ status: alertEpisodeStatus.active });
    });
  });

  describe('no_data event branching on rule.no_data_strategy', () => {
    it.each<[AlertEpisodeStatus]>([
      [alertEpisodeStatus.inactive],
      [alertEpisodeStatus.pending],
      [alertEpisodeStatus.active],
      [alertEpisodeStatus.recovering],
    ])("'emit' sets %s to active", (from) => {
      const result = getNextState({
        eventStatus: alertEventStatus.no_data,
        noDataStrategy: 'emit',
        previousEpisode: buildLatestAlertEvent({
          episodeStatus: from,
          eventStatus: alertEventStatus.no_data,
        }),
      });
      expect(result).toEqual({ status: alertEpisodeStatus.active });
    });

    it.each<[AlertEpisodeStatus]>([
      [alertEpisodeStatus.inactive],
      [alertEpisodeStatus.pending],
      [alertEpisodeStatus.active],
      [alertEpisodeStatus.recovering],
    ])("'last_known_status' preserves %s", (from) => {
      const result = getNextState({
        eventStatus: alertEventStatus.no_data,
        noDataStrategy: 'last_known_status',
        previousEpisode: buildLatestAlertEvent({
          episodeStatus: from,
          eventStatus: alertEventStatus.no_data,
        }),
      });
      expect(result).toEqual({ status: from });
    });

    it.each<[AlertEpisodeStatus, AlertEpisodeStatus]>([
      [alertEpisodeStatus.inactive, alertEpisodeStatus.inactive],
      [alertEpisodeStatus.pending, alertEpisodeStatus.inactive],
      [alertEpisodeStatus.active, alertEpisodeStatus.recovering],
      [alertEpisodeStatus.recovering, alertEpisodeStatus.inactive],
    ])("'recover' transitions %s → %s (mirrors recovered-event FSM)", (from, to) => {
      const result = getNextState({
        eventStatus: alertEventStatus.no_data,
        noDataStrategy: 'recover',
        previousEpisode: buildLatestAlertEvent({
          episodeStatus: from,
          eventStatus: alertEventStatus.no_data,
        }),
      });
      expect(result).toEqual({ status: to });
    });
  });
});
