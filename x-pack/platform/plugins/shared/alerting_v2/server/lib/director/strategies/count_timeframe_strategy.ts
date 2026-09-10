/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { inject, injectable } from 'inversify';
import { noDataStrategy } from '@kbn/alerting-v2-schemas';
import type { AlertEpisodeStatus } from '../../../resources/datastreams/alert_events';
import { alertEpisodeStatus, alertEventStatus } from '../../../resources/datastreams/alert_events';
import type { RuleResponse } from '../../rules_client/types';
import { parseDurationToMs } from '../../duration';
import { ALERTING_LOG_CODES } from '../../errors/error_codes';
import {
  LoggerServiceToken,
  type LoggerServiceContract,
} from '../../services/logger_service/logger_service';
import { BasicTransitionStrategy } from './basic_strategy';
import type { StateTransitionContext, StateTransitionResult } from './types';
import type { LatestAlertEventState } from '../queries';

const DEFAULT_STATUS_COUNT = 1;

type Operator = NonNullable<NonNullable<RuleResponse['state_transition']>['pending_operator']>;
const DEFAULT_OPERATOR: Operator = 'OR';

interface ThresholdConfig {
  operator: Operator;
  count?: number;
  timeframeMs?: number;
}

/**
 * Evaluates whether a count-based threshold is met.
 *
 * - If no count is configured, the threshold is always considered met.
 * - Otherwise, the current count must be >= the configured count.
 */
const isCountThresholdMet = (currentCount: number, threshold?: number): boolean => {
  if (threshold == null) {
    return true;
  }

  return currentCount >= threshold;
};

/**
 * Evaluates whether a timeframe-based threshold is met.
 *
 * - If no timeframe is configured, the threshold is always considered met.
 * - Otherwise, the elapsed time must be >= the configured timeframe.
 */
const isTimeframeThresholdMet = (elapsedMs: number, thresholdMs?: number): boolean => {
  if (thresholdMs == null) {
    return true;
  }

  return elapsedMs >= thresholdMs;
};

/**
 * Evaluates whether a combined (count + timeframe) threshold is met,
 * taking the operator into account.
 *
 * - AND: both count and timeframe must be met.
 * - OR:  either count or timeframe is sufficient.
 *
 * When only one dimension is configured, the operator is irrelevant;
 * the single dimension decides.
 */
const isThresholdMet = (
  currentCount: number,
  elapsedMs: number,
  config: ThresholdConfig
): boolean => {
  const countMet = isCountThresholdMet(currentCount, config.count);
  const timeframeMet = isTimeframeThresholdMet(elapsedMs, config.timeframeMs);

  const hasCount = config.count != null;
  const hasTimeframe = config.timeframeMs != null;

  if (hasCount && hasTimeframe) {
    return config.operator === 'AND' ? countMet && timeframeMet : countMet || timeframeMet;
  }

  if (hasCount) {
    return countMet;
  }

  if (hasTimeframe) {
    return timeframeMet;
  }

  // No thresholds configured — always met (behave like basic).
  return true;
};

/**
 * A transition strategy that extends the basic state machine with
 * configurable count (and future timeframe) thresholds for the
 * `pending → active` and `recovering → inactive` transitions.
 *
 * - pending count of 0 means skip pending entirely (inactive → active).
 * - recovering count of 0 means skip recovering entirely (active → inactive).
 * - When no threshold is configured for a phase, the strategy behaves
 *   identically to the basic strategy for that phase.
 */
@injectable()
export class CountTimeframeStrategy extends BasicTransitionStrategy {
  override readonly name = 'count_timeframe';

  private readonly logger: LoggerServiceContract;

  constructor(@inject(LoggerServiceToken) loggerService: LoggerServiceContract) {
    super();
    this.logger = loggerService.forSubsystem('director');
  }

  override canHandle(rule: RuleResponse): boolean {
    return rule.state_transition != null && Object.keys(rule.state_transition).length > 0;
  }

