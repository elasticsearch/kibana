/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { MonitorFields, ProjectMonitor } from '../../../common/runtime_types';
import { ConfigKey, MonitorTypeEnum } from '../../../common/runtime_types';
import {
  getBrowserTimeoutWarningForMonitor,
  getBrowserTimeoutWarningsForProjectMonitors,
} from './monitor_warnings';

describe('monitor warnings', () => {
  describe('getBrowserTimeoutWarningForMonitor', () => {
    it('returns warning for browser monitor with timeout and only public locations', () => {
      const monitor = {
        [ConfigKey.MONITOR_TYPE]: MonitorTypeEnum.BROWSER,
        [ConfigKey.TIMEOUT]: '60',
        locations: [{ id: 'us-east', isServiceManaged: true }],
      } as MonitorFields;

      expect(getBrowserTimeoutWarningForMonitor(monitor, 'monitor-id')).toEqual({
        monitorId: 'monitor-id',
        message:
          'For browser monitors, timeout is only supported on private locations. Monitor monitor-id specifies a timeout and is running on public locations: us-east. The timeout will have no effect on these locations.',
        publicLocationIds: ['us-east'],
      });
    });

    it('returns null when browser monitor has no public locations', () => {
      const monitor = {
        [ConfigKey.MONITOR_TYPE]: MonitorTypeEnum.BROWSER,
        [ConfigKey.TIMEOUT]: '60',
        locations: [{ id: 'private-1', isServiceManaged: false }],
      } as MonitorFields;

      expect(getBrowserTimeoutWarningForMonitor(monitor, 'monitor-id')).toBeNull();
    });

    it('returns warning for api monitor with timeout and only public locations', () => {
      const monitor = {
        [ConfigKey.MONITOR_TYPE]: MonitorTypeEnum.API,
        [ConfigKey.TIMEOUT]: '60',
        locations: [{ id: 'us-east', isServiceManaged: true }],
      } as MonitorFields;

      expect(getBrowserTimeoutWarningForMonitor(monitor, 'monitor-id')).toEqual({
        monitorId: 'monitor-id',
        message:
          'For api monitors, timeout is only supported on private locations. Monitor monitor-id specifies a timeout and is running on public locations: us-east. The timeout will have no effect on these locations.',
        publicLocationIds: ['us-east'],
      });
    });

    it('returns null when timeout is not provided', () => {
      const monitor = {
        [ConfigKey.MONITOR_TYPE]: MonitorTypeEnum.BROWSER,
        locations: [{ id: 'us-east', isServiceManaged: true }],
      } as MonitorFields;

      expect(getBrowserTimeoutWarningForMonitor(monitor, 'monitor-id')).toBeNull();
    });

    it('returns null for non-browser monitors', () => {
      const monitor = {
        [ConfigKey.MONITOR_TYPE]: MonitorTypeEnum.HTTP,
        [ConfigKey.TIMEOUT]: '60',
        locations: [{ id: 'us-east', isServiceManaged: true }],
      } as MonitorFields;

      expect(getBrowserTimeoutWarningForMonitor(monitor, 'monitor-id')).toBeNull();
    });
  });

  describe('getBrowserTimeoutWarningsForProjectMonitors', () => {
    it('returns warning for browser project monitor with timeout and public locations', () => {
      const monitors = [
        {
          id: 'journey-1',
          type: MonitorTypeEnum.BROWSER,
          name: 'Browser monitor',
          schedule: '10',
          timeout: '60',
          privateLocations: ['private-1'],
          locations: ['public-1'],
        } as ProjectMonitor,
      ];

      expect(getBrowserTimeoutWarningsForProjectMonitors(monitors)).toEqual([
        {
          monitorId: 'journey-1',
          message:
            'For browser monitors, timeout is only supported on private locations. Monitor journey-1 specifies a timeout and is running on public locations: public-1. The timeout will have no effect on these locations.',
          publicLocationIds: ['public-1'],
        },
      ]);
    });

    it('returns warning for api project monitor with timeout and public locations', () => {
      const monitors = [
        {
          id: 'journey-1',
          type: MonitorTypeEnum.API,
          name: 'API monitor',
          schedule: '10',
          timeout: '60',
          privateLocations: ['private-1'],
          locations: ['public-1'],
        } as ProjectMonitor,
      ];

      expect(getBrowserTimeoutWarningsForProjectMonitors(monitors)).toEqual([
        {
          monitorId: 'journey-1',
          message:
            'For api monitors, timeout is only supported on private locations. Monitor journey-1 specifies a timeout and is running on public locations: public-1. The timeout will have no effect on these locations.',
          publicLocationIds: ['public-1'],
        },
      ]);
    });

    it('returns empty list when private locations are configured', () => {
      const monitors = [
        {
          id: 'journey-1',
          type: MonitorTypeEnum.BROWSER,
          name: 'Browser monitor',
          schedule: '10',
          timeout: '60',
          privateLocations: ['private-1'],
        } as ProjectMonitor,
      ];

      expect(getBrowserTimeoutWarningsForProjectMonitors(monitors)).toEqual([]);
    });
  });
});
