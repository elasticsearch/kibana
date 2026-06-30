/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  OverviewStatusMetaData,
  OverviewStatusState,
} from '../../../../../common/runtime_types';
import { getStatusByConfig, resolveDisplayStatus, selectOverviewStatus } from './selectors';
import type { SyntheticsAppState } from '../root_reducer';

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
    overallStatus: 'up',
    locations: [{ id: 'us_east', label: 'US East', status: 'up' }],
    ...overrides,
  } as OverviewStatusMetaData);

const makeStatus = (overrides: Partial<OverviewStatusState> = {}): OverviewStatusState =>
  ({
    allMonitorsCount: 0,
    disabledMonitorsCount: 0,
    projectMonitorsCount: 0,
    up: 0,
    down: 0,
    pending: 0,
    disabledCount: 0,
    enabledMonitorQueryIds: [],
    disabledMonitorQueryIds: [],
    allIds: [],
    upConfigs: {},
    downConfigs: {},
    pendingConfigs: {},
    disabledConfigs: {},
    ...overrides,
  } as OverviewStatusState);

describe('getStatusByConfig', () => {
  it('returns pending when status is null', () => {
    expect(getStatusByConfig('cfg1', null, 'loc1')).toBe('pending');
  });

  it('returns pending when status is undefined', () => {
    expect(getStatusByConfig('cfg1', undefined, 'loc1')).toBe('pending');
  });

  it('finds status by configId key in upConfigs', () => {
    const status = makeStatus({
      upConfigs: {
        cfg1: makeMeta({
          configId: 'cfg1',
          locations: [{ id: 'loc1', label: 'Loc 1', status: 'up' }],
        }),
      },
    });
    expect(getStatusByConfig('cfg1', status, 'loc1')).toBe('up');
  });

  it('finds status by configId key in downConfigs', () => {
    const status = makeStatus({
      downConfigs: {
        cfg1: makeMeta({
          configId: 'cfg1',
          overallStatus: 'down',
          locations: [{ id: 'loc1', label: 'Loc 1', status: 'down' }],
        }),
      },
    });
    expect(getStatusByConfig('cfg1', status, 'loc1')).toBe('down');
  });

  it('falls back to configId-locationId composite key', () => {
    const status = makeStatus({
      upConfigs: {
        'cfg1-loc2': makeMeta({
          configId: 'cfg1',
          locations: [{ id: 'loc2', label: 'Loc 2', status: 'up' }],
        }),
      },
    });
    expect(getStatusByConfig('cfg1', status, 'loc2')).toBe('up');
  });

  it('returns pending when location is not found in config', () => {
    const status = makeStatus({
      upConfigs: {
        cfg1: makeMeta({
          configId: 'cfg1',
          locations: [{ id: 'loc1', label: 'Loc 1', status: 'up' }],
        }),
      },
    });
    expect(getStatusByConfig('cfg1', status, 'loc_unknown')).toBe('pending');
  });

  it('returns pending when configId is not in any config map', () => {
    const status = makeStatus({
      upConfigs: {
        cfg1: makeMeta({ configId: 'cfg1' }),
      },
    });
    expect(getStatusByConfig('cfg_unknown', status, 'loc1')).toBe('pending');
  });

  it('finds status by configId key in pendingConfigs', () => {
    const status = makeStatus({
      pendingConfigs: {
        cfg1: makeMeta({
          configId: 'cfg1',
          overallStatus: 'pending',
          locations: [{ id: 'loc1', label: 'Loc 1', status: 'pending' }],
        }),
      },
    });
    expect(getStatusByConfig('cfg1', status, 'loc1')).toBe('pending');
  });

  it('finds status by configId key in disabledConfigs', () => {
    const status = makeStatus({
      disabledConfigs: {
        cfg1: makeMeta({
          configId: 'cfg1',
          isEnabled: false,
          overallStatus: 'disabled',
          locations: [{ id: 'loc1', label: 'Loc 1', status: 'disabled' }],
        }),
      },
    });
    expect(getStatusByConfig('cfg1', status, 'loc1')).toBe('disabled');
  });

  it('falls back to composite key in pendingConfigs', () => {
    const status = makeStatus({
      pendingConfigs: {
        'cfg1-loc2': makeMeta({
          configId: 'cfg1',
          overallStatus: 'pending',
          locations: [{ id: 'loc2', label: 'Loc 2', status: 'pending' }],
        }),
      },
    });
    expect(getStatusByConfig('cfg1', status, 'loc2')).toBe('pending');
  });

  it('falls back to composite key in disabledConfigs', () => {
    const status = makeStatus({
      disabledConfigs: {
        'cfg1-loc2': makeMeta({
          configId: 'cfg1',
          isEnabled: false,
          overallStatus: 'disabled',
          locations: [{ id: 'loc2', label: 'Loc 2', status: 'disabled' }],
        }),
      },
    });
    expect(getStatusByConfig('cfg1', status, 'loc2')).toBe('disabled');
  });
});

