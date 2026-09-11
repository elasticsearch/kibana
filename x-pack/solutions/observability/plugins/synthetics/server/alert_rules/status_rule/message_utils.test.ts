/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import {
  getMonitorSummary,
  getReasonMessage,
  getUngroupedReasonMessage,
  getMonitorAlertDocument,
  formatStepInformation,
} from './message_utils';
import type { MissingPingMonitorInfo } from '../../../common/runtime_types/alert_rules/common';
import type { OverviewPing } from '../../../common/runtime_types';

describe('message_utils', () => {
  const dateFormat = 'YYYY-MM-DD HH:mm:ss';
  const tz = 'UTC';
  const monitorId = 'test-monitor-id';
  const locationId = 'test-location-id';
  const monitorName = 'Test Monitor';
  const locationName = 'Test Location';
  const timestamp = '2025-05-27T12:00:00.000Z';
  const monitorUrl = 'https://example.com';
  const monitorAgentName = 'test-agent';

  describe('getMonitorSummary', () => {
    it('returns correct summary for a ping monitor', () => {
      const monitorInfo = {
        '@timestamp': timestamp,
        monitor: {
          id: monitorId,
          name: monitorName,
          type: 'http',
        },
        observer: {
          geo: {
            name: locationName,
          },
        },
        url: {
          full: monitorUrl,
        },
        agent: {
          name: monitorAgentName,
        },
        summary: {
          up: 1,
          down: 0,
        },
      } as unknown as OverviewPing;

      const result = getMonitorSummary({
        monitorInfo,
        locationId: [locationId],
        configId: monitorId,
        tz,
        dateFormat,
        reason: 'down' as any,
        params: {
          condition: {
            downThreshold: 3,
            locationsThreshold: 2,
            window: { time: { unit: 'm', size: 10 } },
          },
        },
      });

      expect(result).toEqual({
        monitorId,
        monitorName,
        monitorType: 'HTTP',
        monitorUrl,
        configId: monitorId,
        locationId,
        locationName,
        hostName: monitorAgentName,
        timestamp,
        checkedAt: moment(timestamp).tz(tz).format(dateFormat),
        downThreshold: 3,
        pendingThreshold: 2,
        reason:
          'Monitor "Test Monitor" from Test Location is down. Alert when 3 checks are down within the last 10 minutes from at least 2 locations.',
        locationNames: locationName,
        status: 'down',
        monitorUrlLabel: 'URL',
        lastErrorMessage: undefined,
        lastErrorStack: undefined,
        serviceName: undefined,
        labels: undefined,
        stateId: undefined,
        checks: undefined,
        monitorTags: undefined,
        failedStepInfo: '',
        failedStepName: undefined,
        failedStepNumber: undefined,
      });
    });

    it('handles missing timestamp for pending monitors', () => {
      const monitorInfo = {
        monitor: {
          id: monitorId,
          name: monitorName,
          type: 'http',
        },
        observer: {
          geo: {
            name: locationName,
          },
        },
        url: {
          full: monitorUrl,
        },
      } as MissingPingMonitorInfo;

      const result = getMonitorSummary({
        monitorInfo,
        locationId: [locationId],
        configId: monitorId,
        tz,
        dateFormat,
        reason: 'pending',
      });

      expect(result).toEqual({
        monitorId,
        monitorName,
        monitorType: 'HTTP',
        monitorUrl,
        configId: monitorId,
        locationId,
        locationName,
        status: 'pending',
        downThreshold: 1,
        pendingThreshold: 2,
        locationNames: locationName,
        monitorUrlLabel: 'URL',
        reason: 'Monitor "Test Monitor" from Test Location is pending.',
        checkedAt: undefined,
        timestamp: undefined,
        hostName: undefined,
        lastErrorMessage: undefined,
        lastErrorStack: undefined,
        serviceName: undefined,
        labels: undefined,
        stateId: undefined,
        checks: undefined,
        monitorTags: undefined,
        failedStepInfo: '',
        failedStepName: undefined,
        failedStepNumber: undefined,
      });
    });
  });

  describe('getReasonMessage', () => {
    it('returns correct message for down status with latest checks', () => {
      const message = getReasonMessage({
        name: monitorName,
        location: locationName,
        reason: 'down',
        checks: {
          downWithinXChecks: 2,
          down: 2,
        },
        params: {
          condition: {
            latestChecks: {
              count: 3,
              threshold: 1,
              locationsThreshold: 1,
            },
          },
        } as any,
      });

      expect(message).toContain(`Monitor "${monitorName}" from ${locationName} is down`);
      expect(message).toContain('Monitor is down 2 times within the last 1 checks');
      expect(message).toContain('Alert when 1 out of the last 1 checks are down');
    });
  });

  describe('getUngroupedReasonMessage', () => {
    const secondLocationId = `${locationId}-2`;
    const secondLocationName = `${locationName}-2`;
    it('returns correct message for down status with latest checks', () => {
      const statusConfigs = [
        {
          status: 'down',
          configId: monitorId,
          monitorQueryId: monitorId,
          locationId,
          latestPing: {
            observer: {
              geo: {
                name: locationName,
              },
            },
          },
          checks: {
            downWithinXChecks: 2,
            down: 2,
          },
        },
        {
          status: 'down',
          configId: monitorId,
          monitorQueryId: monitorId,
          locationId: secondLocationId,
          latestPing: {
            observer: {
              geo: {
                name: secondLocationName,
              },
            },
          },
          checks: {
            downWithinXChecks: 1,
            down: 1,
          },
        },
      ] as any;

      const message = getUngroupedReasonMessage({
        statusConfigs,
        monitorName,
        reason: 'down',
        params: {
          condition: {
            latestChecks: {
              count: 3,
              threshold: 1,
              locationsThreshold: 1,
            },
          },
        } as any,
      });

      expect(message).toContain(`Monitor "${monitorName}" is down`);
      expect(message).toContain(`2 times from ${locationName}`);
      expect(message).toContain(`1 time from ${secondLocationName}`);
    });

    it('uses pendingCount in the ungrouped pending reason', () => {
      const message = getUngroupedReasonMessage({
        statusConfigs: [
          {
            status: 'pending',
            configId: monitorId,
            monitorQueryId: monitorId,
            locationId,
            pendingCount: 2,
            monitorInfo: {
              monitor: { name: monitorName, id: monitorId, type: 'http' },
              observer: { geo: { name: locationName } },
              tags: [],
            },
          },
        ],
        monitorName,
        reason: 'pending',
        params: {
          condition: {
            alertOnNoData: true,
            pendingThreshold: 2,
            window: { numberOfChecks: 5 },
          },
        },
      });

      expect(message).toBe(`Monitor "${monitorName}" is pending 2 times from ${locationName}.`);
    });
  });

  describe('getMonitorAlertDocument', () => {
    const monitorTags = ['tag1', 'tag2'];
    it('correctly formats the alert document', () => {
      const monitorSummary = {
        monitorId,
        monitorName,
        monitorType: 'http',
        monitorUrl,
        configId: monitorId,
        locationId,
        locationName,
        hostName: monitorAgentName,
        status: 'down',
        reason: 'Monitor is down',
        checks: {
          downWithinXChecks: 2,
          down: 2,
        },
        monitorTags,
      } as any;

      const result = getMonitorAlertDocument(
        monitorSummary,
        [locationName],
        [monitorSummary.locationId],
        true,
        1
      );

      expect(result).toEqual({
        'monitor.id': monitorId,
        'monitor.type': 'http',
        'monitor.name': monitorName,
        'url.full': monitorUrl,
        'observer.geo.name': [locationName],
        'observer.name': [monitorSummary.locationId],
        'agent.name': monitorAgentName,
        'kibana.alert.reason': 'Monitor is down',
        'location.id': [monitorSummary.locationId],
        'location.name': [locationName],
        configId: monitorId,
        'kibana.alert.evaluation.threshold': 1,
        'kibana.alert.evaluation.value': 2,
        'monitor.tags': monitorTags,
      });
    });

    it('uses pendingCount as evaluation.value when provided', () => {
      const monitorSummary = {
        monitorId,
        monitorName,
        monitorType: 'http',
        monitorUrl,
        configId: monitorId,
        locationId,
        locationName,
        hostName: monitorAgentName,
        status: 'pending',
        reason: 'Monitor is pending',
        monitorTags,
      } as any;

      const result = getMonitorAlertDocument(
        monitorSummary,
        [locationName],
        [monitorSummary.locationId],
        false,
        2,
        undefined,
        2
      );

      expect(result['kibana.alert.evaluation.threshold']).toBe(2);
      expect(result['kibana.alert.evaluation.value']).toBe(2);
    });
  });

  describe('formatStepInformation', () => {
    it('returns empty string for null step info', () => {
      const result = formatStepInformation(null);
      expect(result).toBe('');
    });

    it('returns empty string for undefined step info', () => {
      const result = formatStepInformation(undefined as any);
      expect(result).toBe('');
    });

    it('formats basic step information without context', () => {
      const stepInfo = {
        stepName: 'Click button',
        scriptSource: 'await page.click("button")',
      };

      const result = formatStepInformation(stepInfo);

      expect(result).toContain('- Step: Click button');
      expect(result).toContain('- Step script: await page.click("button")');
    });

    it('formats complete step information with all fields', () => {
      const stepInfo = {
        stepName: 'Click button',
        scriptSource: 'await page.click("button")',
        stepNumber: 3,
      };

      const result = formatStepInformation(stepInfo);

      // Check that it includes step details
      expect(result).toContain('- Step: 3. Click button');
      expect(result).toContain('- Step script: await page.click("button")');
    });

    it('handles missing context gracefully', () => {
      const stepInfo = {
        stepName: 'Click button',
        stepNumber: 3,
      };

      const result = formatStepInformation(stepInfo);

      // Should include available info
      expect(result).toContain('- Step: 3. Click button');
    });

    it('handles partial step information', () => {
      const stepInfo = {
        stepName: 'Click button',
        // Missing scriptSource
      };

      const result = formatStepInformation(stepInfo);

      expect(result).toContain('- Step: Click button');
      expect(result).not.toContain('- Step script:');
    });

    it('truncates long script source', () => {
      const longScript = 'a'.repeat(300);
      const stepInfo = {
        stepName: 'Click button',
        scriptSource: longScript,
      };

      const result = formatStepInformation(stepInfo);

      expect(result).toContain('- Step script: ' + 'a'.repeat(200) + '...');
    });
  });
});
