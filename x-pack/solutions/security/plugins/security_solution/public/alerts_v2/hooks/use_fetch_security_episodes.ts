/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import type { ExpressionsStart } from '@kbn/expressions-plugin/public';
import type { TimeRange } from '@kbn/es-query';
import type { ESQLControlVariable } from '@kbn/esql-types';
import { ESQLVariableType } from '@kbn/esql-types';
import type { AlertEpisodeStatus } from '@kbn/alerting-v2-schemas';
import { esql } from '@elastic/esql';
import { escapeStringValue } from '@kbn/esql-utils/src/utils/append_to_query/utils';
import { useAlertingEpisodesDataView } from '@kbn/alerting-v2-episodes-ui/hooks/use_alerting_episodes_data_view';
import type { UseAlertingEpisodesDataViewOptions } from '@kbn/alerting-v2-episodes-ui/hooks/use_alerting_episodes_data_view';
import { executeEsqlQuery } from '@kbn/alerting-v2-episodes-ui/utils/execute_esql_query';
import { addEpisodeAggregation } from '@kbn/alerting-v2-episodes-ui/queries/episodes_query';

const ALERT_EVENTS_DATA_STREAM = '.rule-events';
const ALERT_ACTIONS_DATA_STREAM = '.alert-actions';
const PAGE_SIZE_ESQL_VARIABLE = 'pageSize';

export type WorkflowStatus = 'open' | 'acknowledged' | 'closed';

export interface SecurityAlertEpisode {
  '@timestamp': string;
  'episode.id': string;
  'episode.status': AlertEpisodeStatus;
  'rule.id': string;
  group_hash: string;
  first_timestamp: string;
  last_timestamp: string;
  duration: number;
  workflow_status: WorkflowStatus;
  last_assignee_uid?: string | null;
  last_snooze_action?: 'snooze' | 'unsnooze';
  snooze_expiry?: string;
  last_deactivate_action?: 'activate' | 'deactivate';
  last_tags?: string[];
}

const SECURITY_EPISODE_FIELDS = [
  '@timestamp',
  'episode.id',
  'episode.status',
  'rule.id',
  'group_hash',
  'first_timestamp',
  'last_timestamp',
  'duration',
  'workflow_status',
  'last_assignee_uid',
  'last_snooze_action',
  'snooze_expiry',
  'last_deactivate_action',
  'last_tags',
] as const;

const ACTION_TYPES_FILTER =
  '("deactivate", "activate", "snooze", "unsnooze", "tag", "ack", "unack", "assign")';

export interface SecurityEpisodesFilterState {
  queryString?: string | null;
  ruleId?: string | null;
  tags?: string[] | null;
  assigneeUid?: string;
  workflowStatus?: WorkflowStatus;
}

export interface SecurityEpisodesSortState {
  sortField: string;
  sortDirection: 'asc' | 'desc';
}

const ALLOWLISTED_SORT_FIELDS = new Set([
  '@timestamp',
  'episode.id',
  'episode.status',
  'rule.id',
  'duration',
  'workflow_status',
]);

const sanitizeSortField = (field: string) =>
  ALLOWLISTED_SORT_FIELDS.has(field) ? field : '@timestamp';

