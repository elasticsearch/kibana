/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import moment from 'moment';
import { loggerMock } from '@kbn/logging-mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import { coreMock } from '@kbn/core/server/mocks';
import { getDoesMonitorMeetLocationThreshold, StatusRuleExecutor } from './status_rule_executor';
import { mockEncryptedSO } from '../../synthetics_service/utils/mocks';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import { SyntheticsMonitorClient } from '../../synthetics_service/synthetics_monitor/synthetics_monitor_client';
import { SyntheticsService } from '../../synthetics_service/synthetics_service';
import * as locationsUtils from '../../synthetics_service/get_all_locations';
import type { PublicLocation } from '../../../common/runtime_types';
import type { SyntheticsServerSetup } from '../../types';
import type {
  AlertStatusMetaData,
  AlertPendingStatusMetaData,
} from '../../../common/runtime_types/alert_rules/common';
import { SyntheticsEsClient } from '../../lib';
import { SYNTHETICS_INDEX_PATTERN } from '../../../common/constants';
import { ALERT_GROUPING } from '@kbn/rule-data-utils';

// Mock the step information functions
jest.mock('./queries/get_step_information', () => ({
  getStepInformation: jest.fn().mockResolvedValue(null),
}));

describe('StatusRuleExecutor', () => {
  // @ts-ignore
  Date.now = jest.fn(() => new Date('2024-05-13T12:33:37.000Z'));

  const mockEsClient = elasticsearchClientMock.createElasticsearchClient();
  const logger = loggerMock.create();
  const soClient = savedObjectsClientMock.create();
  jest.spyOn(locationsUtils, 'getAllLocations').mockResolvedValue({
    // @ts-ignore
    publicLocations: [
      {
        id: 'us_central_qa',
        label: 'US Central QA',
      },
      {
        id: 'us_central_dev',
        label: 'US Central DEV',
      },
    ] as unknown as PublicLocation,
    privateLocations: [],
  });

  const serverMock: SyntheticsServerSetup = {
    logger,
    syntheticsEsClient: mockEsClient,
    authSavedObjectsClient: soClient,
    config: {
      service: {
        username: 'dev',
        password: '12345',
        manifestUrl: 'http://localhost:8080/api/manifest',
      },
    },
    spaces: {
      spacesService: {
        getSpaceId: jest.fn().mockReturnValue('test-space'),
      },
    },
    encryptedSavedObjects: mockEncryptedSO(),
  } as unknown as SyntheticsServerSetup;

  const syntheticsService = new SyntheticsService(serverMock);

  const monitorClient = new SyntheticsMonitorClient(syntheticsService, serverMock);

  const mockStart = coreMock.createStart();
  const uiSettingsClient = mockStart.uiSettings.asScopedToClient(soClient);
  const esClient = new SyntheticsEsClient(soClient, mockEsClient, {
    heartbeatIndices: SYNTHETICS_INDEX_PATTERN,
  });

  const statusRule = new StatusRuleExecutor(esClient, serverMock, monitorClient, {
    params: {},
    services: {
      uiSettingsClient,
      savedObjectsClient: soClient,
      scopedClusterClient: { asCurrentUser: mockEsClient },
    },
    rule: {
      name: 'test',
    },
  } as any);
  const configRepo = statusRule.monitorConfigRepository;

  afterEach(() => {
    statusRule.params = {};
    jest.clearAllMocks();
  });

  describe('DefaultRule', () => {
    it('should only query enabled monitors', async () => {
      const spy = jest.spyOn(configRepo, 'getAll').mockResolvedValue([]);

      const { downConfigs, staleDownConfigs } = await statusRule.getConfigs({});

      expect(downConfigs).toEqual({});
      expect(staleDownConfigs).toEqual({});

      expect(spy).toHaveBeenCalledWith({
        filter: 'synthetics-monitor-multi-space.attributes.alert.status.enabled: true',
      });
    });

    it('should use all monitorLocationIds when params locations is an empty array', async () => {
      // Create a spy on the queryMonitorStatusAlert function
      const queryMonitorStatusAlertModule = await import('./queries/query_monitor_status_alert');
      const spy = jest
        .spyOn(queryMonitorStatusAlertModule, 'queryMonitorStatusAlert')
        .mockResolvedValue({
          upConfigs: {},
          downConfigs: {},
          enabledMonitorQueryIds: [],
          pendingConfigs: {},
          configStats: {},
        });

      // Create a new instance with empty locations array
      const statusRuleWithEmptyLocations = new StatusRuleExecutor(
        esClient,
        serverMock,
        monitorClient,
        {
          params: {
            locations: [], // Empty locations array
          },
          services: {
            uiSettingsClient,
            savedObjectsClient: soClient,
            scopedClusterClient: { asCurrentUser: mockEsClient },
          },
          rule: {
            name: 'test',
          },
        } as any
      );

      // Mock the getAll method to return test monitors with a location
      jest
        .spyOn(statusRuleWithEmptyLocations.monitorConfigRepository, 'getAll')
        .mockResolvedValue(testMonitors);

      // Execute
      await statusRuleWithEmptyLocations.getConfigs({});

      // Verify that queryMonitorStatusAlert was called passing the monitor location
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          monitorLocationIds: ['us_central_qa'],
        })
      );
    });

    it('marks deleted configs as expected', async () => {
      jest.spyOn(configRepo, 'getAll').mockResolvedValue(testMonitors);

      const { downConfigs } = await statusRule.getConfigs({});

      expect(downConfigs).toEqual({});

      const staleDownConfigs = await statusRule.markDeletedConfigs({
        id2: {
          locationId: 'us-east-1',
          configId: 'id2',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
          monitorQueryId: 'test',
          latestPing: {} as any,
          checks: {
            downWithinXChecks: 1,
            down: 1,
          },
        },
        'id1-us_central_dev': {
          locationId: 'us_central_dev',
          configId: 'id1',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
          monitorQueryId: 'test',
          latestPing: {} as any,
          checks: {
            downWithinXChecks: 1,
            down: 1,
          },
        },
        'id1-us_central_qa': {
          locationId: 'us_central_qa',
          configId: 'id1',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
          monitorQueryId: 'test',
          latestPing: {} as any,
          checks: {
            downWithinXChecks: 1,
            down: 1,
          },
        },
      });

      expect(staleDownConfigs).toEqual({
        id2: {
          configId: 'id2',
          isDeleted: true,
          locationId: 'us-east-1',
          monitorQueryId: 'test',
          latestPing: {},
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
          checks: {
            downWithinXChecks: 1,
            down: 1,
          },
        },
        'id1-us_central_dev': {
          configId: 'id1',
          isLocationRemoved: true,
          locationId: 'us_central_dev',
          monitorQueryId: 'test',
          latestPing: {},
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
          checks: {
            downWithinXChecks: 1,
            down: 1,
          },
        },
      });
    });

    it('does not mark deleted config when monitor does not contain location label', async () => {
      jest.spyOn(configRepo, 'getAll').mockResolvedValue([
        {
          ...testMonitors[0],
          attributes: {
            ...testMonitors[0].attributes,
            locations: [
              {
                geo: { lon: -95.86, lat: 41.25 },
                isServiceManaged: true,
                id: 'us_central_qa',
              },
            ],
          },
        },
      ]);

      const { downConfigs } = await statusRule.getConfigs({});

      expect(downConfigs).toEqual({});

      const staleDownConfigs = await statusRule.markDeletedConfigs({
        id2: {
          locationId: 'us-east-1',
          configId: 'id2',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
          monitorQueryId: 'test',
          latestPing: {} as any,
          checks: {
            downWithinXChecks: 1,
            down: 1,
          },
        },
        'id1-us_central_dev': {
          locationId: 'us_central_dev',
          configId: 'id1',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
          monitorQueryId: 'test',
          latestPing: {} as any,
          checks: {
            downWithinXChecks: 1,
            down: 1,
          },
        },
        'id1-us_central_qa': {
          locationId: 'us_central_qa',
          configId: 'id1',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
          monitorQueryId: 'test',
          latestPing: {} as any,
          checks: {
            downWithinXChecks: 1,
            down: 1,
          },
        },
      });

      expect(staleDownConfigs).toEqual({
        id2: {
          configId: 'id2',
          isDeleted: true,
          locationId: 'us-east-1',
          monitorQueryId: 'test',
          latestPing: {},
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
          checks: {
            downWithinXChecks: 1,
            down: 1,
          },
        },
        'id1-us_central_dev': {
          configId: 'id1',
          isLocationRemoved: true,
          locationId: 'us_central_dev',
          monitorQueryId: 'test',
          latestPing: {},
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
          checks: {
            downWithinXChecks: 1,
            down: 1,
          },
        },
      });
    });
  });

  describe('handleDownMonitorThresholdAlert', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    it('should alert if monitor meet location threshold', async () => {
      const spy = jest.spyOn(statusRule, 'scheduleAlert');
      await statusRule.handleDownMonitorThresholdAlert({
        downConfigs: {
          'id1-us_central_qa': {
            locationId: 'us_central_qa',
            configId: 'id1',
            status: 'down',
            timestamp: '2021-06-01T00:00:00.000Z',
            monitorQueryId: 'test',
            latestPing: testPing,
            checks: {
              downWithinXChecks: 1,
              down: 1,
            },
          },
        },
      });
      expect(spy).toHaveBeenCalledWith({
        alertId: 'id1-us_central_qa',
        downThreshold: 1,
        idWithLocation: 'id1-us_central_qa',
        locationNames: ['Test location'],
        locationIds: ['test'],
        monitorSummary: {
          checkedAt: '2024-05-13T12:33:37Z',
          checks: { down: 1, downWithinXChecks: 1 },
          configId: 'id1',
          downThreshold: 1,
          hostName: undefined,
          labels: undefined,
          lastErrorMessage: undefined,
          lastErrorStack: undefined,
          locationId: 'us_central_qa',
          locationName: 'Test location',
          locationNames: 'Test location',
          monitorId: 'test',
          monitorName: 'test monitor',
          monitorTags: ['dev'],
          monitorType: 'browser',
          monitorUrl: 'https://www.google.com',
          monitorUrlLabel: 'URL',
          pendingThreshold: 2,
          reason:
            'Monitor "test monitor" from Test location is down. Monitor is down 1 time within the last 1 checks. Alert when 1 out of the last 1 checks are down from at least 1 location.',
          serviceName: undefined,
          stateId: undefined,
          status: 'down',
          failedStepInfo: '',
          timestamp: '2024-05-13T12:33:37.000Z',
        },
        statusConfig: {
          checks: { down: 1, downWithinXChecks: 1 },
          configId: 'id1',
          locationId: 'us_central_qa',
          monitorQueryId: 'test',
          latestPing: testPing,
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
        },
        useLatestChecks: true,
      });
    });

    it('should not alert if monitor do not meet location threshold', async () => {
      statusRule.params = {
        condition: {
          window: {
            numberOfChecks: 1,
          },
          downThreshold: 1,
          locationsThreshold: 2,
        },
      };

      const spy = jest.spyOn(statusRule, 'scheduleAlert');
      await statusRule.handleDownMonitorThresholdAlert({
        downConfigs: {
          'id1-us_central_qa': {
            locationId: 'us_central_qa',
            configId: 'id1',
            status: 'down',
            timestamp: '2021-06-01T00:00:00.000Z',
            monitorQueryId: 'test',
            latestPing: testPing,
            checks: {
              downWithinXChecks: 1,
              down: 1,
            },
          },
        },
      });
      expect(spy).toHaveBeenCalledTimes(0);
    });

    it('should send 2 alerts for grouped by location', async () => {
      statusRule.params = {
        condition: {
          window: {
            numberOfChecks: 1,
          },
          downThreshold: 1,
          locationsThreshold: 1,
        },
      };
      const spy = jest.spyOn(statusRule, 'scheduleAlert');
      await statusRule.handleDownMonitorThresholdAlert({
        downConfigs: {
          'id1-us_central_qa': {
            locationId: 'us_central_qa',
            configId: 'id1',
            status: 'down',
            timestamp: '2021-06-01T00:00:00.000Z',
            monitorQueryId: 'test',
            latestPing: testPing,
            checks: {
              downWithinXChecks: 1,
              down: 1,
            },
          },
          'id1-us_central_dev': {
            locationId: 'us_central_dev',
            configId: 'id1',
            status: 'down',
            timestamp: '2021-06-01T00:00:00.000Z',
            monitorQueryId: 'test',
            latestPing: testPing,
            checks: {
              downWithinXChecks: 1,
              down: 1,
            },
          },
        },
      });
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('should send 1 alert for un-grouped', async () => {
      statusRule.params = {
        condition: {
          groupBy: 'none',
          window: {
            numberOfChecks: 1,
          },
          downThreshold: 1,
          locationsThreshold: 1,
        },
      };
      const spy = jest.spyOn(statusRule, 'scheduleAlert');
      await statusRule.handleDownMonitorThresholdAlert({
        downConfigs: {
          'id1-us_central_qa': {
            locationId: 'us_central_qa',
            configId: 'id1',
            status: 'down',
            timestamp: '2021-06-01T00:00:00.000Z',
            monitorQueryId: 'test',
            latestPing: testPing,
            checks: {
              downWithinXChecks: 1,
              down: 1,
            },
          },
          'id1-us_central_dev': {
            locationId: 'us_central_dev',
            configId: 'id1',
            status: 'down',
            timestamp: '2021-06-01T00:00:00.000Z',
            monitorQueryId: 'test',
            latestPing: testPing,
            checks: {
              downWithinXChecks: 1,
              down: 1,
            },
          },
        },
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({
        alertId: 'id1',
        downThreshold: 1,
        idWithLocation: 'id1',
        locationIds: ['test', 'test'],
        locationNames: ['Test location', 'Test location'],
        monitorSummary: {
          checkedAt: '2024-05-13T12:33:37Z',
          checks: { down: 1, downWithinXChecks: 1 },
          configId: 'id1',
          downThreshold: 1,
          hostName: undefined,
          labels: undefined,
          lastErrorMessage: undefined,
          lastErrorStack: undefined,
          locationId: 'test and test',
          locationName: 'Test location',
          locationNames: 'Test location and Test location',
          monitorId: 'test',
          monitorName: 'test monitor',
          monitorTags: ['dev'],
          monitorType: 'browser',
          monitorUrl: 'https://www.google.com',
          monitorUrlLabel: 'URL',
          pendingThreshold: 2,
          reason:
            'Monitor "test monitor" is down 1 time from Test location and 1 time from Test location. Alert when down 1 time out of the last 1 checks from at least 1 location.',
          serviceName: undefined,
          status: 'down',
          failedStepInfo: '',
          timestamp: '2024-05-13T12:33:37.000Z',
        },
        configId: 'id1',
        downConfigs: {
          'id1-us_central_qa': {
            locationId: 'us_central_qa',
            configId: 'id1',
            status: 'down',
            timestamp: '2021-06-01T00:00:00.000Z',
            monitorQueryId: 'test',
            latestPing: testPing,
            checks: {
              downWithinXChecks: 1,
              down: 1,
            },
          },
          'id1-us_central_dev': {
            locationId: 'us_central_dev',
            configId: 'id1',
            status: 'down',
            timestamp: '2021-06-01T00:00:00.000Z',
            monitorQueryId: 'test',
            latestPing: testPing,
            checks: {
              downWithinXChecks: 1,
              down: 1,
            },
          },
        },
        useLatestChecks: true,
      });
    });

    describe('filtering configs with missing latestPing.monitor', () => {
      it('should skip configs where latestPing is undefined', async () => {
        const spy = jest.spyOn(statusRule, 'scheduleAlert');
        await statusRule.handleDownMonitorThresholdAlert({
          downConfigs: {
            'id1-us_central_qa': {
              locationId: 'us_central_qa',
              configId: 'id1',
              status: 'down',
              timestamp: '2021-06-01T00:00:00.000Z',
              monitorQueryId: 'test',
              latestPing: undefined as any,
              checks: {
                downWithinXChecks: 1,
                down: 1,
              },
            },
          },
        });
        expect(spy).not.toHaveBeenCalled();
      });

      it('should skip configs where latestPing.monitor is undefined', async () => {
        const spy = jest.spyOn(statusRule, 'scheduleAlert');
        await statusRule.handleDownMonitorThresholdAlert({
          downConfigs: {
            'id1-us_central_qa': {
              locationId: 'us_central_qa',
              configId: 'id1',
              status: 'down',
              timestamp: '2021-06-01T00:00:00.000Z',
              monitorQueryId: 'test',
              latestPing: { '@timestamp': '2024-05-13T12:33:37.000Z' } as any,
              checks: {
                downWithinXChecks: 1,
                down: 1,
              },
            },
          },
        });
        expect(spy).not.toHaveBeenCalled();
      });

      it('should log a debug message for each skipped config', async () => {
        const debugSpy = jest.spyOn(statusRule, 'debug');
        await statusRule.handleDownMonitorThresholdAlert({
          downConfigs: {
            'id1-us_central_qa': {
              locationId: 'us_central_qa',
              configId: 'id1',
              status: 'down',
              timestamp: '2021-06-01T00:00:00.000Z',
              monitorQueryId: 'test',
              latestPing: undefined as any,
              checks: {
                downWithinXChecks: 1,
                down: 1,
              },
            },
            'id2-us_central_dev': {
              locationId: 'us_central_dev',
              configId: 'id2',
              status: 'down',
              timestamp: '2021-06-01T00:00:00.000Z',
              monitorQueryId: 'test2',
              latestPing: { '@timestamp': '2024-05-13T12:33:37.000Z' } as any,
              checks: {
                downWithinXChecks: 1,
                down: 1,
              },
            },
          },
        });
        expect(debugSpy).toHaveBeenCalledWith(
          expect.stringContaining('Skipping down config id1-us_central_qa')
        );
        expect(debugSpy).toHaveBeenCalledWith(
          expect.stringContaining('Skipping down config id2-us_central_dev')
        );
      });

      it('should only alert for valid configs when mixed with invalid ones (grouped by location)', async () => {
        const spy = jest.spyOn(statusRule, 'scheduleAlert');
        await statusRule.handleDownMonitorThresholdAlert({
          downConfigs: {
            'id1-us_central_qa': {
              locationId: 'us_central_qa',
              configId: 'id1',
              status: 'down',
              timestamp: '2021-06-01T00:00:00.000Z',
              monitorQueryId: 'test',
              latestPing: testPing,
              checks: {
                downWithinXChecks: 1,
                down: 1,
              },
            },
            'id2-us_central_dev': {
              locationId: 'us_central_dev',
              configId: 'id2',
              status: 'down',
              timestamp: '2021-06-01T00:00:00.000Z',
              monitorQueryId: 'test2',
              latestPing: undefined as any,
              checks: {
                downWithinXChecks: 1,
                down: 1,
              },
            },
          },
        });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(
          expect.objectContaining({
            alertId: 'id1-us_central_qa',
          })
        );
      });

      it('should only alert for valid configs when mixed with invalid ones (ungrouped)', async () => {
        statusRule.params = {
          condition: {
            groupBy: 'none',
            window: {
              numberOfChecks: 1,
            },
            downThreshold: 1,
            locationsThreshold: 1,
          },
        };
        const spy = jest.spyOn(statusRule, 'scheduleAlert');
        await statusRule.handleDownMonitorThresholdAlert({
          downConfigs: {
            'id1-us_central_qa': {
              locationId: 'us_central_qa',
              configId: 'id1',
              status: 'down',
              timestamp: '2021-06-01T00:00:00.000Z',
              monitorQueryId: 'test',
              latestPing: testPing,
              checks: {
                downWithinXChecks: 1,
                down: 1,
              },
            },
            'id1-us_central_dev': {
              locationId: 'us_central_dev',
              configId: 'id1',
              status: 'down',
              timestamp: '2021-06-01T00:00:00.000Z',
              monitorQueryId: 'test',
              latestPing: undefined as any,
              checks: {
                downWithinXChecks: 1,
                down: 1,
              },
            },
          },
        });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(
          expect.objectContaining({
            alertId: 'id1',
            locationNames: ['Test location'],
            locationIds: ['test'],
          })
        );
      });

      it('should not alert when all configs have missing latestPing (ungrouped)', async () => {
        statusRule.params = {
          condition: {
            groupBy: 'none',
            window: {
              numberOfChecks: 1,
            },
            downThreshold: 1,
            locationsThreshold: 1,
          },
        };
        const spy = jest.spyOn(statusRule, 'scheduleAlert');
        await statusRule.handleDownMonitorThresholdAlert({
          downConfigs: {
            'id1-us_central_qa': {
              locationId: 'us_central_qa',
              configId: 'id1',
              status: 'down',
              timestamp: '2021-06-01T00:00:00.000Z',
              monitorQueryId: 'test',
              latestPing: undefined as any,
              checks: {
                downWithinXChecks: 1,
                down: 1,
              },
            },
            'id1-us_central_dev': {
              locationId: 'us_central_dev',
              configId: 'id1',
              status: 'down',
              timestamp: '2021-06-01T00:00:00.000Z',
              monitorQueryId: 'test',
              latestPing: { '@timestamp': '2024-05-13T12:33:37.000Z' } as any,
              checks: {
                downWithinXChecks: 1,
                down: 1,
              },
            },
          },
        });
        expect(spy).not.toHaveBeenCalled();
      });
    });

    it('should send 2 alerts for un-grouped with 2 different monitors', async () => {
      statusRule.params = {
        condition: {
          groupBy: 'none',
          window: {
            numberOfChecks: 1,
          },
          downThreshold: 1,
          locationsThreshold: 1,
        },
      };
      const spy = jest.spyOn(statusRule, 'scheduleAlert');
      await statusRule.handleDownMonitorThresholdAlert({
        downConfigs: {
          'id1-us_central_qa': {
            locationId: 'us_central_qa',
            configId: 'id1',
            status: 'down',
            timestamp: '2021-06-01T00:00:00.000Z',
            monitorQueryId: 'test',
            latestPing: testPing,
            checks: {
              downWithinXChecks: 1,
              down: 1,
            },
          },
          'id2-us_central_dev': {
            locationId: 'us_central_dev',
            configId: 'id2',
            status: 'down',
            timestamp: '2021-06-01T00:00:00.000Z',
            monitorQueryId: 'test',
            latestPing: testPing,
            checks: {
              downWithinXChecks: 1,
              down: 1,
            },
          },
        },
      });
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('getRange', () => {
    const maxPeriod = 60000; // 1 minute

    it('should return the correct range for a default rule', () => {
      const defaultStatusRule = new StatusRuleExecutor(esClient, serverMock, monitorClient, {
        params: {},
        services: {
          uiSettingsClient,
          savedObjectsClient: soClient,
          scopedClusterClient: { asCurrentUser: mockEsClient },
        },
        rule: {
          name: 'test',
        },
      } as any);
      const range = defaultStatusRule.getRange(maxPeriod);
      const expectedFrom = moment()
        .subtract(maxPeriod * 1, 'milliseconds')
        .subtract(5, 'minutes')
        .toISOString();
      expect(range.from).toEqual(expectedFrom);
    });

    it('should return the correct range for a custom rule with numberOfChecks', () => {
      const customStatusRule = new StatusRuleExecutor(esClient, serverMock, monitorClient, {
        params: {
          condition: {
            window: {
              numberOfChecks: 5,
            },
          },
        },
        services: {
          uiSettingsClient,
          savedObjectsClient: soClient,
          scopedClusterClient: { asCurrentUser: mockEsClient },
        },
        rule: {
          name: 'test',
        },
      } as any);

      const range = customStatusRule.getRange(maxPeriod);
      const expectedFrom = moment()
        .subtract(maxPeriod * 5, 'milliseconds')
        .subtract(5, 'minutes')
        .toISOString();
      expect(range.from).toEqual(expectedFrom);
    });

    it('should return the correct range for a custom rule with a time window', () => {
      const timeWindowStatusRule = new StatusRuleExecutor(esClient, serverMock, monitorClient, {
        params: {
          condition: {
            window: {
              time: {
                size: 10,
                unit: 'm',
              },
            },
          },
        },
        services: {
          uiSettingsClient,
          savedObjectsClient: soClient,
          scopedClusterClient: { asCurrentUser: mockEsClient },
        },
        rule: {
          name: 'test',
        },
      } as any);

      const range = timeWindowStatusRule.getRange(maxPeriod);
      const expectedFrom = moment().subtract(10, 'minutes').toISOString();
      expect(range.from).toEqual(expectedFrom);
    });
  });

  describe('handlePendingMonitorAlert', () => {
    let schedulePendingAlertPerConfigIdSpy: jest.SpyInstance;
    let schedulePendingAlertPerConfigIdPerLocationSpy: jest.SpyInstance;

    const MOCK_FIRST_MONITOR = {
      id: 'monitor-1',
      name: 'Monitor 1',
      type: 'browser',
      url: 'http://monitor.1.com',
    };
    const MOCK_SECOND_MONITOR = {
      id: 'monitor-2',
      name: 'Monitor 2',
      type: 'http',
      url: 'http://monitor.2.com',
    };
    const MOCK_FIRST_LOCATION = { id: 'location-1', name: 'Test Location 1' };
    const MOCK_SECOND_LOCATION = { id: 'location-2', name: 'Test Location 2' };
    const FIRST_CONFIG_ID = `${MOCK_FIRST_MONITOR.id}${MOCK_FIRST_LOCATION.id}`;
    const SECOND_CONFIG_ID = `${MOCK_SECOND_MONITOR.id}${MOCK_SECOND_LOCATION.id}`;

    const mockPendingConfigs: Record<string, AlertPendingStatusMetaData> = {
      [FIRST_CONFIG_ID]: {
        configId: MOCK_FIRST_MONITOR.id,
        locationId: MOCK_FIRST_LOCATION.id,
        status: 'pending',
        timestamp: '2025-05-15T10:00:00.000Z',
        monitorQueryId: MOCK_FIRST_MONITOR.id,
        latestPing: {
          '@timestamp': '2025-05-15T10:00:00.000Z',
          monitor: MOCK_FIRST_MONITOR,
          url: { full: MOCK_FIRST_MONITOR.url },
          observer: {
            geo: { name: MOCK_FIRST_LOCATION.name },
          },
        } as any,
        monitorInfo: {
          monitor: MOCK_FIRST_MONITOR,
          observer: { geo: { name: MOCK_FIRST_LOCATION.name } },
          tags: ['test', 'monitor1'],
          url: { full: MOCK_FIRST_MONITOR.url },
        },
      },
      [SECOND_CONFIG_ID]: {
        configId: MOCK_SECOND_MONITOR.id,
        locationId: MOCK_SECOND_LOCATION.id,
        status: 'pending',
        timestamp: '2025-05-15T10:00:00.000Z',
        monitorQueryId: MOCK_SECOND_MONITOR.id,
        latestPing: {
          '@timestamp': '2025-05-15T10:00:00.000Z',
          monitor: MOCK_SECOND_MONITOR,
          url: { full: MOCK_SECOND_MONITOR.url },
          observer: {
            geo: { name: MOCK_SECOND_LOCATION.name },
          },
        } as any,
        monitorInfo: {
          monitor: MOCK_SECOND_MONITOR,
          observer: { geo: { name: MOCK_SECOND_LOCATION.name } },
          tags: ['test', 'monitor2'],
          url: { full: MOCK_SECOND_MONITOR.url },
        },
      },
    };

    beforeEach(() => {
      schedulePendingAlertPerConfigIdSpy = jest.spyOn(
        statusRule,
        'schedulePendingAlertPerConfigId'
      );
      schedulePendingAlertPerConfigIdPerLocationSpy = jest.spyOn(
        statusRule,
        'schedulePendingAlertPerConfigIdPerLocation'
      );
    });

    it('should call schedulePendingAlertPerConfigId when alertOnNoData is true and groupBy is not locationId', async () => {
      statusRule.params = {
        condition: {
          alertOnNoData: true,
          groupBy: 'monitor',
          pendingThreshold: 1,
        } as any,
      };

      await statusRule.handlePendingMonitorAlert({ pendingConfigs: mockPendingConfigs });

      expect(schedulePendingAlertPerConfigIdSpy).toHaveBeenCalledTimes(1);
      expect(schedulePendingAlertPerConfigIdSpy).toHaveBeenCalledWith({
        pendingConfigs: mockPendingConfigs,
      });

      expect(schedulePendingAlertPerConfigIdPerLocationSpy).not.toHaveBeenCalled();
    });

    it('should call schedulePendingAlertPerConfigIdPerLocation when alertOnNoData is true and groupBy is locationId', async () => {
      statusRule.params = {
        condition: {
          alertOnNoData: true,
          groupBy: 'locationId',
          pendingThreshold: 1,
        } as any,
      };

      await statusRule.handlePendingMonitorAlert({ pendingConfigs: mockPendingConfigs });

      expect(schedulePendingAlertPerConfigIdPerLocationSpy).toHaveBeenCalledTimes(1);
      expect(schedulePendingAlertPerConfigIdPerLocationSpy).toHaveBeenCalledWith({
        pendingConfigs: mockPendingConfigs,
      });

      expect(schedulePendingAlertPerConfigIdSpy).not.toHaveBeenCalled();
    });

    it('should call schedulePendingAlertPerConfigIdPerLocation when alertOnNoData is true and groupBy is undefined', async () => {
      statusRule.params = {
        condition: {
          alertOnNoData: true,
          pendingThreshold: 1,
        } as any,
      };

      await statusRule.handlePendingMonitorAlert({ pendingConfigs: mockPendingConfigs });

      expect(schedulePendingAlertPerConfigIdPerLocationSpy).toHaveBeenCalledTimes(1);
      expect(schedulePendingAlertPerConfigIdPerLocationSpy).toHaveBeenCalledWith({
        pendingConfigs: mockPendingConfigs,
      });

      expect(schedulePendingAlertPerConfigIdSpy).not.toHaveBeenCalled();
    });

    it('should not call any scheduling methods when alertOnNoData is false', async () => {
      statusRule.params = {
        condition: {
          alertOnNoData: false,
          groupBy: 'locationId',
        } as any,
      };

      await statusRule.handlePendingMonitorAlert({ pendingConfigs: mockPendingConfigs });

      expect(schedulePendingAlertPerConfigIdSpy).not.toHaveBeenCalled();
      expect(schedulePendingAlertPerConfigIdPerLocationSpy).not.toHaveBeenCalled();
    });

    it('does not schedule on the first pending evaluation when pendingThreshold is 2', async () => {
      statusRule.params = {
        condition: {
          alertOnNoData: true,
          groupBy: 'locationId',
          pendingThreshold: 2,
        } as any,
      };

      const firstPending = {
        [FIRST_CONFIG_ID]: { ...mockPendingConfigs[FIRST_CONFIG_ID], pendingCount: 1 },
      };

      await statusRule.handlePendingMonitorAlert({ pendingConfigs: firstPending });

      expect(schedulePendingAlertPerConfigIdPerLocationSpy).not.toHaveBeenCalled();
      expect(schedulePendingAlertPerConfigIdSpy).not.toHaveBeenCalled();
    });

    it('schedules on the second consecutive pending evaluation when pendingThreshold is 2', async () => {
      statusRule.params = {
        condition: {
          alertOnNoData: true,
          groupBy: 'locationId',
          pendingThreshold: 2,
        } as any,
      };

      const secondPending = {
        [FIRST_CONFIG_ID]: { ...mockPendingConfigs[FIRST_CONFIG_ID], pendingCount: 2 },
      };

      await statusRule.handlePendingMonitorAlert({ pendingConfigs: secondPending });

      expect(schedulePendingAlertPerConfigIdPerLocationSpy).toHaveBeenCalledTimes(1);
      expect(schedulePendingAlertPerConfigIdPerLocationSpy).toHaveBeenCalledWith({
        pendingConfigs: secondPending,
      });
    });

    it('schedules on the first pending evaluation when pendingThreshold is 1', async () => {
      statusRule.params = {
        condition: {
          alertOnNoData: true,
          groupBy: 'locationId',
          pendingThreshold: 1,
        } as any,
      };

      const firstPending = {
        [FIRST_CONFIG_ID]: { ...mockPendingConfigs[FIRST_CONFIG_ID], pendingCount: 1 },
      };

      await statusRule.handlePendingMonitorAlert({ pendingConfigs: firstPending });

      expect(schedulePendingAlertPerConfigIdPerLocationSpy).toHaveBeenCalledTimes(1);
    });

    it('does not schedule by default when pendingCount is missing (treated as 1, default threshold 2)', async () => {
      statusRule.params = {
        condition: {
          alertOnNoData: true,
          groupBy: 'locationId',
        } as any,
      };

      await statusRule.handlePendingMonitorAlert({ pendingConfigs: mockPendingConfigs });

      expect(schedulePendingAlertPerConfigIdPerLocationSpy).not.toHaveBeenCalled();
      expect(schedulePendingAlertPerConfigIdSpy).not.toHaveBeenCalled();
    });

    it('only schedules locations that meet pendingThreshold', async () => {
      statusRule.params = {
        condition: {
          alertOnNoData: true,
          groupBy: 'locationId',
          pendingThreshold: 2,
        } as any,
      };

      const mixedPending = {
        [FIRST_CONFIG_ID]: { ...mockPendingConfigs[FIRST_CONFIG_ID], pendingCount: 1 },
        [SECOND_CONFIG_ID]: { ...mockPendingConfigs[SECOND_CONFIG_ID], pendingCount: 2 },
      };

      await statusRule.handlePendingMonitorAlert({ pendingConfigs: mixedPending });

      expect(schedulePendingAlertPerConfigIdPerLocationSpy).toHaveBeenCalledTimes(1);
      expect(schedulePendingAlertPerConfigIdPerLocationSpy).toHaveBeenCalledWith({
        pendingConfigs: {
          [SECOND_CONFIG_ID]: mixedPending[SECOND_CONFIG_ID],
        },
      });
    });

    describe('schedulePendingAlertPerConfigIdPerLocation', () => {
      let scheduleAlertSpy: jest.SpyInstance;

      beforeEach(() => {
        // Set up statusRule with necessary parameters for getMonitorPendingSummary
        statusRule.dateFormat = 'Y-MM-DD HH:mm:ss';
        statusRule.tz = 'UTC';
        statusRule.params = {
          condition: {
            alertOnNoData: true,
          } as any,
        };

        scheduleAlertSpy = jest.spyOn(statusRule, 'scheduleAlert');
      });

      afterEach(() => {
        jest.clearAllMocks();
      });

      it('should call scheduleAlert for each pending config with correct parameters', async () => {
        // Call the method
        await statusRule.schedulePendingAlertPerConfigIdPerLocation({
          pendingConfigs: mockPendingConfigs,
        });

        // Verify scheduleAlert was called with the correct parameters for each config
        expect(scheduleAlertSpy).toHaveBeenCalledTimes(2);

        expect(scheduleAlertSpy).toHaveBeenNthCalledWith(1, {
          alertId: FIRST_CONFIG_ID,
          idWithLocation: FIRST_CONFIG_ID,
          locationNames: [MOCK_FIRST_LOCATION.name],
          locationIds: [MOCK_FIRST_LOCATION.id],
          statusConfig: mockPendingConfigs[FIRST_CONFIG_ID],
          monitorSummary: {
            configId: MOCK_FIRST_MONITOR.id,
            downThreshold: 1,
            pendingThreshold: 2,
            locationId: MOCK_FIRST_LOCATION.id,
            locationName: MOCK_FIRST_LOCATION.name,
            locationNames: MOCK_FIRST_LOCATION.name,
            monitorId: MOCK_FIRST_MONITOR.id,
            monitorName: MOCK_FIRST_MONITOR.name,
            monitorTags: ['test', 'monitor1'],
            monitorType: MOCK_FIRST_MONITOR.type,
            monitorUrl: MOCK_FIRST_MONITOR.url,
            monitorUrlLabel: 'URL',
            reason: `Monitor "${MOCK_FIRST_MONITOR.name}" from ${MOCK_FIRST_LOCATION.name} is pending.`,
            status: 'pending',
            checkedAt: undefined,
            checks: undefined,
            hostName: undefined,
            labels: undefined,
            lastErrorMessage: undefined,
            lastErrorStack: undefined,
            serviceName: undefined,
            stateId: undefined,
            failedStepInfo: '',
            timestamp: undefined,
          },
        });
        expect(scheduleAlertSpy).toHaveBeenNthCalledWith(2, {
          alertId: SECOND_CONFIG_ID,
          idWithLocation: SECOND_CONFIG_ID,
          locationNames: [MOCK_SECOND_LOCATION.name],
          locationIds: [MOCK_SECOND_LOCATION.id],
          statusConfig: mockPendingConfigs[SECOND_CONFIG_ID],
          monitorSummary: {
            configId: MOCK_SECOND_MONITOR.id,
            downThreshold: 1,
            pendingThreshold: 2,
            locationId: MOCK_SECOND_LOCATION.id,
            locationName: MOCK_SECOND_LOCATION.name,
            locationNames: MOCK_SECOND_LOCATION.name,
            monitorId: MOCK_SECOND_MONITOR.id,
            monitorName: MOCK_SECOND_MONITOR.name,
            monitorTags: ['test', 'monitor2'],
            monitorType: 'HTTP',
            monitorUrl: MOCK_SECOND_MONITOR.url,
            monitorUrlLabel: 'URL',
            reason: `Monitor "${MOCK_SECOND_MONITOR.name}" from ${MOCK_SECOND_LOCATION.name} is pending.`,
            status: 'pending',
            checkedAt: undefined,
            checks: undefined,
            hostName: undefined,
            labels: undefined,
            lastErrorMessage: undefined,
            lastErrorStack: undefined,
            serviceName: undefined,
            stateId: undefined,
            failedStepInfo: '',
            timestamp: undefined,
          },
        });
      });

      it('should do nothing if pendingConfigs is empty', async () => {
        // Call the method with empty pendingConfigs
        await statusRule.schedulePendingAlertPerConfigIdPerLocation({ pendingConfigs: {} });

        // Verify scheduleAlert was not called
        expect(scheduleAlertSpy).not.toHaveBeenCalled();
      });
    });

    describe('schedulePendingAlertPerConfigId', () => {
      let scheduleAlertSpy: jest.SpyInstance;

      beforeEach(() => {
        // Set up statusRule with necessary parameters for getUngroupedPendingSummary
        statusRule.dateFormat = 'Y-MM-DD HH:mm:ss';
        statusRule.tz = 'UTC';
        statusRule.params = {
          condition: {
            alertOnNoData: true,
          } as any,
        };

        scheduleAlertSpy = jest.spyOn(statusRule, 'scheduleAlert');
      });

      afterEach(() => {
        jest.clearAllMocks();
      });

      it('should group configs by configId and call scheduleAlert with combined location information', async () => {
        // Call the method
        await statusRule.schedulePendingAlertPerConfigId({ pendingConfigs: mockPendingConfigs });

        // Verify scheduleAlert was called twice (once for each unique configId)
        expect(scheduleAlertSpy).toHaveBeenCalledTimes(2);

        expect(scheduleAlertSpy).toHaveBeenNthCalledWith(1, {
          alertId: MOCK_FIRST_MONITOR.id,
          idWithLocation: MOCK_FIRST_MONITOR.id,
          locationNames: [MOCK_FIRST_LOCATION.name],
          locationIds: [MOCK_FIRST_LOCATION.id],
          statusConfig: mockPendingConfigs[FIRST_CONFIG_ID],
          monitorSummary: {
            configId: MOCK_FIRST_MONITOR.id,
            downThreshold: 1,
            pendingThreshold: 2,
            locationId: MOCK_FIRST_LOCATION.id,
            locationName: MOCK_FIRST_LOCATION.name,
            locationNames: MOCK_FIRST_LOCATION.name,
            monitorId: MOCK_FIRST_MONITOR.id,
            monitorName: MOCK_FIRST_MONITOR.name,
            monitorTags: ['test', 'monitor1'],
            monitorType: MOCK_FIRST_MONITOR.type,
            monitorUrl: MOCK_FIRST_MONITOR.url,
            monitorUrlLabel: 'URL',
            reason: `Monitor "${MOCK_FIRST_MONITOR.name}" is pending 1 time from ${MOCK_FIRST_LOCATION.name}.`,
            status: 'pending',
            checkedAt: undefined,
            checks: undefined,
            hostName: undefined,
            labels: undefined,
            lastErrorMessage: undefined,
            lastErrorStack: undefined,
            serviceName: undefined,
            stateId: undefined,
            failedStepInfo: '',
            timestamp: undefined,
          },
        });
        expect(scheduleAlertSpy).toHaveBeenNthCalledWith(2, {
          alertId: MOCK_SECOND_MONITOR.id,
          idWithLocation: MOCK_SECOND_MONITOR.id,
          locationNames: [MOCK_SECOND_LOCATION.name],
          locationIds: [MOCK_SECOND_LOCATION.id],
          statusConfig: mockPendingConfigs[SECOND_CONFIG_ID],
          monitorSummary: {
            configId: MOCK_SECOND_MONITOR.id,
            downThreshold: 1,
            pendingThreshold: 2,
            locationId: MOCK_SECOND_LOCATION.id,
            locationName: MOCK_SECOND_LOCATION.name,
            locationNames: MOCK_SECOND_LOCATION.name,
            monitorId: MOCK_SECOND_MONITOR.id,
            monitorName: MOCK_SECOND_MONITOR.name,
            monitorTags: ['test', 'monitor2'],
            monitorType: 'HTTP',
            monitorUrl: MOCK_SECOND_MONITOR.url,
            monitorUrlLabel: 'URL',
            reason: `Monitor "${MOCK_SECOND_MONITOR.name}" is pending 1 time from ${MOCK_SECOND_LOCATION.name}.`,
            status: 'pending',
            checkedAt: undefined,
            checks: undefined,
            hostName: undefined,
            labels: undefined,
            lastErrorMessage: undefined,
            lastErrorStack: undefined,
            serviceName: undefined,
            stateId: undefined,
            failedStepInfo: '',
            timestamp: undefined,
          },
        });
      });

      it('should do nothing if pendingConfigs is empty', async () => {
        // Call the method with empty pendingConfigs
        await statusRule.schedulePendingAlertPerConfigId({ pendingConfigs: {} });

        // Verify scheduleAlert was not called
        expect(scheduleAlertSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('scheduleAlert', () => {
    const alertsClientMock = {
      report: jest.fn().mockReturnValue({ uuid: 'uuid-1', start: undefined }),
      setAlertData: jest.fn(),
      getRecoveredAlerts: jest.fn(),
    };

    beforeAll(async () => {
      // Wire the mocked alerts client into the executor
      (statusRule as any).options.services.alertsClient = alertsClientMock as any;
      (serverMock as any).basePath = { publicBaseUrl: 'http://localhost:5601' };
      (statusRule as any).options.spaceId = 'default';
      (statusRule as any).options.startedAt = new Date('2024-05-13T12:33:37.000Z');
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('adds grouping to both context and alert document when only one location', async () => {
      await statusRule.scheduleAlert({
        idWithLocation: 'config1-loc1',
        alertId: 'alert-1',
        monitorSummary: {
          configId: 'config1',
          monitorId: 'mon-1',
          monitorName: 'Test monitor',
          monitorType: 'browser',
          monitorUrl: 'https://example.com',
          monitorUrlLabel: 'URL',
          locationId: 'loc1',
          locationName: 'US Central QA',
          locationNames: 'US Central QA',
          hostName: 'host',
          reason: 'down',
          status: 'down',
          downThreshold: 1,
          timestamp: '2024-05-13T12:33:37.000Z',
          serviceName: 'service1',
        } as any,
        locationNames: ['US Central QA'],
        locationIds: ['loc1'],
        statusConfig: {
          configId: 'config1',
          locationId: 'loc1',
          ping: {} as any,
          checks: { downWithinXChecks: 1, down: 1 },
          status: 'down',
        } as any,
        downThreshold: 1,
      });

      const expectedGrouping = {
        location: { id: 'loc1' },
        monitor: { id: 'mon-1', config_id: 'config1' },
        service: { name: 'service1' },
      };

      // Verify grouping is present in context
      const [{ context, payload }] = alertsClientMock.setAlertData.mock.calls.map(([args]) => args);
      expect(context.grouping).toEqual(expectedGrouping);

      // Verify grouping is present in the alert document produced
      expect(payload[ALERT_GROUPING]).toEqual(expectedGrouping);
    });

    it('writes pendingCount as evaluation.value so it meets pendingThreshold', async () => {
      statusRule.params = {
        condition: {
          alertOnNoData: true,
          pendingThreshold: 2,
        } as any,
      };

      await statusRule.scheduleAlert({
        idWithLocation: 'config1-loc1',
        alertId: 'alert-pending-1',
        monitorSummary: {
          configId: 'config1',
          monitorId: 'mon-1',
          monitorName: 'Test monitor',
          monitorType: 'http',
          monitorUrl: 'https://example.com',
          monitorUrlLabel: 'URL',
          locationId: 'loc1',
          locationName: 'US Central QA',
          locationNames: 'US Central QA',
          hostName: 'host',
          reason: 'Monitor is pending',
          status: 'pending',
          downThreshold: 1,
          timestamp: '2024-05-13T12:33:37.000Z',
        } as any,
        locationNames: ['US Central QA'],
        locationIds: ['loc1'],
        statusConfig: {
          configId: 'config1',
          locationId: 'loc1',
          status: 'pending',
          monitorQueryId: 'mon-1',
          monitorInfo: {} as any,
          pendingCount: 2,
        },
      });

      const [{ payload }] = alertsClientMock.setAlertData.mock.calls.map(([args]) => args);
      expect(payload['kibana.alert.evaluation.threshold']).toBe(2);
      expect(payload['kibana.alert.evaluation.value']).toBe(2);
    });

    it('keeps down-alert evaluation.value from checks', async () => {
      await statusRule.scheduleAlert({
        idWithLocation: 'config1-loc1',
        alertId: 'alert-down-1',
        useLatestChecks: true,
        monitorSummary: {
          configId: 'config1',
          monitorId: 'mon-1',
          monitorName: 'Test monitor',
          monitorType: 'http',
          monitorUrl: 'https://example.com',
          monitorUrlLabel: 'URL',
          locationId: 'loc1',
          locationName: 'US Central QA',
          locationNames: 'US Central QA',
          hostName: 'host',
          reason: 'Monitor is down',
          status: 'down',
          downThreshold: 2,
          timestamp: '2024-05-13T12:33:37.000Z',
          checks: { downWithinXChecks: 3, down: 3 },
        } as any,
        locationNames: ['US Central QA'],
        locationIds: ['loc1'],
        statusConfig: {
          configId: 'config1',
          locationId: 'loc1',
          ping: {} as any,
          checks: { downWithinXChecks: 3, down: 3 },
          status: 'down',
        } as any,
        downThreshold: 2,
      });

      const [{ payload }] = alertsClientMock.setAlertData.mock.calls.map(([args]) => args);
      expect(payload['kibana.alert.evaluation.threshold']).toBe(2);
      expect(payload['kibana.alert.evaluation.value']).toBe(3);
    });
  });
});

describe('getDoesMonitorMeetLocationThreshold', () => {
  describe('when useTimeWindow is false', () => {
    it('should return false if monitor does not meets location threshold', () => {
      const matchesByLocation: AlertStatusMetaData[] = [
        {
          checks: { down: 0, downWithinXChecks: 0 },
          locationId: 'us_central_qa',
          latestPing: testPing,
          configId: 'id1',
          monitorQueryId: 'test',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
        },
      ];
      const res = getDoesMonitorMeetLocationThreshold({
        matchesByLocation,
        locationsThreshold: 1,
        downThreshold: 1,
        useTimeWindow: false,
      });
      expect(res).toBe(false);
    });

    it('should return true if monitor meets location threshold', () => {
      const matchesByLocation: AlertStatusMetaData[] = [
        {
          checks: { down: 1, downWithinXChecks: 1 },
          locationId: 'us_central_qa',
          latestPing: testPing,
          configId: 'id1',
          monitorQueryId: 'test',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
        },
      ];
      const res = getDoesMonitorMeetLocationThreshold({
        matchesByLocation,
        locationsThreshold: 1,
        downThreshold: 1,
        useTimeWindow: false,
      });
      expect(res).toBe(true);
    });

    it('should return false if monitor does not meets 2 location threshold', () => {
      const matchesByLocation: AlertStatusMetaData[] = [
        {
          checks: { down: 1, downWithinXChecks: 1 },
          locationId: 'us_central_qa',
          latestPing: testPing,
          configId: 'id1',
          monitorQueryId: 'test',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
        },
      ];
      const res = getDoesMonitorMeetLocationThreshold({
        matchesByLocation,
        locationsThreshold: 2,
        downThreshold: 1,
        useTimeWindow: false,
      });
      expect(res).toBe(false);
    });

    it('should return true if monitor meets 2 location threshold', () => {
      const matchesByLocation: AlertStatusMetaData[] = [
        {
          checks: { down: 1, downWithinXChecks: 1 },
          locationId: 'us_central_qa',
          latestPing: testPing,
          configId: 'id1',
          monitorQueryId: 'test',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
        },
        {
          checks: { down: 1, downWithinXChecks: 1 },
          locationId: 'us_central',
          latestPing: testPing,
          configId: 'id1',
          monitorQueryId: 'test',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
        },
      ];
      const res = getDoesMonitorMeetLocationThreshold({
        matchesByLocation,
        locationsThreshold: 2,
        downThreshold: 1,
        useTimeWindow: false,
      });
      expect(res).toBe(true);
    });
  });

  describe('when useTimeWindow is true', () => {
    it('should return false if monitor does not meets location threshold', () => {
      const matchesByLocation: AlertStatusMetaData[] = [
        {
          checks: { down: 0, downWithinXChecks: 0 },
          locationId: 'us_central_qa',
          latestPing: testPing,
          configId: 'id1',
          monitorQueryId: 'test',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
        },
      ];
      const res = getDoesMonitorMeetLocationThreshold({
        matchesByLocation,
        locationsThreshold: 1,
        downThreshold: 1,
        useTimeWindow: true,
      });
      expect(res).toBe(false);
    });

    it('should return true if monitor meets location threshold', () => {
      const matchesByLocation: AlertStatusMetaData[] = [
        {
          checks: { down: 1, downWithinXChecks: 0 },
          locationId: 'us_central_qa',
          latestPing: testPing,
          configId: 'id1',
          monitorQueryId: 'test',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
        },
      ];
      const res = getDoesMonitorMeetLocationThreshold({
        matchesByLocation,
        locationsThreshold: 1,
        downThreshold: 1,
        useTimeWindow: true,
      });
      expect(res).toBe(true);
    });

    it('should return false if monitor does not meets 2 location threshold', () => {
      const matchesByLocation: AlertStatusMetaData[] = [
        {
          checks: { down: 1, downWithinXChecks: 0 },
          locationId: 'us_central_qa',
          latestPing: testPing,
          configId: 'id1',
          monitorQueryId: 'test',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
        },
      ];
      const res = getDoesMonitorMeetLocationThreshold({
        matchesByLocation,
        locationsThreshold: 2,
        downThreshold: 1,
        useTimeWindow: true,
      });
      expect(res).toBe(false);
    });

    it('should return true if monitor meets 2 location threshold', () => {
      const matchesByLocation: AlertStatusMetaData[] = [
        {
          checks: { down: 1, downWithinXChecks: 0 },
          locationId: 'us_central_qa',
          latestPing: testPing,
          configId: 'id1',
          monitorQueryId: 'test',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
        },
        {
          checks: { down: 1, downWithinXChecks: 1 },
          locationId: 'us_central',
          latestPing: testPing,
          configId: 'id1',
          monitorQueryId: 'test',
          status: 'down',
          timestamp: '2021-06-01T00:00:00.000Z',
        },
      ];
      const res = getDoesMonitorMeetLocationThreshold({
        matchesByLocation,
        locationsThreshold: 2,
        downThreshold: 1,
        useTimeWindow: true,
      });
      expect(res).toBe(true);
    });
  });
});

const testMonitors = [
  {
    type: 'synthetics-monitor',
    id: 'id1',
    attributes: {
      type: 'browser',
      form_monitor_type: 'multistep',
      enabled: true,
      alert: { status: { enabled: false } },
      schedule: { unit: 'm', number: '10' },
      'service.name': '',
      config_id: 'id1',
      tags: [],
      timeout: null,
      name: 'https://www.google.com',
      locations: [
        {
          geo: { lon: -95.86, lat: 41.25 },
          isServiceManaged: true,
          id: 'us_central_qa',
          label: 'US Central QA',
        },
      ],
      namespace: 'test_monitor',
      origin: 'ui',
      journey_id: '',
      hash: '',
      id: 'id1',
      project_id: '',
      playwright_options: '',
      __ui: {
        script_source: { is_generated_script: false, file_name: '' },
      },
      'url.port': null,
      playwright_text_assertion: '',
      urls: 'https://www.google.com',
      screenshots: 'on',
      'filter_journeys.match': '',
      'filter_journeys.tags': [],
      ignore_https_errors: false,
      throttling: {
        id: 'custom',
        label: 'Custom',
        value: {
          download: '5',
          upload: '3',
          latency: '20',
        },
      },
      'ssl.certificate_authorities': '',
      'ssl.certificate': '',
      'ssl.verification_mode': 'full',
      'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
      revision: 3,
    },
    references: [],
    migrationVersion: { 'synthetics-monitor': '8.6.0' },
    coreMigrationVersion: '8.0.0',
    updated_at: '2023-02-23T21:19:21.041Z',
    created_at: '2023-02-23T21:04:19.579Z',
    version: 'WzY1MjUwLDNd',
    namespaces: ['test-monitor'],
    score: null,
    sort: ['https://www.google.com', 1889],
  },
] as any;

const testPing = {
  '@timestamp': '2024-05-13T12:33:37.000Z',
  monitor: {
    id: 'test',
    name: 'test monitor',
    type: 'browser',
  },
  tags: ['dev'],
  url: {
    full: 'https://www.google.com',
  },
  observer: {
    name: 'test',
    geo: {
      name: 'Test location',
    },
  },
} as any;
