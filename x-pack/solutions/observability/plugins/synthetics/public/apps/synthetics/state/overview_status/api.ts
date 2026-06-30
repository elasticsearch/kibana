/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MonitorOverviewPageState } from '..';
import { SYNTHETICS_API_URLS } from '../../../../../common/constants';
import type {
  FetchMonitorOverviewQueryArgs,
  OverviewStaleStatus,
  OverviewStatus,
} from '../../../../../common/runtime_types';
import { OverviewStaleStatusCodec, OverviewStatusCodec } from '../../../../../common/runtime_types';
import { apiService } from '../../../../utils/api_service';

export function toStatusOverviewQueryArgs(
  pageState: MonitorOverviewPageState
): FetchMonitorOverviewQueryArgs {
  return {
    query: pageState.query,
    tags: pageState.tags,
    locations: pageState.locations,
    projects: pageState.projects,
    schedules: pageState.schedules,
    monitorTypes: pageState.monitorTypes,
    remoteNames: pageState.remoteNames,
    monitorQueryIds: pageState.monitorQueryIds,
    showFromAllSpaces: pageState.showFromAllSpaces,
    searchFields: [],
    useLogicalAndFor: pageState.useLogicalAndFor,
    // The overview always scopes status by the page-level date picker. The
    // server only acts on these when both are present, so embeddables/other
    // callers that leave them undefined keep the "current status" behavior.
    dateRangeStart: pageState.dateRangeStart,
    dateRangeEnd: pageState.dateRangeEnd,
  };
}

export const fetchOverviewStatus = async ({
  pageState,
  scopeStatusByLocation,
}: {
  pageState: MonitorOverviewPageState;
  scopeStatusByLocation?: boolean;
}): Promise<OverviewStatus> => {
  const params = toStatusOverviewQueryArgs(pageState);
  return apiService.get(
    SYNTHETICS_API_URLS.OVERVIEW_STATUS,
    { ...params, scopeStatusByLocation },
    OverviewStatusCodec
  );
};

/**
 * Resolve the last-known run *before* the overview window for the given pending
 * monitors, so the client can promote the genuinely stale ones from `pending`
 * to `stale`. Scoped to `monitorQueryIds` to keep the lookup cheap.
 */
export const fetchStaleStatus = async ({
  pageState,
  monitorQueryIds,
}: {
  pageState: MonitorOverviewPageState;
  monitorQueryIds: string[];
}): Promise<OverviewStaleStatus> => {
  const { monitorQueryIds: _ignoredMonitorQueryIds, ...params } =
    toStatusOverviewQueryArgs(pageState);
  return apiService.post(
    SYNTHETICS_API_URLS.OVERVIEW_STATUS_STALE,
    { monitorQueryIds },
    OverviewStaleStatusCodec,
    params
  );
};