  override getNextState(ctx: StateTransitionContext): StateTransitionResult {
    const { rule, previousEpisode, alertEvent } = ctx;
    const stateTransition = rule.state_transition;
    const currentEpisodeStatus = previousEpisode?.last_episode_status;
    const currentStatusCount = this.getCurrentStatusCount(previousEpisode);
    const currentEpisodeTimestamp = previousEpisode?.last_episode_timestamp;
    const alertEventTimestamp = alertEvent['@timestamp'];

    const elapsedMs = this.getElapsedMs(alertEventTimestamp, currentEpisodeTimestamp);

    // Delegate to the inherited basic state machine to get the "natural" next state.
    const basicResult = super.getNextState(ctx);

    if (!stateTransition) {
      return basicResult;
    }

    if (
      alertEvent.status === alertEventStatus.no_data &&
      (rule.no_data_strategy === noDataStrategy.recover ||
        rule.no_data_strategy === noDataStrategy.last_known_status)
    ) {
      return basicResult;
    }

    // --- Handle pending count of 0: skip pending, go directly to active ---
    if (this.shouldSkipPending(stateTransition, basicResult.status)) {
      return { status: alertEpisodeStatus.active, statusCount: DEFAULT_STATUS_COUNT };
    }

    // --- Handle recovering count of 0: skip recovering, go directly to inactive ---
    if (this.shouldSkipRecovering(stateTransition, basicResult.status)) {
      return { status: alertEpisodeStatus.inactive };
    }

    // --- Pending → Active threshold ---
    if (this.isPendingToActiveTransition(currentEpisodeStatus, basicResult.status)) {
      return this.getNextStateTransition({
        currentStatusCount,
        elapsedMs,
        operator: stateTransition.pending_operator ?? DEFAULT_OPERATOR,
        count: stateTransition.pending_count,
        timeframeMs: this.safeParseDurationToMs(
          stateTransition.pending_timeframe,
          rule.id,
          'pending_timeframe'
        ),
        successStatus: alertEpisodeStatus.active,
        stayStatus: alertEpisodeStatus.pending,
      });
    }

    // --- Recovering → Inactive threshold ---
    if (this.isRecoveringToInactiveTransition(currentEpisodeStatus, basicResult.status)) {
      return this.getNextStateTransition({
        currentStatusCount,
        elapsedMs,
        operator: stateTransition.recovering_operator ?? DEFAULT_OPERATOR,
        count: stateTransition.recovering_count,
        timeframeMs: this.safeParseDurationToMs(
          stateTransition.recovering_timeframe,
          rule.id,
          'recovering_timeframe'
        ),
        successStatus: alertEpisodeStatus.inactive,
        stayStatus: alertEpisodeStatus.recovering,
      });
    }

    if (basicResult.status !== alertEpisodeStatus.inactive) {
      const isStayingInStatus = basicResult.status === currentEpisodeStatus;
      return {
        status: basicResult.status,
        statusCount: isStayingInStatus ? currentStatusCount + 1 : DEFAULT_STATUS_COUNT,
      };
    }

    return basicResult;
  }

  private getCurrentStatusCount(previousEpisode?: LatestAlertEventState): number {
    if (!previousEpisode) {
      return 0;
    }

    return previousEpisode.last_episode_status_count ?? 0;
  }

  private shouldSkipPending(
    stateTransition: NonNullable<RuleResponse['state_transition']>,
    nextStatus: AlertEpisodeStatus
  ): boolean {
    return stateTransition.pending_count === 0 && nextStatus === alertEpisodeStatus.pending;
  }

  private shouldSkipRecovering(
    stateTransition: NonNullable<RuleResponse['state_transition']>,
    nextStatus: AlertEpisodeStatus
  ): boolean {
    return stateTransition.recovering_count === 0 && nextStatus === alertEpisodeStatus.recovering;
  }

  private isPendingToActiveTransition(
    currentStatus: AlertEpisodeStatus | undefined | null,
    nextStatus: AlertEpisodeStatus
  ): boolean {
    return currentStatus === alertEpisodeStatus.pending && nextStatus === alertEpisodeStatus.active;
  }

  private isRecoveringToInactiveTransition(
    currentStatus: AlertEpisodeStatus | undefined | null,
    nextStatus: AlertEpisodeStatus
  ): boolean {
    return (
      currentStatus === alertEpisodeStatus.recovering && nextStatus === alertEpisodeStatus.inactive
    );
  }

  private getNextStateTransition({
    currentStatusCount,
    elapsedMs,
    operator,
    count,
    timeframeMs,
    successStatus,
    stayStatus,
  }: {
    currentStatusCount: number;
    elapsedMs: number;
    operator: Operator;
    count?: number;
    timeframeMs?: number;
    successStatus: AlertEpisodeStatus;
    stayStatus: AlertEpisodeStatus;
  }): StateTransitionResult {
    const nextCount = currentStatusCount + 1;
    const config: ThresholdConfig = { operator, count, timeframeMs };

    if (isThresholdMet(nextCount, elapsedMs, config)) {
      return successStatus === alertEpisodeStatus.inactive
        ? { status: successStatus }
        : { status: successStatus, statusCount: DEFAULT_STATUS_COUNT };
    }

    return { status: stayStatus, statusCount: nextCount };
  }

  /**
   * Safely parses a duration string to milliseconds.
   * Returns `undefined` when the value is malformed so that
   * the timeframe dimension is simply ignored instead of
   * blowing up the entire state transition evaluation.
   */
  private safeParseDurationToMs(
    value: string | undefined,
    ruleId: string,
    resource: 'pending_timeframe' | 'recovering_timeframe'
  ): number | undefined {
    if (!value) {
      return undefined;
    }

    try {
      return parseDurationToMs(value);
    } catch {
      this.logger.warn({
        message: 'Rule state transition timeframe is invalid',
        code: ALERTING_LOG_CODES.DIRECTOR_TIMEFRAME_INVALID,
        labels: { rule_id: ruleId, resource },
      });
      return undefined;
    }
  }

  private getElapsedMs(currentTimestamp?: string, previousTimestamp?: string | null): number {
    if (!currentTimestamp || !previousTimestamp) {
      return 0;
    }

    const currentMs = Date.parse(currentTimestamp);
    const previousMs = Date.parse(previousTimestamp);

    if (Number.isNaN(currentMs) || Number.isNaN(previousMs)) {
      return 0;
    }

    return Math.max(0, currentMs - previousMs);
  }
}
