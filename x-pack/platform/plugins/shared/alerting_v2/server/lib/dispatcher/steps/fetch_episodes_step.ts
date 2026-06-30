/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import { set } from '@kbn/safer-lodash-set';
import { inject, injectable } from 'inversify';
import type {
  AlertEpisode,
  AlertEpisodeData,
  DispatcherStep,
  DispatcherPipelineState,
  DispatcherStepOutput,
} from '../types';
import type {
  AlertEpisodeStatus,
  AlertEventSeverity,
} from '../../../resources/datastreams/alert_events';
import type { QueryServiceContract } from '../../services/query_service/query_service';
import { QueryServiceInternalToken } from '../../services/query_service/tokens';
import { LOOKBACK_WINDOW_MINUTES } from '../constants';
import { getDispatchableAlertEventsQuery } from '../queries';

interface RawAlertEpisode {
  last_event_timestamp: string;
  rule_id: string;
  group_hash: string;
  episode_id: string;
  episode_status: AlertEpisodeStatus;
  data_json: string | null;
  severity: AlertEventSeverity | null;
}

@injectable()
export class FetchEpisodesStep implements DispatcherStep {
  public readonly name = 'fetch_episodes';

  constructor(
    @inject(QueryServiceInternalToken) private readonly queryService: QueryServiceContract
  ) {}

  public async execute(state: Readonly<DispatcherPipelineState>): Promise<DispatcherStepOutput> {
    const { previousStartedAt } = state.input;

    const lookback = moment(previousStartedAt)
      .subtract(LOOKBACK_WINDOW_MINUTES, 'minutes')
      .toISOString();

    const result = await this.queryService.executeQueryRows<RawAlertEpisode>({
      query: getDispatchableAlertEventsQuery().query,
      filter: {
        range: {
          '@timestamp': {
            gte: lookback,
          },
        },
      },
    });

    const episodes = parseAlertEpisodes(result);

    if (episodes.length === 0) {
      return { type: 'halt', reason: 'no_episodes' };
    }

    return { type: 'continue', data: { episodes } };
  }
}

export function parseAlertEpisodes(raw: RawAlertEpisode[]): AlertEpisode[] {
  return raw.map(({ data_json, severity, ...rest }) => ({
    ...rest,
    ...(severity ? { severity } : {}),
    ...(data_json ? { data: parseDataJson(data_json) } : {}),
  }));
}

export function parseDataJson(json: string): AlertEpisodeData {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const result: AlertEpisodeData = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        set(result, key.split('.'), value);
      }
    }
    return result;
  } catch {
    return {};
  }
}
