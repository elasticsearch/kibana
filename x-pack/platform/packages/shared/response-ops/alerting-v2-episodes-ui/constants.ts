/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import { i18n } from '@kbn/i18n';

export const EMPTY_VALUE = '—';
export const ALERT_EVENTS_DATA_STREAM = '.rule-events';
export const ALERT_ACTIONS_DATA_STREAM = '.alert-actions';
export const LAST_EPISODE_TIMESTAMP_ESQL_VARIABLE = 'lastEpisodeTimestamp';
export const PAGE_SIZE_ESQL_VARIABLE = 'pageSize';
export const RELATED_ALERT_EPISODES_PAGE_SIZE = 5;
/** Max episodes returned per list page (ESQL LIMIT) and max unique rules resolved in one batch. */
export const ALERT_EPISODES_LIST_PAGE_SIZE = 1000;
export const QUERY_STALE_TIME = 30_000;
export const TIME_FIELD = '@timestamp';
/**
 * Fields produced by buildEpisodesHistogramQuery that are valid as breakdown dimensions.
 * Passed as esqlColumns to UnifiedBreakdownFieldSelector to restrict the picker to only
 * fields the episode pipeline actually fetches.
 */
export const HISTOGRAM_BREAKDOWN_COLUMNS: DatatableColumn[] = [
  // Effective status takes into account any resolved action being applied to the episode
  {
    id: 'effective_status',
    name: i18n.translate('xpack.alertingV2.episodesUi.breakdownByStatus', {
      defaultMessage: 'Status',
    }),
    meta: { type: 'string' },
  },
  {
    id: 'rule.id',
    name: i18n.translate('xpack.alertingV2.episodesUi.breakdownByRule', { defaultMessage: 'Rule' }),
    meta: { type: 'string' },
  },
  {
    id: 'last_ack_action',
    name: i18n.translate('xpack.alertingV2.episodesUi.breakdownByAcknowledged', {
      defaultMessage: 'Acknowledged',
    }),
    meta: { type: 'string' },
  },
  {
    id: 'last_assignee_uid',
    name: i18n.translate('xpack.alertingV2.episodesUi.breakdownByAssignee', {
      defaultMessage: 'Assignee',
    }),
    meta: { type: 'string' },
  },
];
export const HISTOGRAM_EPISODE_LIMIT = 10_000;
export const DEFAULT_DATE_FORMAT = 'MMM D, YYYY @ HH:mm:ss.SSS';
export const FLYOUT_FOOTER_OFFSET = 80;

const ALERTING_V2_SECTION_ID = 'alertingV2';
const ALERTING_V2_RULES_APP_ID = 'rules';
const ALERTING_V2_EPISODES_APP_ID = 'episodes';

// Ideally, these should be computed using the `paths` factory of the alerting-v2-plugin, which
// shouldn't be imported in this package. Marking this for future improvement.
export const ALERTING_V2_RULES_BASE_PATH = `/app/management/${ALERTING_V2_SECTION_ID}/${ALERTING_V2_RULES_APP_ID}`;
export const ALERTING_V2_EPISODES_BASE_PATH = `/app/management/${ALERTING_V2_SECTION_ID}/${ALERTING_V2_EPISODES_APP_ID}`;

export const getAlertEpisodeDetailsPath = (episodeId: string) =>
  `${ALERTING_V2_EPISODES_BASE_PATH}/${encodeURIComponent(episodeId)}`;

export const getRuleDetailsPath = (ruleId: string) =>
  `${ALERTING_V2_RULES_BASE_PATH}/${encodeURIComponent(ruleId)}`;
