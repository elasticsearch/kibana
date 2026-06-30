/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import type {
  AlertEpisodeStatus,
  AlertEventStatus,
} from '../../resources/datastreams/alert_events';
import { createAlertEvent } from '../rule_executor/test_utils';
import { createRuleResponse } from '../test_utils';
import type { StateTransitionContext } from './strategies/types';
import type { LatestAlertEventState } from './queries';

const DEFAULT_TIMESTAMP = '2025-01-01T00:00:00.000Z';
const DEFAULT_EPISODE_ID = 'episode-1';
const DEFAULT_GROUP_HASH = 'hash-1';

export const buildLatestAlertEvent = ({
  episodeStatus,
  eventStatus,
  statusCount,
  previousTimestamp,
  episodeId = DEFAULT_EPISODE_ID,
  groupHash = DEFAULT_GROUP_HASH,
}: {
  episodeStatus: AlertEpisodeStatus | null;
  eventStatus: AlertEventStatus;
  statusCount?: number | null;
  previousTimestamp?: string | null;
  episodeId?: string;
  groupHash?: string;
}): LatestAlertEventState => ({
  last_status: eventStatus,
  last_episode_id: episodeId,
  last_episode_status: episodeStatus,
  last_episode_status_count: statusCount ?? null,
  last_episode_timestamp: previousTimestamp ?? DEFAULT_TIMESTAMP,
  group_hash: groupHash,
});

export const buildStrategyStateTransitionContext = ({
  eventStatus,
  stateTransition,
  noDataStrategy,
  eventTimestamp,
  previousEpisode,
}: {
  eventStatus: AlertEventStatus;
  stateTransition?: RuleResponse['state_transition'];
  noDataStrategy?: RuleResponse['no_data_strategy'];
  eventTimestamp?: string;
  previousEpisode?: LatestAlertEventState;
}): StateTransitionContext => ({
  rule: createRuleResponse({
    state_transition: stateTransition,
    no_data_strategy: noDataStrategy,
  }),
  alertEvent: createAlertEvent({
    status: eventStatus,
    '@timestamp': eventTimestamp ?? DEFAULT_TIMESTAMP,
  }),
  ...(previousEpisode ? { previousEpisode } : {}),
});