describe('selectOverviewStatus', () => {
  const multiLocMonitor = makeMeta({
    configId: 'multi',
    overallStatus: 'down',
    locations: [
      { id: 'loc1', label: 'Loc 1', status: 'down' },
      { id: 'loc2', label: 'Loc 2', status: 'up' },
    ],
  });

  const singleLocMonitor = makeMeta({
    configId: 'single',
    overallStatus: 'up',
    locations: [{ id: 'loc1', label: 'Loc 1', status: 'up' }],
  });

  const buildState = (
    groupByField: string
  ): Pick<SyntheticsAppState, 'overviewStatus' | 'overview'> => ({
    overviewStatus: {
      loading: false,
      loaded: true,
      error: null,
      isInitialLoad: false,
      status: makeStatus({
        downConfigs: { multi: multiLocMonitor },
        upConfigs: { single: singleLocMonitor },
      }),
    },
    overview: {
      groupBy: { field: groupByField, order: 'asc' },
    } as any,
  });

  it('returns raw status when groupBy is "monitor" with per-monitor counts', () => {
    const state = buildState('monitor');
    const result = selectOverviewStatus(state as SyntheticsAppState);
    expect(result.status?.downConfigs).toHaveProperty('multi');
    expect(result.status?.downConfigs.multi.locations).toHaveLength(2);
    expect(result.status?.up).toBe(1);
    expect(result.status?.down).toBe(1);
  });

  it('separates multi-location monitors into per-location entries placed in the bucket matching each location status', () => {
    const state = buildState('none');
    const result = selectOverviewStatus(state as SyntheticsAppState);

    // The down-located entry stays in downConfigs.
    expect(result.status?.downConfigs).not.toHaveProperty('multi');
    expect(result.status?.downConfigs).toHaveProperty('multi-loc1');
    expect(result.status?.downConfigs['multi-loc1'].locations).toHaveLength(1);
    expect(result.status?.downConfigs['multi-loc1'].locations[0].id).toBe('loc1');
    expect(result.status?.downConfigs['multi-loc1'].overallStatus).toBe('down');

    // The up-located entry moves into upConfigs (previously stayed in downConfigs).
    expect(result.status?.downConfigs).not.toHaveProperty('multi-loc2');
    expect(result.status?.upConfigs).toHaveProperty('multi-loc2');
    expect(result.status?.upConfigs['multi-loc2'].locations).toHaveLength(1);
    expect(result.status?.upConfigs['multi-loc2'].locations[0].id).toBe('loc2');
    expect(result.status?.upConfigs['multi-loc2'].overallStatus).toBe('up');

    // Counts are derived from bucket sizes: 2 up entries (single + multi-loc2), 1 down entry (multi-loc1)
    expect(result.status?.up).toBe(2);
    expect(result.status?.down).toBe(1);
  });

  it('redistributes pending locations of a down monitor into pendingConfigs', () => {
    const downWithPendingLocs = makeMeta({
      configId: 'mixed',
      overallStatus: 'down',
      locations: [
        { id: 'loc1', label: 'Loc 1', status: 'down' },
        { id: 'loc2', label: 'Loc 2', status: 'pending' },
        { id: 'loc3', label: 'Loc 3', status: 'pending' },
      ],
    });
    const state = {
      overviewStatus: {
        loading: false,
        loaded: true,
        error: null,
        isInitialLoad: false,
        status: makeStatus({ downConfigs: { mixed: downWithPendingLocs } }),
      },
      overview: { groupBy: { field: 'none', order: 'asc' } } as any,
    };
    const result = selectOverviewStatus(state as SyntheticsAppState);

    expect(Object.keys(result.status?.downConfigs ?? {})).toEqual(['mixed-loc1']);
    expect(Object.keys(result.status?.pendingConfigs ?? {})).toEqual(['mixed-loc2', 'mixed-loc3']);
    expect(result.status?.upConfigs).toEqual({});
    expect(result.status?.down).toBe(1);
    expect(result.status?.pending).toBe(2);
    expect(result.status?.up).toBe(0);
  });

  it('keeps single-location monitors as-is regardless of groupBy', () => {
    const state = buildState('none');
    const result = selectOverviewStatus(state as SyntheticsAppState);

    expect(result.status?.upConfigs).toHaveProperty('single');
    expect(result.status?.upConfigs.single.locations).toHaveLength(1);
  });

  it('returns unmodified overviewStatus when status is null', () => {
    const state = {
      overviewStatus: {
        loading: false,
        loaded: false,
        error: null,
        isInitialLoad: true,
        status: null,
      },
      overview: {
        groupBy: { field: 'none', order: 'asc' },
      } as any,
    };
    const result = selectOverviewStatus(state as SyntheticsAppState);
    expect(result.status).toBeNull();
  });
});

