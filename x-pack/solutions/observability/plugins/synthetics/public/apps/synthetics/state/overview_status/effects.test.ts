/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { put, select } from 'redux-saga/effects';
import type { OverviewStatus, OverviewStatusMetaData } from '../../../../../common/runtime_types';
import { selectOverviewPageState } from '../overview/selectors';
import { augmentStaleStatusWorker } from './effects';
import { fetchOverviewStatusAction, fetchStaleStatusAction } from './actions';

const makeMeta = (
  overrides: Partial<OverviewStatusMetaData> & { configId: string }
): OverviewStatusMetaData =>
  ({
    monitorQueryId: overrides.configId,
    name: overrides.configId,
    schedule: '3',
    tags: [],
    isEnabled: true,
    type: 'http',
    isStatusAlertEnabled: false,
    overallStatus: 'pending',
    locations: [{ id: 'us_east', label: 'US East', status: 'pending' }],
    ...overrides,
  } as OverviewStatusMetaData);

const statusWithPending = (configIds: string[]) =>
  ({
    pendingConfigs: configIds.reduce<Record<string, OverviewStatusMetaData>>((acc, id) => {
      acc[id] = makeMeta({ configId: id });
      return acc;
    }, {}),
  } as unknown as OverviewStatus);

describe('augmentStaleStatusWorker', () => {
  const liveWindow = {
    dateRangeStart: 'now-24h',
    dateRangeEnd: 'now',
  } as any;

  // `createAsyncAction().get` stamps `meta.dispatchedAt: Date.now()`, so pin the
  // clock to keep the dispatched action equal to the one built in the assertion.
  beforeAll(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('dispatches a stale lookup for the unique pending monitor ids in a windowed view', () => {
    const action = fetchOverviewStatusAction.success(statusWithPending(['mon1', 'mon2']));
    const gen = augmentStaleStatusWorker(action);

    // First it reads the current page state...
    expect(gen.next().value).toEqual(select(selectOverviewPageState));
    // ...then dispatches the scoped stale lookup.
    expect(gen.next(liveWindow).value).toEqual(
      put(fetchStaleStatusAction.get({ pageState: liveWindow, monitorQueryIds: ['mon1', 'mon2'] }))
    );
    expect(gen.next().done).toBe(true);
  });

  it('does nothing when there are no pending monitors', () => {
    const action = fetchOverviewStatusAction.success(statusWithPending([]));
    const gen = augmentStaleStatusWorker(action);

    expect(gen.next().done).toBe(true);
  });

  it('does nothing when the overview has no date-range window', () => {
    const action = fetchOverviewStatusAction.success(statusWithPending(['mon1']));
    const gen = augmentStaleStatusWorker(action);

    expect(gen.next().value).toEqual(select(selectOverviewPageState));
    // No date range -> bail out without dispatching a lookup.
    expect(gen.next({} as any).done).toBe(true);
  });
});
