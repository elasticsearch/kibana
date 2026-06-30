/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createReducer } from '@reduxjs/toolkit';

import type {
  OverviewStalePriorRun,
  OverviewStatusMetaData,
  OverviewStatusState,
} from '../../../../../common/runtime_types';
import { MONITOR_STATUS_ENUM } from '../../../../../common/constants/monitor_management';
import { isRunStale } from '../../../../../common/lib';
import type { IHttpSerializedFetchError } from '..';
import {
  clearOverviewStatusErrorAction,
  fetchOverviewStatusAction,
  fetchStaleStatusAction,
  quietFetchOverviewStatusAction,
  initialLoadReported,
} from './actions';

export interface OverviewStatusStateReducer {
  loading: boolean;
  loaded: boolean;
  status: OverviewStatusState | null;
  allConfigs?: OverviewStatusMetaData[];
  disabledConfigs?: OverviewStatusMetaData[];
  // Raw "latest run before the window" facts from the supplementary stale lookup,
  // kept so the promotion can be re-applied on every overview load. A background
  // refresh replaces `status` wholesale (momentarily moving these monitors back
  // to `pending`); re-applying here within the same reducer keeps them `stale`
  // instead of flickering grey→amber until the lookup re-resolves.
  staleBeforeWindowRuns?: OverviewStalePriorRun[];
  error: IHttpSerializedFetchError | null;
  isInitialLoad: boolean;
}

const initialState: OverviewStatusStateReducer = {
  loading: false,
  loaded: false,
  status: null,
  error: null,
  isInitialLoad: true,
};

const buildAllConfigs = (status: OverviewStatusState): OverviewStatusMetaData[] =>
  Object.values({
    ...status.upConfigs,
    ...status.downConfigs,
    ...status.pendingConfigs,
    ...status.staleConfigs,
    ...status.disabledConfigs,
  });

/**
 * Promote `pending` monitors whose last-known run happened *before* the overview
 * window and is old enough to be stale. Sources the prior-run facts resolved by
 * the supplementary lookup ({@link OverviewStatusStateReducer.staleBeforeWindowRuns})
 * and rebuilds the metadata from the monitor's current `pending` config, so the
 * promotion can be re-applied verbatim after a background refresh without a
 * second round-trip. Only monitors still classified `pending` are touched — ones
 * that started reporting again keep their fresh up/down status.
 */
const applyStaleBeforeWindow = (state: OverviewStatusStateReducer) => {
  const { status, staleBeforeWindowRuns } = state;
  if (!status || !staleBeforeWindowRuns?.length) {
    return;
  }

  const runsByMonitor = new Map<string, Map<string, OverviewStalePriorRun>>();
  for (const run of staleBeforeWindowRuns) {
    let byLocation = runsByMonitor.get(run.monitorQueryId);
    if (!byLocation) {
      byLocation = new Map();
      runsByMonitor.set(run.monitorQueryId, byLocation);
    }
    byLocation.set(run.locationId, run);
  }

  let changed = false;
  // `Object.entries` snapshots the keys, so deleting promoted entries from
  // `pendingConfigs` during the loop is safe.
  for (const [configId, meta] of Object.entries(status.pendingConfigs)) {
    const byLocation = runsByMonitor.get(meta.monitorQueryId);
    if (!byLocation) {
      continue;
    }

    const scheduleMinutes = Number(meta.schedule) || 0;
    let hasStale = false;
    let latestTimestamp: string | undefined;

    const locations = meta.locations.map((location) => {
      const run = byLocation.get(location.id);
      if (run && isRunStale(run.timestamp, scheduleMinutes)) {
        hasStale = true;
        if (!latestTimestamp || Date.parse(run.timestamp) > Date.parse(latestTimestamp)) {
          latestTimestamp = run.timestamp;
        }
        return { ...location, status: MONITOR_STATUS_ENUM.STALE, lastStatus: run.status };
      }
      return { ...location, status: MONITOR_STATUS_ENUM.PENDING };
    });

    if (!hasStale) {
      continue;
    }

    // Stale (stopped-reporting) locations first, any still-pending ones last.
    locations.sort((a, b) => {
      if (a.status === b.status) {
        return 0;
      }
      return a.status === MONITOR_STATUS_ENUM.PENDING ? 1 : -1;
    });

    status.staleConfigs[configId] = {
      ...meta,
      overallStatus: MONITOR_STATUS_ENUM.STALE,
      timestamp: latestTimestamp,
      locations,
    };
    delete status.pendingConfigs[configId];
    changed = true;
  }

  if (changed) {
    state.allConfigs = buildAllConfigs(status);
  }
};

export const overviewStatusReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(fetchOverviewStatusAction.get, (state, action) => {
      state.status = null;
      state.loading = true;
    })
    .addCase(quietFetchOverviewStatusAction.get, (_state) => {
      // intentionally no loading state for quiet/background refreshes
    })
    .addCase(fetchOverviewStatusAction.success, (state, action) => {
      state.status = action.payload;

      state.allConfigs = buildAllConfigs(state.status);
      state.disabledConfigs = state.allConfigs.filter((monitor) => !monitor.isEnabled);
      state.loaded = true;
      state.loading = false;
      // Re-apply any resolved stale-before-window promotions so a background
      // refresh (which just replaced `status`) doesn't flicker them back to
      // `pending` until the supplementary lookup re-resolves.
      applyStaleBeforeWindow(state);
    })
    .addCase(fetchOverviewStatusAction.fail, (state, action) => {
      state.error = action.payload;
      state.loading = false;
    })
    .addCase(fetchStaleStatusAction.success, (state, action) => {
      // Store the latest prior-run facts and promote the genuinely stale
      // monitors. Keeping the raw facts (rather than the derived metadata) lets
      // the same promotion be replayed on the next overview refresh. Counts are
      // recomputed by `selectOverviewStatus`; `applyStaleBeforeWindow` rebuilds
      // `allConfigs` when anything is promoted.
      state.staleBeforeWindowRuns = action.payload.priorRuns;
      applyStaleBeforeWindow(state);
    })
    .addCase(clearOverviewStatusErrorAction, (state) => {
      state.error = null;
    })
    .addCase(initialLoadReported, (state) => {
      state.isInitialLoad = false;
    });
});

export * from './actions';
export * from './effects';
export * from './selectors';
