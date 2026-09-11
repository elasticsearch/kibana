/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core-http-browser';
import type {
  BulkAckEpisodeActionItem,
  BulkActivateEpisodeActionItem,
  BulkAssignEpisodeActionItem,
  BulkDeactivateEpisodeActionItem,
  BulkResponse,
  BulkSnoozeSeriesActionItem,
  BulkTagSeriesActionItem,
  BulkUnackEpisodeActionItem,
  BulkUnsnoozeSeriesActionItem,
} from '@kbn/alerting-v2-schemas';
import {
  ALERTING_V2_EPISODES_API_PATH,
  ALERTING_V2_SERIES_API_PATH,
} from '@kbn/alerting-v2-constants';

const postBulkAction = <TItem>(
  http: HttpStart,
  path: string,
  items: TItem[]
): Promise<BulkResponse> => http.post<BulkResponse>(path, { body: JSON.stringify({ items }) });

export const bulkTagSeriesActions = (
  http: HttpStart,
  items: BulkTagSeriesActionItem[]
): Promise<BulkResponse> => postBulkAction(http, `${ALERTING_V2_SERIES_API_PATH}/_bulk_tag`, items);

export const bulkSnoozeSeriesActions = (
  http: HttpStart,
  items: BulkSnoozeSeriesActionItem[]
): Promise<BulkResponse> =>
  postBulkAction(http, `${ALERTING_V2_SERIES_API_PATH}/_bulk_snooze`, items);

export const bulkUnsnoozeSeriesActions = (
  http: HttpStart,
  items: BulkUnsnoozeSeriesActionItem[]
): Promise<BulkResponse> =>
  postBulkAction(http, `${ALERTING_V2_SERIES_API_PATH}/_bulk_unsnooze`, items);

export const bulkAckEpisodeActions = (
  http: HttpStart,
  items: BulkAckEpisodeActionItem[]
): Promise<BulkResponse> =>
  postBulkAction(http, `${ALERTING_V2_EPISODES_API_PATH}/_bulk_ack`, items);

export const bulkUnackEpisodeActions = (
  http: HttpStart,
  items: BulkUnackEpisodeActionItem[]
): Promise<BulkResponse> =>
  postBulkAction(http, `${ALERTING_V2_EPISODES_API_PATH}/_bulk_unack`, items);

export const bulkAssignEpisodeActions = (
  http: HttpStart,
  items: BulkAssignEpisodeActionItem[]
): Promise<BulkResponse> =>
  postBulkAction(http, `${ALERTING_V2_EPISODES_API_PATH}/_bulk_assign`, items);

export const bulkActivateEpisodeActions = (
  http: HttpStart,
  items: BulkActivateEpisodeActionItem[]
): Promise<BulkResponse> =>
  postBulkAction(http, `${ALERTING_V2_EPISODES_API_PATH}/_bulk_activate`, items);

export const bulkDeactivateEpisodeActions = (
  http: HttpStart,
  items: BulkDeactivateEpisodeActionItem[]
): Promise<BulkResponse> =>
  postBulkAction(http, `${ALERTING_V2_EPISODES_API_PATH}/_bulk_deactivate`, items);
