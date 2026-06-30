/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { put, select, takeLatest } from 'redux-saga/effects';
import { uniq } from 'lodash';
import type { MonitorOverviewPageState } from '..';
import type { OverviewStatus } from '../../../../../common/runtime_types';
import { selectOverviewPageState } from '../overview/selectors';
import { fetchEffectFactory } from '../utils/fetch_effect';
import {
  fetchOverviewStatusAction,
  fetchStaleStatusAction,
  quietFetchOverviewStatusAction,
} from './actions';
import { fetchOverviewStatus, fetchStaleStatus } from './api';

export function* fetchOverviewStatusEffect() {
  yield takeLatest(
    [fetchOverviewStatusAction.get, quietFetchOverviewStatusAction.get],
    fetchEffectFactory(
      fetchOverviewStatus,
      fetchOverviewStatusAction.success,
      fetchOverviewStatusAction.fail
    ) as ReturnType<typeof fetchEffectFactory>
  );
}

export function* fetchStaleStatusEffect() {
  yield takeLatest(
    fetchStaleStatusAction.get,
    fetchEffectFactory(
      fetchStaleStatus,
      fetchStaleStatusAction.success,
      fetchStaleStatusAction.fail
    ) as ReturnType<typeof fetchEffectFactory>
  );
}

/**
 * Worker that, given a completed overview status load, probes any `pending`
 * monitors for a last-known run *before* the window so genuinely stale monitors
 * (those that stopped reporting before the window started) can be promoted from
 * `pending` to `stale`. It only fires for the windowed overview — without a date
 * range there's no "before the window" to look back at.
 */
export function* augmentStaleStatusWorker(
  action: ReturnType<typeof fetchOverviewStatusAction.success>
) {
  const status = action.payload as OverviewStatus;
  const pendingConfigs = status?.pendingConfigs ?? {};
  const monitorQueryIds = uniq(
    Object.values(pendingConfigs).map((config) => config.monitorQueryId)
  ).filter(Boolean);
  if (monitorQueryIds.length === 0) {
    return;
  }

  const pageState: MonitorOverviewPageState = yield select(selectOverviewPageState);
  if (!pageState?.dateRangeStart || !pageState?.dateRangeEnd) {
    return;
  }

  yield put(fetchStaleStatusAction.get({ pageState, monitorQueryIds }));
}

/**
 * After each overview status load, run {@link augmentStaleStatusWorker}. Kept off
 * the main overview request so the page renders fast — the stale promotion lands
 * as a follow-up update once the supplementary lookup resolves.
 */
export function* augmentStaleStatusEffect() {
  yield takeLatest(fetchOverviewStatusAction.success, augmentStaleStatusWorker);
}
