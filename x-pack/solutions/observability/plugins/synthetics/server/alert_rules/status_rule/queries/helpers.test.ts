/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { AlertStatusConfigs } from '../../../../common/runtime_types/alert_rules/common';
import { calculateIsValidPing, getPendingConfigs, applyPendingCounts } from './helpers';

describe('helpers', () => {
  describe('getPendingConfigs', () => {
    const logger = loggerMock.create();

    const makeMonitorSO = (
      soId: string,
      monitorQueryId: string,
      name: string,
      locationIds: string[] = ['loc-1']
    ) => ({
      id: soId,
      type: 'synthetics-monitor' as const,
      score: 1,
      attributes: {
        id: monitorQueryId,
        name,
        type: 'http',
        config_id: soId,
        locations: locationIds.map((id) => ({ id, label: `Label ${id}` })),
        tags: [],
        labels: {},
      },
      created_at: '2020-01-01T00:00:00.000Z',
      references: [],
    });

    it('uses configId (SO UUID) for keys, not monitorQueryId, for project monitors', () => {
      const soId = 'so-uuid-123';
      const journeyId = 'my-project-my-monitor';
      const locationId = 'us-east';

      const monitors = [makeMonitorSO(soId, journeyId, 'Project Mon', [locationId])];

      const downConfigs = {
        [`${soId}-${locationId}`]: {
          configId: soId,
          monitorQueryId: journeyId,
          locationId,
          status: 'down',
          timestamp: '2025-01-01T00:00:00.000Z',
          latestPing: {},
          checks: { downWithinXChecks: 1, down: 1 },
        },
      } as unknown as AlertStatusConfigs;

      const result = getPendingConfigs({
        monitorQueryIds: [journeyId],
        monitorLocationIds: [locationId],
        upConfigs: {},
        downConfigs,
        monitorsData: {
          [journeyId]: { scheduleInMs: 60000, locations: [locationId], type: 'http' },
        },
        monitors: monitors as any,
        logger,
      });

      // Should NOT be pending because down config with SO-UUID key exists
      expect(result).toEqual({});
    });

    it('creates pending config with SO UUID as configId for project monitors', () => {
      const soId = 'so-uuid-456';
      const journeyId = 'my-project-monitor-2';
      const locationId = 'us-west';

      const monitors = [makeMonitorSO(soId, journeyId, 'Project Mon 2', [locationId])];

      const result = getPendingConfigs({
        monitorQueryIds: [journeyId],
        monitorLocationIds: [locationId],
        upConfigs: {},
        downConfigs: {},
        monitorsData: {
          [journeyId]: { scheduleInMs: 60000, locations: [locationId], type: 'http' },
        },
        monitors: monitors as any,
        logger,
      });

      // Key should use SO UUID, not journey ID
      expect(result[`${soId}-${locationId}`]).toBeDefined();
      expect(result[`${journeyId}-${locationId}`]).toBeUndefined();
      expect(result[`${soId}-${locationId}`].configId).toBe(soId);
      expect(result[`${soId}-${locationId}`].monitorQueryId).toBe(journeyId);
    });

    it('works correctly for regular monitors where configId === monitorQueryId', () => {
      const monitorId = 'regular-monitor-id';
      const locationId = 'eu-west';

      const monitors = [makeMonitorSO(monitorId, monitorId, 'Regular Mon', [locationId])];

      const result = getPendingConfigs({
        monitorQueryIds: [monitorId],
        monitorLocationIds: [locationId],
        upConfigs: {},
        downConfigs: {},
        monitorsData: {
          [monitorId]: { scheduleInMs: 60000, locations: [locationId], type: 'http' },
        },
        monitors: monitors as any,
        logger,
      });

      expect(result[`${monitorId}-${locationId}`]).toBeDefined();
      expect(result[`${monitorId}-${locationId}`].configId).toBe(monitorId);
    });
  });

  describe('applyPendingCounts', () => {
    const pendingConfig = {
      status: 'pending',
      configId: 'mon-1',
      monitorQueryId: 'mon-1',
      locationId: 'loc-1',
      monitorInfo: {
        monitor: { name: 'Mon 1', id: 'mon-1', type: 'http' },
        observer: { geo: { name: 'Loc 1' } },
        tags: [],
      },
    };

    it('starts the count at 1 for a newly pending location', () => {
      const result = applyPendingCounts({ 'mon-1-loc-1': pendingConfig }, {});
      expect(result['mon-1-loc-1'].pendingCount).toBe(1);
    });

    it('increments consecutive pending evaluations', () => {
      const result = applyPendingCounts(
        { 'mon-1-loc-1': pendingConfig },
        { 'mon-1-loc-1': { ...pendingConfig, pendingCount: 2 } }
      );
      expect(result['mon-1-loc-1'].pendingCount).toBe(3);
    });

    it('treats persisted state without pendingCount as 1 prior evaluation', () => {
      const result = applyPendingCounts(
        { 'mon-1-loc-1': pendingConfig },
        { 'mon-1-loc-1': pendingConfig }
      );
      expect(result['mon-1-loc-1'].pendingCount).toBe(2);
    });

    it('resets the count when a location leaves pending and returns later', () => {
      const first = applyPendingCounts({ 'mon-1-loc-1': pendingConfig }, {});
      expect(first['mon-1-loc-1'].pendingCount).toBe(1);

      const afterUp = applyPendingCounts({}, first);
      expect(afterUp).toEqual({});

      const secondPending = applyPendingCounts({ 'mon-1-loc-1': pendingConfig }, afterUp);
      expect(secondPending['mon-1-loc-1'].pendingCount).toBe(1);
    });
  });

  describe('calculateIsValidPing', () => {
    // Store the original Date implementation
    const originalDate = global.Date;

    // Mock the current time to be fixed for tests
    const mockCurrentTime = new Date('2025-06-09T10:00:00.000Z').getTime();

    beforeEach(() => {
      // Mock Date to return fixed time for Date.now() and new Date()
      global.Date = class extends Date {
        constructor(...args: Parameters<typeof Date>) {
          if (args.length === 0) {
            super(mockCurrentTime);
          } else {
            super(...args);
          }
        }

        static now() {
          return mockCurrentTime;
        }
      } as any;
    });

    afterEach(() => {
      // Restore original Date implementation
      global.Date = originalDate;
    });

    it('should return true when ping is within schedule + default buffer for a 5m monitor', () => {
      // 5m schedule → default buffer = max(60s, 5m * 0.5) = 2m30s. Total allowed = 7m30s.
      const twoMinutesAgo = new Date(mockCurrentTime - 2 * 60 * 1000).toISOString();

      const result = calculateIsValidPing({
        previousRunEndTimeISO: twoMinutesAgo,
        scheduleInMs: 5 * 60 * 1000,
      });

      expect(result).toBe(true);
    });

    it('should return false when ping exceeds schedule + default buffer for a 5m monitor', () => {
      // 5m schedule → default buffer = 2m30s. Total allowed = 7m30s.
      // 8 minutes > 7m30s, so ping is stale.
      const eightMinutesAgo = new Date(mockCurrentTime - 8 * 60 * 1000).toISOString();

      const result = calculateIsValidPing({
        previousRunEndTimeISO: eightMinutesAgo,
        scheduleInMs: 5 * 60 * 1000,
      });

      expect(result).toBe(false);
    });

    it('should respect explicit stalenessBufferMs override', () => {
      // Ping was 7 minutes ago, schedule is 5 minutes, custom buffer is 3 minutes.
      // Total allowed: 5 + 3 = 8 minutes. 7 < 8, so ping is valid.
      const sevenMinutesAgo = new Date(mockCurrentTime - 7 * 60 * 1000).toISOString();

      const result = calculateIsValidPing({
        previousRunEndTimeISO: sevenMinutesAgo,
        scheduleInMs: 5 * 60 * 1000,
        stalenessBufferMs: 3 * 60 * 1000,
      });

      expect(result).toBe(true);
    });

    it('should handle very long previousRunDurationUs', () => {
      // 5m schedule + 6m run duration → threshold = 11m.
      const tenMinutesAgo = new Date(mockCurrentTime - 10 * 60 * 1000).toISOString();

      const result = calculateIsValidPing({
        previousRunEndTimeISO: tenMinutesAgo,
        scheduleInMs: 5 * 60 * 1000,
        previousRunDurationUs: 6 * 60 * 1000 * 1000,
      });

      expect(result).toBe(true);
    });

    describe('schedule-proportional default buffer', () => {
      it('preserves the 60s floor for a 1m monitor (no behavior change)', () => {
        // 1m schedule → buffer floor of 60s wins. Total allowed = 2m.
        const ninetySecondsAgo = new Date(mockCurrentTime - 90 * 1000).toISOString();
        const threeMinutesAgo = new Date(mockCurrentTime - 3 * 60 * 1000).toISOString();

        expect(
          calculateIsValidPing({
            previousRunEndTimeISO: ninetySecondsAgo,
            scheduleInMs: 60 * 1000,
          })
        ).toBe(true);

        expect(
          calculateIsValidPing({
            previousRunEndTimeISO: threeMinutesAgo,
            scheduleInMs: 60 * 1000,
          })
        ).toBe(false);
      });

      it('treats a 10m monitor with a 12m gap as valid (was invalid under the old 60s buffer)', () => {
        // 10m schedule → default buffer = 5m. Total allowed = 15m.
        const twelveMinutesAgo = new Date(mockCurrentTime - 12 * 60 * 1000).toISOString();

        expect(
          calculateIsValidPing({
            previousRunEndTimeISO: twelveMinutesAgo,
            scheduleInMs: 10 * 60 * 1000,
          })
        ).toBe(true);
      });

      it('treats a 30m monitor with a 40m gap as valid (was invalid under the old 60s buffer)', () => {
        // 30m schedule → default buffer = 15m. Total allowed = 45m.
        const fortyMinutesAgo = new Date(mockCurrentTime - 40 * 60 * 1000).toISOString();

        expect(
          calculateIsValidPing({
            previousRunEndTimeISO: fortyMinutesAgo,
            scheduleInMs: 30 * 60 * 1000,
          })
        ).toBe(true);
      });

      it('still flags a 10m monitor as stale once the gap exceeds schedule + 50%', () => {
        // 10m schedule → default buffer = 5m. Total allowed = 15m.
        const sixteenMinutesAgo = new Date(mockCurrentTime - 16 * 60 * 1000).toISOString();

        expect(
          calculateIsValidPing({
            previousRunEndTimeISO: sixteenMinutesAgo,
            scheduleInMs: 10 * 60 * 1000,
          })
        ).toBe(false);
      });
    });
  });
});
