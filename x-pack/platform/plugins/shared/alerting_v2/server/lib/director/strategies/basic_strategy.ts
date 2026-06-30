/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { injectable } from 'inversify';
import {
  alertEpisodeStatus,
  alertEventStatus,
  type AlertEpisodeStatus,
  type AlertEventStatus,
} from '../../../resources/datastreams/alert_events';
import type { RuleResponse } from '../../rules_client/types';
import type { ITransitionStrategy, StateTransitionContext, StateTransitionResult } from './types';

@injectable()
export class BasicTransitionStrategy implements ITransitionStrategy {
  readonly name: string = 'basic';

  // Deterministic state machine transitions using current episode status and alert event status.
  // `no_data` events are not in this table. Their outcome also depends on `rule.no_data_strategy`, and is resolved in getNextStatusForNoData below
  protected readonly stateMachine: Partial<
    Record<AlertEpisodeStatus, Partial<Record<AlertEventStatus, AlertEpisodeStatus>>>
  > = {
    [alertEpisodeStatus.inactive]: {
      breached: alertEpisodeStatus.pending,
      recovered: alertEpisodeStatus.inactive,
    },
    [alertEpisodeStatus.pending]: {
      breached: alertEpisodeStatus.active,
      recovered: alertEpisodeStatus.inactive,
    },
    [alertEpisodeStatus.active]: {
      breached: alertEpisodeStatus.active,
      recovered: alertEpisodeStatus.recovering,
    },
    [alertEpisodeStatus.recovering]: {
      breached: alertEpisodeStatus.active,
      recovered: alertEpisodeStatus.inactive,
    },
  };

  canHandle(_rule: RuleResponse): boolean {
    return true;
  }

  getNextState({
    rule,
    alertEvent,
    previousEpisode,
  }: StateTransitionContext): StateTransitionResult {
    const currentAlertEpisodeStatus = previousEpisode?.last_episode_status;

    if (!currentAlertEpisodeStatus) {
      return { status: alertEpisodeStatus.pending };
    }

    if (alertEvent.status === alertEventStatus.no_data) {
      return { status: this.getNextStatusForNoData(rule, currentAlertEpisodeStatus) };
    }

    const stateRules = this.stateMachine[currentAlertEpisodeStatus];

    if (!stateRules) {
      return { status: alertEpisodeStatus.pending };
    }

    const nextState = stateRules[alertEvent.status];

    return { status: nextState ?? currentAlertEpisodeStatus ?? alertEpisodeStatus.pending };
  }

  private getNextStatusForNoData(
    rule: RuleResponse,
    currentStatus: AlertEpisodeStatus
  ): AlertEpisodeStatus {
    if (rule.no_data_strategy === 'emit') {
      return alertEpisodeStatus.active;
    } else if (rule.no_data_strategy === 'recover') {
      return this.stateMachine[currentStatus]?.recovered ?? currentStatus;
    }
    // for all other no_data_strategy types return the last known episode status
    return currentStatus;
  }
}
