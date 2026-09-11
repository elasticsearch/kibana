/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { inject, injectable } from 'inversify';
import type { AlertEventSeverity } from '@kbn/alerting-v2-schemas';
import type {
  AlertEpisode,
  DispatcherStep,
  DispatcherPipelineState,
  DispatcherStepOutput,
} from '../types';
import type { AlertEpisodeStatus } from '../../../resources/datastreams/alert_events';
import type { QueryServiceContract } from '../../services/query_service/query_service';
import { QueryServiceInternalToken } from '../../services/query_service/tokens';
import { EPISODE_QUERY_LIMIT, getDispatchableAlertEventsQuery } from '../queries';
import { EpisodeScan } from '../state';
import type { LoggerServiceContract } from '../../services/logger_service/logger_service';

interface RawAlertEpisode {
  last_event_timestamp: string;
  rule_id: string | null;
  source: string;
  space_id: string;
  group_hash: string;
  episode_id: string;
  episode_status: AlertEpisodeStatus;
  severity: AlertEventSeverity | null;
}

@injectable()
export class FetchEpisodesStep implements DispatcherStep {
  public readonly name = 'fetch_episodes';

  constructor(
    @inject(QueryServiceInternalToken) private readonly queryService: QueryServiceContract
  ) {}

  public async execute(
    state: Readonly<DispatcherPipelineState>,
    logger: LoggerServiceContract
  ): Promise<DispatcherStepOutput> {
    const { windowStart, windowEnd, signal } = state.input;
    const gte = windowStart.toISOString();
    const lte = windowEnd.toISOString();

    const result = await this.queryService.executeQueryRows<RawAlertEpisode>({
      query: getDispatchableAlertEventsQuery({ gte, lte }).query,
      // Lucene push-down is lower-bounded only. An `lte: windowEnd` here would
      // drop action docs stamped with `now` (after the settle buffer) and
      // break `last_fired` dedup. Event rows are still capped at `lte` inside
      // the ES|QL WHERE (type == "alert" AND @timestamp <= lte).
      filter: {
        range: {
          '@timestamp': { gte },
        },
      },
      abortSignal: signal,
    });

    // Event-row `lte` makes windowEnd a provable watermark advance target:
    // the scan has a defined upper edge to advance to.
    const truncated = result.length === EPISODE_QUERY_LIMIT;

    const episodes = parseAlertEpisodes(result);

    if (episodes.length === 0) {
      return { type: 'halt', reason: 'no_episodes' };
    }

    return { type: 'continue', data: { scan: EpisodeScan.of({ episodes, truncated }) } };
  }
}

export function parseAlertEpisodes(raw: RawAlertEpisode[]): AlertEpisode[] {
  return raw.map(({ severity, ...rest }) => ({
    ...rest,
    ...(severity ? { severity } : {}),
  }));
}
