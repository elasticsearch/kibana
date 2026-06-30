/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import type {
  OverviewStalePriorRun,
  OverviewStatus,
  OverviewStatusMetaData,
} from '../../../../../common/runtime_types';
import { overviewStatusReducer } from '.';
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

const makeStatus = (overrides: Partial<OverviewStatus> = {}): OverviewStatus =>
  ({
    allMonitorsCount: 0,
    disabledMonitorsCount: 0,
    projectMonitorsCount: 0,
    up: 0,
    down: 0,
    pending: 0,
    stale: 0,
    disabledCount: 0,
    enabledMonitorQueryIds: [],
    disabledMonitorQueryIds: [],
    allIds: [],
    upConfigs: {},
    downConfigs: {},
    pendingConfigs: {},
    staleConfigs: {},
    disabledConfigs: {},
    ...overrides,
  } as OverviewStatus);

// `isRunStale` uses a 15-minute floor, so a run hours old is reliably stale and
// a run minutes old is reliably fresh — no need to freeze the clock.
const stalePriorRun = (
  overrides: Partial<OverviewStalePriorRun> & { monitorQueryId: string }
): OverviewStalePriorRun => ({
  locationId: 'us_east',
  timestamp: moment().subtract(3, 'hours').toISOString(),
  status: 'up',
  ...overrides,
});

const freshPriorRun = (
  overrides: Partial<OverviewStalePriorRun> & { monitorQueryId: string }
): OverviewStalePriorRun => ({
  locationId: 'us_east',
  timestamp: moment().subtract(2, 'minutes').toISOString(),
  status: 'up',
  ...overrides,
});

