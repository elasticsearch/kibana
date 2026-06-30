/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidV4 } from 'uuid';
import { inject, injectable } from 'inversify';
import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import type { LoggerServiceContract } from '../services/logger_service/logger_service';
import { LoggerServiceToken } from '../services/logger_service/logger_service';
import type { QueryServiceContract } from '../services/query_service/query_service';
import { QueryServiceInternalToken } from '../services/query_service/tokens';
import { getLatestAlertEventStateQuery, type LatestAlertEventState } from './queries';
import type {
  AlertEpisodeStatus,
  AlertEpisodeTransition,
} from '../../resources/datastreams/alert_events';
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
}

interface CalculateNextStateParams {
  rule: RuleResponse;
  currentAlertEvent: AlertEvent;
  previousAlertEvent?: LatestAlertEventState;
  strategy: ITransitionStrategy;
}

interface ResolveEpisodeIdParams {
  previousAlertEvent?: LatestAlertEventState;
  nextStatus: AlertEpisodeStatus;
}

@injectable()
export class DirectorService {
  constructor(
    @inject(TransitionStrategyFactory)
    private readonly strategyFactory: TransitionStrategyFactory,
    @inject(QueryServiceInternalToken) private readonly queryService: QueryServiceContract,
    @inject(LoggerServiceToken) private readonly logger: LoggerServiceContract
  ) {}

  async run({ rule, alertEvents, executionContext }: RunDirectorParams): Promise<AlertEvent[]> {
    if (alertEvents.length === 0) {
      return [];
    }

    const strategy = this.strategyFactory.getStrategy(rule);
    executionContext.throwIfAborted();
    return this.processAlertEvents(rule, alertEvents, strategy, executionContext);
  }

  private async processAlertEvents(
    rule: RuleResponse,
    alertEvents: readonly AlertEvent[],
    strategy: ITransitionStrategy,
    executionContext: ExecutionContext
  ): Promise<AlertEvent[]> {
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

      return alertEvents.map((currentAlertEvent) =>
        this.getAlertEventWithNextEpisode({
          rule,
          currentAlertEvent,
          previousAlertEvent: alertStateByGroupHash.get(currentAlertEvent.group_hash),
          strategy,
        })
      );
    } finally {
      await scope.disposeAll();
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
  }: CalculateNextStateParams): AlertEvent {
    const currentStatus = previousAlertEvent?.last_episode_status;

    const result: StateTransitionResult = strategy.getNextState({
      rule,
      alertEvent: currentAlertEvent,
      previousEpisode: previousAlertEvent,
    });

    const episodeId = this.resolveEpisodeId({
      previousAlertEvent,
      nextStatus: result.status,
    });

    const statusChanged = currentStatus !== result.status;

    if (statusChanged) {
      this.logger.debug({
        message: `State Transition [${currentAlertEvent.group_hash}]: ${
          currentStatus ?? 'unknown'
        } -> ${result.status} (Episode: ${episodeId})`,
      });
    }

    // The current status span starts now if the status changed (or there is no
    // prior span to carry); otherwise we preserve the original span start so the
    // eventual transition reports the full status duration.
    const statusStartedAt = statusChanged
      ? currentAlertEvent['@timestamp']
      : previousAlertEvent?.last_episode_status_started_at ?? currentAlertEvent['@timestamp'];

    const transition = statusChanged
      ? this.buildTransition({ currentAlertEvent, previousAlertEvent, nextStatus: result.status })
      : undefined;

    return {
      ...currentAlertEvent,
      type: alertEventType.alert,
      episode: {
        id: episodeId,
        status: result.status,
        ...(result.statusCount != null ? { status_count: result.statusCount } : {}),
        status_started_at: statusStartedAt,
      },
      ...(transition != null ? { transition } : {}),
    };
  }

  private buildTransition({
    currentAlertEvent,
    previousAlertEvent,
    nextStatus,
  }: {
    currentAlertEvent: AlertEvent;
    previousAlertEvent?: LatestAlertEventState;
    nextStatus: AlertEpisodeStatus;
  }): AlertEpisodeTransition {
    const previousStatus = previousAlertEvent?.last_episode_status ?? undefined;

    // No prior state span to close (lifecycle start): record the transition but
    // omit the `ends_*` snapshot, mirroring the synthetics `state.ends` semantics.
    if (
      previousAlertEvent == null ||
      previousStatus == null ||
      previousAlertEvent.last_episode_id == null
    ) {
      return { to: nextStatus };
    }

    const startedAt =
      previousAlertEvent.last_episode_status_started_at ??
      previousAlertEvent.last_episode_timestamp ??
      currentAlertEvent['@timestamp'];

    const durationMs = Math.max(
      0,
      Date.parse(currentAlertEvent['@timestamp']) - Date.parse(startedAt)
    );

    return {
      from: previousStatus,
      to: nextStatus,
      ends_episode_id: previousAlertEvent.last_episode_id,
      ends_status: previousStatus,
      ends_started_at: startedAt,
      ends_duration_ms: durationMs,
      ...(previousAlertEvent.last_episode_status_count != null
        ? { ends_status_count: previousAlertEvent.last_episode_status_count }
        : {}),
    };
  }

  private resolveEpisodeId({ previousAlertEvent, nextStatus }: ResolveEpisodeIdParams): string {
    if (!previousAlertEvent) {
      return uuidV4();
    }

    const currentEpisodeStatus = previousAlertEvent.last_episode_status;
    const currentEpisodeId = previousAlertEvent.last_episode_id;

    if (currentEpisodeStatus == null) {
      return uuidV4();
    }

    const isNewLifecycle =
      currentEpisodeStatus === alertEpisodeStatus.inactive &&
      nextStatus !== alertEpisodeStatus.inactive;

    if (isNewLifecycle) {
      return uuidV4();
    }

    return currentEpisodeId ?? uuidV4();
  }
}