const buildSecurityEpisodesQuery = (
  sortState: SecurityEpisodesSortState,
  spaceId: string,
  filterState?: SecurityEpisodesFilterState
) => {
  const query = esql.from([ALERT_EVENTS_DATA_STREAM, ALERT_ACTIONS_DATA_STREAM], ['_source']);

  query.where`space_id == ${spaceId}`;

  const trimmedSearch = filterState?.queryString?.trim();
  if (trimmedSearch) {
    query.pipe(
      `WHERE ((type == "alert" AND QSTR(${escapeStringValue(
        trimmedSearch
      )})) OR (action_type IN ${ACTION_TYPES_FILTER}))`
    );
  } else {
    query.pipe(`WHERE type == "alert" OR action_type IN ${ACTION_TYPES_FILTER}`);
  }

  // Group-level action stats (series-scoped)
  // prettier-ignore
  query
    .pipe`INLINE STATS last_deactivate_action = LAST(action_type, @timestamp) WHERE action_type IN ("deactivate", "activate"),
                       last_snooze_action     = LAST(action_type, @timestamp) WHERE action_type IN ("snooze", "unsnooze"),
                       snooze_expiry          = LAST(expiry, @timestamp)      WHERE action_type == "snooze",
                       last_tags              = LAST(tags, @timestamp)        WHERE action_type == "tag"
          BY group_hash`;

  // Episode-level action stats (episode-scoped) — includes workflow status derivation
  // workflow_status uses platform primitives: ack for acknowledged, deactivate for closed
  // prettier-ignore
  query
    .pipe`EVAL episode_id = COALESCE(\`episode.id\`, episode_id)`
    .pipe`INLINE STATS last_ack_action      = LAST(action_type,  @timestamp) WHERE action_type IN ("ack", "unack"),
                       last_assignee_uid    = LAST(assignee_uid, @timestamp) WHERE action_type == "assign"
          BY episode_id`
    .pipe`EVAL workflow_status = CASE(
            last_deactivate_action == "deactivate", "closed",
            last_ack_action == "ack",               "acknowledged",
            "open"
          )`;

  query.where`type == "alert"`;

  addEpisodeAggregation(query);

  if (filterState?.ruleId) {
    query.where`rule.id == ${filterState.ruleId}`;
  }

  if (filterState?.tags?.length) {
    const trimmed = filterState.tags.map((t) => t.trim()).filter(Boolean);
    if (trimmed.length === 1) {
      query.where`MV_CONTAINS(last_tags, ${trimmed[0]})`;
    } else if (trimmed.length > 1) {
      const clause = trimmed
        .map((t) => `MV_CONTAINS(last_tags, ${escapeStringValue(t)})`)
        .join(' OR ');
      query.pipe(`WHERE (${clause})`);
    }
  }

  if (filterState?.assigneeUid) {
    query.where`last_assignee_uid == ${filterState.assigneeUid}`;
  }

  if (filterState?.workflowStatus) {
    query.where`workflow_status == ${filterState.workflowStatus}`;
  }

  const sortField = sanitizeSortField(sortState.sortField);
  const sortDir = sortState.sortDirection.toUpperCase() as 'ASC' | 'DESC';
  const pageSizeParam = esql.par(undefined, PAGE_SIZE_ESQL_VARIABLE);

  return query.sort([sortField, sortDir]).pipe`LIMIT ${pageSizeParam}`.keep(
    ...SECURITY_EPISODE_FIELDS
  );
};

export interface UseFetchSecurityEpisodesOptions {
  spaceId: string | undefined;
  pageSize: number;
  filterState?: SecurityEpisodesFilterState;
  sortState?: SecurityEpisodesSortState;
  timeRange?: TimeRange | null;
  services: UseAlertingEpisodesDataViewOptions['services'] & {
    expressions: ExpressionsStart;
  };
}

const DEFAULT_SORT: SecurityEpisodesSortState = {
  sortField: '@timestamp',
  sortDirection: 'desc',
};

export const useFetchSecurityEpisodes = ({
  spaceId,
  pageSize,
  services,
  filterState,
  sortState = DEFAULT_SORT,
  timeRange,
}: UseFetchSecurityEpisodesOptions) => {
  const dataView = useAlertingEpisodesDataView({ services });

  const queryKey = [
    'security-alert-episodes',
    spaceId,
    pageSize,
    filterState,
    sortState,
    timeRange,
  ] as const;

  const query = useQuery({
    enabled: dataView != null && spaceId != null,
    queryKey,
    queryFn: ({ signal: abortSignal }) => {
      const esqlQuery = buildSecurityEpisodesQuery(sortState, spaceId!, filterState);

      const input: {
        type: 'kibana_context';
        esqlVariables: ESQLControlVariable[];
        timeRange?: TimeRange;
      } = {
        type: 'kibana_context',
        esqlVariables: [
          { key: PAGE_SIZE_ESQL_VARIABLE, value: pageSize, type: ESQLVariableType.VALUES },
        ],
      };

      if (timeRange) {
        input.timeRange = timeRange;
      }

      return executeEsqlQuery<SecurityAlertEpisode>({
        expressions: services.expressions,
        query: esqlQuery.print('basic'),
        input,
        abortSignal,
      });
    },
    keepPreviousData: true,
  });

  return { ...query, dataView };
};
