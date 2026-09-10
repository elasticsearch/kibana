/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidV4 } from 'uuid';
import { inject, injectable } from 'inversify';
import { ALERT_EPISODE_ACTION_TYPE, type RuleResponse } from '@kbn/alerting-v2-schemas';
import type { LoggerServiceContract } from '../services/logger_service/logger_service';
import { LoggerServiceToken } from '../services/logger_service/logger_service';
import { ALERTING_LOG_CODES } from '../errors/error_codes';
import type { QueryServiceContract } from '../services/query_service/query_service';
import { QueryServiceInternalToken } from '../services/query_service/tokens';
import { getLatestAlertEventStateQuery, type LatestAlertEventState } from './queries';
import type { AlertEpisodeStatus } from '../../resources/datastreams/alert_events';
import {
  alertEpisodeStatus,
  alertEventType,
  type AlertEvent,
} from '../../resources/datastreams/alert_events';
import { TransitionStrategyFactory } from './strategies/strategy_resolver';
import type { ITransitionStrategy, StateTransitionResult } from './strategies/types';
import type { ExecutionContext } from '../execution_context';

interface RunDirectorParams {
  rule: RuleResponse;
  alertEvents: readonly AlertEvent[];
  executionContext: ExecutionContext;
  spaceId: string;
}

interface CalculateNextStateParams {
  rule: RuleResponse;
  currentAlertEvent: AlertEvent;
  previousAlertEvent?: LatestAlertEventState;
  strategy: ITransitionStrategy;
  logger: LoggerServiceContract;
}

interface ResolveEpisodeIdParams {
  previousAlertEvent?: LatestAlertEventState;
  nextStatus: AlertEpisodeStatus;
}

interface ResolveEpisodeIdResult {
  readonly episodeId: string;
  readonly isNew: boolean;
}

export interface DirectorRunStats {
  readonly newEpisodeIds: readonly string[];
}

export interface DirectorRunResult {
  readonly alertEvents: AlertEvent[];
  readonly stats: DirectorRunStats;
}

@injectable()
export class DirectorService {
  constructor(
    @inject(TransitionStrategyFactory)
    private readonly strategyFactory: TransitionStrategyFactory,
    @inject(QueryServiceInternalToken) private readonly queryService: QueryServiceContract,
    @inject(LoggerServiceToken) private readonly logger: LoggerServiceContract
  ) {}

  async run({
    rule,
    alertEvents,
    executionContext,
    spaceId,
  }: RunDirectorParams): Promise<DirectorRunResult> {
    if (alertEvents.length === 0) {
      return { alertEvents: [], stats: { newEpisodeIds: [] } };
    }

    const logger = this.logger.forSubsystem('director').withLabels({
      rule_id: rule.id,
      rule_kind: rule.kind,
      space_id: spaceId,
    });

    const strategy = this.strategyFactory.getStrategy(rule);
    executionContext.throwIfAborted();
    return this.processAlertEvents(rule, alertEvents, strategy, executionContext, logger);
  }

  private async processAlertEvents(
    rule: RuleResponse,
    alertEvents: readonly AlertEvent[],
    strategy: ITransitionStrategy,
    executionContext: ExecutionContext,
    logger: LoggerServiceContract
  ): Promise<DirectorRunResult> {
    const scope = executionContext.createScope();
    const groupHashes = [...new Set(alertEvents.map((e) => e.group_hash))];
    const alertStateByGroupHash = await this.fetchLatestAlertStateByGroupHash(
      rule,
      groupHashes,
      executionContext
    );

    scope.add(() => alertStateByGroupHash.clear());

    try {
      executionContext.throwIfAborted();

      const newEpisodeIds: string[] = [];
      const processed = alertEvents.map((currentAlertEvent) => {
        const { alertEvent, isNewEpisode } = this.getAlertEventWithNextEpisode({
          rule,
          currentAlertEvent,
          previousAlertEvent: alertStateByGroupHash.get(currentAlertEvent.group_hash),
          strategy,
          logger,
        });

        if (isNewEpisode && alertEvent.episode) {
          newEpisodeIds.push(alertEvent.episode.id);
        }

        return alertEvent;
      });

      return { alertEvents: processed, stats: { newEpisodeIds } };
    } finally {
      try {
        await scope.disposeAll();
      } catch (error) {
        logger.warn({
          message: 'Failed to release alert state cache',
          error,
          code: ALERTING_LOG_CODES.DIRECTOR_CLEANUP_FAILED,
        });
      }
    }
  }

  private async fetchLatestAlertStateByGroupHash(
    rule: RuleResponse,
    groupHashes: string[],
    context: ExecutionContext
  ): Promise<Map<string, LatestAlertEventState>> {
    const request = getLatestAlertEventStateQuery({ ruleId: rule.id, groupHashes }).toRequest();
    const records = await this.queryService.executeQueryRows<LatestAlertEventState>({
      query: request.query,
      // @ts-expect-error - the types of the composer query are not compatible with the types of the esql client
      params: request.params,
      // @ts-expect-error - the types of the composer query are not compatible with the types of the esql client
      filter: request.filter,
      abortSignal: context.signal,
    });

    return new Map(records.map((record) => [record.group_hash, record]));
  }