describe('overviewStatusReducer', () => {
  describe('fetchStaleStatusAction.success (pending -> stale promotion)', () => {
    const loadedState = () =>
      overviewStatusReducer(
        undefined,
        fetchOverviewStatusAction.success(
          makeStatus({
            pendingConfigs: {
              mon1: makeMeta({ configId: 'mon1' }),
              mon2: makeMeta({ configId: 'mon2' }),
            },
          })
        )
      );

    it('promotes a monitor whose prior run is old enough to be stale', () => {
      const initial = loadedState();
      expect(initial.allConfigs).toHaveLength(2);

      const next = overviewStatusReducer(
        initial,
        fetchStaleStatusAction.success({ priorRuns: [stalePriorRun({ monitorQueryId: 'mon1' })] })
      );

      expect(next.status?.pendingConfigs.mon1).toBeUndefined();
      const promoted = next.status?.staleConfigs.mon1;
      expect(promoted?.overallStatus).toBe('stale');
      expect(promoted?.locations[0].status).toBe('stale');
      // carries the last-known status so the "show last run" view can render it
      expect(promoted?.locations[0].lastStatus).toBe('up');
      // monitors with no prior run stay pending
      expect(next.status?.pendingConfigs.mon2).toBeDefined();
    });

    it('keeps a monitor pending when its prior run is still fresh', () => {
      const initial = loadedState();

      const next = overviewStatusReducer(
        initial,
        fetchStaleStatusAction.success({ priorRuns: [freshPriorRun({ monitorQueryId: 'mon1' })] })
      );

      expect(next.status?.pendingConfigs.mon1).toBeDefined();
      expect(next.status?.staleConfigs.mon1).toBeUndefined();
    });

    it('rebuilds allConfigs so consumers see the promoted (stale) metadata', () => {
      const initial = loadedState();

      const next = overviewStatusReducer(
        initial,
        fetchStaleStatusAction.success({
          priorRuns: [stalePriorRun({ monitorQueryId: 'mon1', status: 'down' })],
        })
      );

      const promoted = next.allConfigs?.find((config) => config.configId === 'mon1');
      expect(promoted?.overallStatus).toBe('stale');
      expect(promoted?.locations[0].lastStatus).toBe('down');
      expect(next.allConfigs).toHaveLength(2);
    });

    it('is a no-op when no prior runs are returned', () => {
      const initial = loadedState();
      const next = overviewStatusReducer(
        initial,
        fetchStaleStatusAction.success({ priorRuns: [] })
      );

      expect(next.status?.pendingConfigs.mon1).toBeDefined();
      expect(next.status?.pendingConfigs.mon2).toBeDefined();
      expect(next.status?.staleConfigs).toEqual({});
    });

    it('is a no-op when the overview status has not loaded yet', () => {
      const next = overviewStatusReducer(
        undefined,
        fetchStaleStatusAction.success({ priorRuns: [stalePriorRun({ monitorQueryId: 'mon1' })] })
      );

      expect(next.status).toBeNull();
    });
  });

  describe('re-applying the promotion across a background refresh', () => {
    const promotedState = () => {
      const loaded = overviewStatusReducer(
        undefined,
        fetchOverviewStatusAction.success(
          makeStatus({ pendingConfigs: { mon1: makeMeta({ configId: 'mon1' }) } })
        )
      );
      return overviewStatusReducer(
        loaded,
        fetchStaleStatusAction.success({ priorRuns: [stalePriorRun({ monitorQueryId: 'mon1' })] })
      );
    };

    it('keeps the monitor stale on the next overview load without re-fetching (no flicker)', () => {
      const promoted = promotedState();
      expect(promoted.status?.staleConfigs.mon1).toBeDefined();

      // A background refresh replaces `status` wholesale — mon1 comes back as
      // pending in the raw payload, but the stored prior-run facts re-promote it
      // within the same reducer pass.
      const refreshed = overviewStatusReducer(
        promoted,
        fetchOverviewStatusAction.success(
          makeStatus({ pendingConfigs: { mon1: makeMeta({ configId: 'mon1' }) } })
        )
      );

      expect(refreshed.status?.pendingConfigs.mon1).toBeUndefined();
      expect(refreshed.status?.staleConfigs.mon1?.overallStatus).toBe('stale');
    });

    it('does not re-promote a monitor that started reporting again', () => {
      const promoted = promotedState();

      // mon1 now has in-window data again → arrives as `up`, not pending.
      const refreshed = overviewStatusReducer(
        promoted,
        fetchOverviewStatusAction.success(
          makeStatus({
            upConfigs: {
              mon1: makeMeta({
                configId: 'mon1',
                overallStatus: 'up',
                locations: [{ id: 'us_east', label: 'US East', status: 'up' }],
              }),
            },
          })
        )
      );

      expect(refreshed.status?.upConfigs.mon1?.overallStatus).toBe('up');
      expect(refreshed.status?.staleConfigs.mon1).toBeUndefined();
      expect(refreshed.status?.pendingConfigs.mon1).toBeUndefined();
    });
  });

  describe('multi-location promotion', () => {
    it('promotes only the locations whose prior run is stale and orders them first', () => {
      const loaded = overviewStatusReducer(
        undefined,
        fetchOverviewStatusAction.success(
          makeStatus({
            pendingConfigs: {
              mon1: makeMeta({
                configId: 'mon1',
                locations: [
                  { id: 'us_east', label: 'US East', status: 'pending' },
                  { id: 'eu_west', label: 'EU West', status: 'pending' },
                ],
              }),
            },
          })
        )
      );

      const next = overviewStatusReducer(
        loaded,
        fetchStaleStatusAction.success({
          priorRuns: [stalePriorRun({ monitorQueryId: 'mon1', locationId: 'us_east' })],
          // eu_west has no prior run → stays pending
        })
      );

      const promoted = next.status?.staleConfigs.mon1;
      expect(promoted?.overallStatus).toBe('stale');
      const us = promoted?.locations.find((loc) => loc.id === 'us_east');
      const eu = promoted?.locations.find((loc) => loc.id === 'eu_west');
      expect(us?.status).toBe('stale');
      expect(eu?.status).toBe('pending');
      // stale locations are ordered before still-pending ones
      expect(promoted?.locations[0].id).toBe('us_east');
      expect(promoted?.locations[promoted.locations.length - 1].id).toBe('eu_west');
    });
  });
});
