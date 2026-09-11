/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ESQLControlVariable } from '@kbn/esql-types';
import { ESQLVariableType } from '@kbn/esql-types';
import type { ExpressionsStart } from '@kbn/expressions-plugin/public';
import type { Filter, TimeRange } from '@kbn/es-query';
import {
  asEsqlRows,
  buildEpisodesQuery,
  PAGE_SIZE_ESQL_VARIABLE,
  type AlertEpisodeEsqlRow,
  type EpisodesFilterState,
  type EpisodesSortState,
} from '@kbn/alerting-v2-common-queries';
import { executeEsqlQuery } from '../utils/execute_esql_query';
import { buildAlertEventsTimeRangeFilter } from '../utils/build_alert_events_time_range_filter';

export interface FetchAlertingEpisodesOptions {
  spaceId: string;
  pageSize: number;
  timeRange?: TimeRange | null;
  filterState?: EpisodesFilterState;
  sortState?: EpisodesSortState;
  abortSignal?: AbortSignal;
  services: { expressions: ExpressionsStart };
}

/**
 * Executes an ES|QL query to fetch alerting episodes.
 * Uses the timestamp of the last episode from the previous page as a cursor for pagination.
 */
export const fetchAlertingEpisodes = ({
  spaceId,
  abortSignal,
  pageSize,
  services: { expressions },
  filterState,
  sortState = { sortField: '@timestamp', sortDirection: 'desc' },
  timeRange,
}: FetchAlertingEpisodesOptions): Promise<AlertEpisodeEsqlRow[]> => {
  const query = buildEpisodesQuery(spaceId, sortState, filterState);

  const input: {
    type: 'kibana_context';
    esqlVariables: ESQLControlVariable[];
    filters?: Filter[];
  } = {
    type: 'kibana_context',
    esqlVariables: [
      { key: PAGE_SIZE_ESQL_VARIABLE, value: pageSize, type: ESQLVariableType.VALUES },
    ],
  };

  const timeRangeFilter = buildAlertEventsTimeRangeFilter(timeRange);
  if (timeRangeFilter) {
    input.filters = [timeRangeFilter];
  }

  return executeEsqlQuery({
    expressions,
    query: query.print('basic'),
    input,
    abortSignal,
  }).then((rows) => asEsqlRows(query, rows));
};