  private getAlertEventWithNextEpisode({
    rule,
    currentAlertEvent,
    previousAlertEvent,
    strategy,
    logger,
  }: CalculateNextStateParams): { alertEvent: AlertEvent; isNewEpisode: boolean } {
    // User lock: once a user hits `activate` on a group, the episode
    // stays `active` regardless of what the strategy computes, until
    // the user hits `deactivate` (which flips the lifecycle marker
    // back and lets the strategy own transitions again). We preserve
    // the incoming event's `status` (e.g. `recovered`) so downstream
    // analytics keep the raw engine signal. Only `episode.status` is
    // forced. `episode.status_count` follows the same per-span rules as
    // the engine: reset to 1 when entering a new status, increment
    // while staying.
    if (this.isUserLocked(previousAlertEvent)) {
      return {
        alertEvent: {
          ...currentAlertEvent,
          type: alertEventType.alert,
          episode: {
            id: previousAlertEvent!.last_episode_id!,
            status: alertEpisodeStatus.active,
            status_count: this.getUserLockedStatusCount(previousAlertEvent!),
          },
        },
        isNewEpisode: false,
      };
    }

    const currentStatus = previousAlertEvent?.last_episode_status;

    const result: StateTransitionResult = strategy.getNextState({
      rule,
      alertEvent: currentAlertEvent,
      previousEpisode: previousAlertEvent,
    });

    const { episodeId, isNew } = this.resolveEpisodeId({
      previousAlertEvent,
      nextStatus: result.status,
    });

    if (currentStatus !== result.status) {
      logger.debug({
        message: 'Episode status transition',
        labels: {
          group_hash: currentAlertEvent.group_hash,
          episode_id: episodeId,
          resource: `${currentStatus ?? 'unknown'}->${result.status}`,
        },
      });
    }

    return {
      alertEvent: {
        ...currentAlertEvent,
        episode: {
          id: episodeId,
          status: result.status,
          ...(result.statusCount != null ? { status_count: result.statusCount } : {}),
        },
      },
      isNewEpisode: isNew,
    };
  }

  /**
   * The audit stream is the source of truth for whether a group is
   * user-owned: if the most recent lifecycle action (`activate` or
   * `deactivate`) for this group is `activate`, the director must
   * hold the episode in `active`. `deactivate` or the absence of
   * any lifecycle action releases the strategy to decide.
   *
   * Episode correlation is enforced upstream in
   * `getLatestAlertEventStateQuery`: `last_lifecycle_action_type` is
   * only populated when the latest audit doc's `episode_id` matches
   * `last_episode_id`. When they diverge (concurrent bulk actions on
   * different episodes of the same group, or a partial `_bulk` write
   * where only one of the audit / synthetic rule-event docs landed),
   * the query returns `null` here — which we treat as "no lock" and
   * hand control back to the strategy. That query-level guard is why
   * this method can safely trust `last_lifecycle_action_type` to
   * describe the same episode as `last_episode_id`.
   *
   * We still require `last_episode_id` to be present so the
   * forced-active emit has an episode to pin to; in practice this is
   * always true when `last_lifecycle_action_type === 'activate'` (the
   * action client refuses to create an activate audit doc without a
   * pre-existing `.rule-events` row), but the guard keeps the
   * director defensive against an edge where the rule-events stream
   * has been pruned but the audit stream has not.
   */
  private isUserLocked(previousAlertEvent?: LatestAlertEventState): boolean {
    if (!previousAlertEvent) {
      return false;
    }

    return (
      previousAlertEvent.last_lifecycle_action_type === ALERT_EPISODE_ACTION_TYPE.ACTIVATE &&
      previousAlertEvent.last_episode_id !== null
    );
  }

  /**
   * Follows the same per-span rules as the engine: reset to 1 on
   * status change, increment while staying in the same status.
   */
  private getUserLockedStatusCount(previousAlertEvent: LatestAlertEventState): number {
    const defaultCount = 1;
    if (previousAlertEvent.last_episode_status !== alertEpisodeStatus.active) {
      return defaultCount;
    }

    return (previousAlertEvent.last_episode_status_count ?? defaultCount) + 1;
  }

  private resolveEpisodeId({
    previousAlertEvent,
    nextStatus,
  }: ResolveEpisodeIdParams): ResolveEpisodeIdResult {
    if (!previousAlertEvent) {
      return { episodeId: uuidV4(), isNew: true };
    }

    const currentEpisodeStatus = previousAlertEvent.last_episode_status;
    const currentEpisodeId = previousAlertEvent.last_episode_id;

    if (currentEpisodeStatus == null) {
      return { episodeId: uuidV4(), isNew: true };
    }

    const isNewLifecycle =
      currentEpisodeStatus === alertEpisodeStatus.inactive &&
      nextStatus !== alertEpisodeStatus.inactive;

    if (isNewLifecycle) {
      return { episodeId: uuidV4(), isNew: true };
    }

    if (currentEpisodeId == null) {
      return { episodeId: uuidV4(), isNew: true };
    }

    return { episodeId: currentEpisodeId, isNew: false };
  }
}