describe('resolveDisplayStatus', () => {
  it('returns overallStatus unchanged when the toggle is off', () => {
    const monitor = makeMeta({
      configId: 'stale',
      overallStatus: 'stale',
      locations: [{ id: 'loc1', label: 'Loc 1', status: 'stale', lastStatus: 'up' }],
    });
    expect(resolveDisplayStatus(monitor, false)).toBe('stale');
  });

  it('returns overallStatus unchanged for non-stale monitors even when toggle is on', () => {
    const monitor = makeMeta({
      configId: 'up',
      overallStatus: 'up',
      locations: [{ id: 'loc1', label: 'Loc 1', status: 'up' }],
    });
    expect(resolveDisplayStatus(monitor, true)).toBe('up');
  });

  it('surfaces an "up" last run when the toggle is on', () => {
    const monitor = makeMeta({
      configId: 'stale',
      overallStatus: 'stale',
      locations: [{ id: 'loc1', label: 'Loc 1', status: 'stale', lastStatus: 'up' }],
    });
    expect(resolveDisplayStatus(monitor, true)).toBe('up');
  });

  it('surfaces a "down" last run when any location was last down', () => {
    const monitor = makeMeta({
      configId: 'stale',
      overallStatus: 'stale',
      locations: [
        { id: 'loc1', label: 'Loc 1', status: 'stale', lastStatus: 'up' },
        { id: 'loc2', label: 'Loc 2', status: 'stale', lastStatus: 'down' },
      ],
    });
    expect(resolveDisplayStatus(monitor, true)).toBe('down');
  });

  it('stays stale when no last status was carried', () => {
    const monitor = makeMeta({
      configId: 'stale',
      overallStatus: 'stale',
      locations: [{ id: 'loc1', label: 'Loc 1', status: 'stale' }],
    });
    expect(resolveDisplayStatus(monitor, true)).toBe('stale');
  });
});
