/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { loggerMock } from '@kbn/logging-mocks';
import { savedObjectsClientMock, savedObjectsServiceMock } from '@kbn/core/server/mocks';
import { ProjectMonitorFormatter } from './project_monitor_formatter';
import type { Locations, PrivateLocation } from '../../../common/runtime_types';
import { ConfigKey, MonitorTypeEnum, LocationStatus } from '../../../common/runtime_types';
import { DEFAULT_FIELDS } from '../../../common/constants/monitor_defaults';
import { times } from 'lodash';
import { SyntheticsService } from '../synthetics_service';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { SyntheticsMonitorClient } from '../synthetics_monitor/synthetics_monitor_client';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { formatSecrets } from '../utils';

import * as telemetryHooks from '../../routes/telemetry/monitor_upgrade_sender';
import { formatLocation } from '../../../common/utils/location_formatter';
import * as locationsUtil from '../get_all_locations';
import { mockEncryptedSO } from '../utils/mocks';
import type { SyntheticsServerSetup } from '../../types';
import { MonitorConfigRepository } from '../../services/monitor_config_repository';

jest.mock('@kbn/fleet-plugin/server/services/package_policy', () => ({
  getPackagePolicySavedObjectType: jest.fn().mockResolvedValue('fleet-package-policies'),
}));

const testMonitors = [
  {
    type: 'browser',
    throttling: { download: 5, upload: 3, latency: 20 },
    schedule: 3,
    locations: [],
    privateLocations: ['Test private location'],
    params: { url: 'http://localhost:8080' },
    playwrightOptions: {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1',
      viewport: { width: 375, height: 667 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      headless: true,
    },
    name: 'check if title is present 10 0',
    id: 'check if title is present 10 0',
    tags: [],
    content:
      'UEsDBBQACAAIAAAAIQAAAAAAAAAAAAAAAAAQAAAAYmFzaWMuam91cm5leS50c2WQQU7DQAxF9znFV8QiUUOmXcCCUMQl2NdMnWbKJDMaO6Ilyt0JASQkNv9Z1teTZWNAIqwP5kU4iZGOug863u7uDXsSddbIddCOl0kMX6iPnsVoOAYxryTO1ucwpoGvtUrm+hiSYsLProIoxwp8iWwVM9oUeuTP/9V5k7UhofCscNhj2yx4xN2CzabElOHXWRxsx/YNroU69QwniImFB8Vui5vJzYcKxYRIJ66WTNQL5hL7p1WD9aYi9zQOtgPFGPNqecJ1sCj+tAB6J6erpj4FDcW3qh6TL5u1Mq/8yjn7BFBLBwhGDIWc4QAAAEkBAABQSwECLQMUAAgACAAAACEARgyFnOEAAABJAQAAEAAAAAAAAAAAACAApIEAAAAAYmFzaWMuam91cm5leS50c1BLBQYAAAAAAQABAD4AAAAfAQAAAAA=',
    filter: { match: 'check if title is present 10 0' },
    hash: 'lleklrkelkj',
  },
  {
    type: 'browser',
    throttling: { download: 5, upload: 3, latency: 20 },
    schedule: 3,
    locations: [],
    privateLocations: ['Test private location'],
    params: { url: 'http://localhost:8080' },
    playwrightOptions: {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1',
      viewport: { width: 375, height: 667 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      headless: true,
    },
    name: 'check if title is present 10 1',
    id: 'check if title is present 10 1',
    tags: [],
    content:
      'UEsDBBQACAAIAAAAIQAAAAAAAAAAAAAAAAAQAAAAYmFzaWMuam91cm5leS50c2WQQU7DQAxF9znFV8QiUUOmXcCCUMQl2NdMnWbKJDMaO6Ilyt0JASQkNv9Z1teTZWNAIqwP5kU4iZGOug863u7uDXsSddbIddCOl0kMX6iPnsVoOAYxryTO1ucwpoGvtUrm+hiSYsLProIoxwp8iWwVM9oUeuTP/9V5k7UhofCscNhj2yx4xN2CzabElOHXWRxsx/YNroU69QwniImFB8Vui5vJzYcKxYRIJ66WTNQL5hL7p1WD9aYi9zQOtgPFGPNqecJ1sCj+tAB6J6erpj4FDcW3qh6TL5u1Mq/8yjn7BFBLBwhGDIWc4QAAAEkBAABQSwECLQMUAAgACAAAACEARgyFnOEAAABJAQAAEAAAAAAAAAAAACAApIEAAAAAYmFzaWMuam91cm5leS50c1BLBQYAAAAAAQABAD4AAAAfAQAAAAA=',
    filter: { match: 'check if title is present 10 1' },
    hash: 'lleklrkelkj',
  },
];

const privateLocations = times(1).map((n) => {
  return {
    id: `loc-${n}`,
    label: 'Test private location',
    geo: {
      lat: 0,
      lon: 0,
    },
    isServiceManaged: false,
    agentPolicyId: `loc-${n}`,
  };
}) as PrivateLocation[];

describe('ProjectMonitorFormatter', () => {
  const mockEsClient = {
    search: jest.fn(),
  };
  const logger = loggerMock.create();

  const kibanaRequest = httpServerMock.createKibanaRequest();

  const soClient = savedObjectsClientMock.create();

  const serverMock: SyntheticsServerSetup = {
    logger,
    syntheticsEsClient: mockEsClient,
    authSavedObjectsClient: soClient,
    basePath: {
      publicBaseUrl: 'https://localhost:5601',
    },
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
    coreStart: {
      savedObjects: savedObjectsServiceMock.createStartContract(),
    },
    fleet: { runWithCache: async (cb: any) => await cb() },
  } as unknown as SyntheticsServerSetup;

  const syntheticsService = new SyntheticsService(serverMock);

  syntheticsService.addConfigs = jest.fn();
  syntheticsService.editConfig = jest.fn();
  syntheticsService.deleteConfigs = jest.fn();
  syntheticsService.getMaintenanceWindows = jest.fn();

  const encryptedSavedObjectsClient = encryptedSavedObjectsMock.createStart().getClient();

  const publicLocations = times(3).map((n) => {
    return {
      id: `loc-${n}`,
      label: `Location ${n}`,
      url: `https://example.com/${n}`,
      geo: {
        lat: 0,
        lon: 0,
      },
      isServiceManaged: true,
      status: LocationStatus.GA,
    };
  }) as Locations;

  const monitorClient = new SyntheticsMonitorClient(syntheticsService, serverMock);

  const routeContext = {
    savedObjectsClient: soClient,
    server: serverMock,
    syntheticsMonitorClient: monitorClient,
    request: kibanaRequest,
    monitorConfigRepository: new MonitorConfigRepository(soClient, encryptedSavedObjectsClient),
  } as any;

  jest.spyOn(locationsUtil, 'getAllLocations').mockImplementation(
    async () =>
      ({
        publicLocations,
        privateLocations,
      } as any)
  );

  it('should return validation errors errors', async () => {
    const pushMonitorFormatter = new ProjectMonitorFormatter({
      projectId: 'test-project',
      // @ts-ignore
      spaceId: 5,
      routeContext,
      encryptedSavedObjectsClient,
      monitors: [testMonitors[0]],
    });

    pushMonitorFormatter.getProjectMonitorsForProject = jest.fn().mockResolvedValue([]);

    await pushMonitorFormatter.configureAllProjectMonitors();

    expect({
      createdMonitors: pushMonitorFormatter.createdMonitors,
      updatedMonitors: pushMonitorFormatter.updatedMonitors,
      failedMonitors: pushMonitorFormatter.failedMonitors,
    }).toStrictEqual({
      createdMonitors: [],
      failedMonitors: [
        {
          details: 'spaceId.replace is not a function',
          id: 'check if title is present 10 0',
          payload: testMonitors[0],
          reason: 'Failed to create or update monitor',
        },
      ],
      updatedMonitors: [],
    });
  });
  it('should return invalid schedule error', async () => {
    const invalidMonitor = {
      ...testMonitors[0],
      schedule: '3m',
    };
    const pushMonitorFormatter = new ProjectMonitorFormatter({
      projectId: 'test-project',
      spaceId: 'default',
      routeContext,
      monitors: [invalidMonitor],
    });

    pushMonitorFormatter.getProjectMonitorsForProject = jest.fn().mockResolvedValue([]);

    await pushMonitorFormatter.configureAllProjectMonitors();

    expect({
      createdMonitors: pushMonitorFormatter.createdMonitors,
      updatedMonitors: pushMonitorFormatter.updatedMonitors,
      failedMonitors: pushMonitorFormatter.failedMonitors,
    }).toStrictEqual({
      createdMonitors: [],
      failedMonitors: [
        {
          details: 'Invalid value "3m" supplied to "schedule"',
          id: 'check if title is present 10 0',
          payload: invalidMonitor,
          reason: "Couldn't save or update monitor because of an invalid configuration.",
        },
      ],
      updatedMonitors: [],
    });
  });

  it('returns invalid location error without logging it as a server error', async () => {
    logger.error.mockClear();

    const invalidLocationMonitor = {
      ...testMonitors[0],
      locations: [],
      privateLocations: ['does not exist'],
    };
    const pushMonitorFormatter = new ProjectMonitorFormatter({
      projectId: 'test-project',
      spaceId: 'default',
      routeContext,
      monitors: [invalidLocationMonitor],
    });

    pushMonitorFormatter.getProjectMonitorsForProject = jest.fn().mockResolvedValue([]);

    await pushMonitorFormatter.configureAllProjectMonitors();

    expect({
      createdMonitors: pushMonitorFormatter.createdMonitors,
      updatedMonitors: pushMonitorFormatter.updatedMonitors,
      failedMonitors: pushMonitorFormatter.failedMonitors,
    }).toStrictEqual({
      createdMonitors: [],
      updatedMonitors: [],
      failedMonitors: [
        {
          details:
            "Invalid locations specified. Private Location(s) 'does not exist' not found. Available private locations are 'Test private location'",
          id: 'check if title is present 10 0',
          payload: invalidLocationMonitor,
          reason: "Couldn't save or update monitor because of an invalid configuration.",
        },
      ],
    });

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('catches errors from bulk edit method', async () => {
    soClient.bulkCreate.mockImplementation(async () => {
      return {
        saved_objects: [],
      };
    });

    const pushMonitorFormatter = new ProjectMonitorFormatter({
      projectId: 'test-project',
      spaceId: 'default-space',
      monitors: testMonitors,
      routeContext,
    });

    pushMonitorFormatter.getProjectMonitorsForProject = jest.fn().mockResolvedValue([]);

    await pushMonitorFormatter.configureAllProjectMonitors();

    expect({
      createdMonitors: pushMonitorFormatter.createdMonitors,
      updatedMonitors: pushMonitorFormatter.updatedMonitors,
      failedMonitors: pushMonitorFormatter.failedMonitors,
    }).toEqual({
      createdMonitors: [],
      updatedMonitors: [],
      failedMonitors: [
        {
          details: "Cannot read properties of undefined (reading 'buildPackagePolicyFromPackage')",
          payload: payloadData,
          reason: 'Failed to create 2 monitors',
        },
      ],
    });
  });

  it('configures project monitors when there are errors', async () => {
    soClient.bulkCreate = jest.fn().mockResolvedValue({ saved_objects: [] });

    const pushMonitorFormatter = new ProjectMonitorFormatter({
      projectId: 'test-project',
      spaceId: 'default-space',
      monitors: testMonitors,
      routeContext,
    });

    pushMonitorFormatter.getProjectMonitorsForProject = jest.fn().mockResolvedValue([]);

    await pushMonitorFormatter.configureAllProjectMonitors();

    expect({
      createdMonitors: pushMonitorFormatter.createdMonitors,
      updatedMonitors: pushMonitorFormatter.updatedMonitors,
      failedMonitors: pushMonitorFormatter.failedMonitors,
    }).toEqual({
      createdMonitors: [],
      updatedMonitors: [],
      failedMonitors: [
        {
          details: "Cannot read properties of undefined (reading 'buildPackagePolicyFromPackage')",
          payload: payloadData,
          reason: 'Failed to create 2 monitors',
        },
      ],
    });
  });

  it('shows errors thrown by fleet api', async () => {
    soClient.bulkCreate = jest.fn().mockResolvedValue({ saved_objects: soResult });

    const pushMonitorFormatter = new ProjectMonitorFormatter({
      projectId: 'test-project',
      spaceId: 'default-space',
      monitors: testMonitors,
      routeContext,
    });

    pushMonitorFormatter.getProjectMonitorsForProject = jest.fn().mockResolvedValue([]);

    await pushMonitorFormatter.configureAllProjectMonitors();

    expect({
      createdMonitors: pushMonitorFormatter.createdMonitors,
      updatedMonitors: pushMonitorFormatter.updatedMonitors,
      failedMonitors: pushMonitorFormatter.failedMonitors,
    }).toEqual({
      createdMonitors: [],
      updatedMonitors: [],
      failedMonitors: [
        {
          details: "Cannot read properties of undefined (reading 'buildPackagePolicyFromPackage')",
          reason: 'Failed to create 2 monitors',
          payload: payloadData,
        },
      ],
    });
  });

  it('creates project monitors when no errors', async () => {
    soClient.bulkCreate = jest.fn().mockResolvedValue({ saved_objects: soResult });

    monitorClient.addMonitors = jest.fn().mockReturnValue([]);

    const telemetrySpy = jest
      .spyOn(telemetryHooks, 'sendTelemetryEvents')
      .mockImplementation(jest.fn());

    const pushMonitorFormatter = new ProjectMonitorFormatter({
      projectId: 'test-project',
      spaceId: 'default-space',
      monitors: testMonitors,
      routeContext,
    });

    pushMonitorFormatter.getProjectMonitorsForProject = jest.fn().mockResolvedValue([]);

    await pushMonitorFormatter.configureAllProjectMonitors();

    expect(soClient.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          ...soData[0],
          attributes: {
            ...soData[0].attributes,
            [ConfigKey.MONITOR_QUERY_ID]: expect.any(String),
            [ConfigKey.CONFIG_ID]: expect.any(String),
          },
        }),
        expect.objectContaining({
          ...soData[1],
          attributes: {
            ...soData[1].attributes,
            [ConfigKey.MONITOR_QUERY_ID]: expect.any(String),
            [ConfigKey.CONFIG_ID]: expect.any(String),
          },
        }),
      ])
    );

    expect(telemetrySpy).toHaveBeenCalledTimes(2);

    expect({
      createdMonitors: pushMonitorFormatter.createdMonitors,
      updatedMonitors: pushMonitorFormatter.updatedMonitors,
      failedMonitors: pushMonitorFormatter.failedMonitors,
    }).toEqual({
      createdMonitors: ['check if title is present 10 0', 'check if title is present 10 1'],
      updatedMonitors: [],
      failedMonitors: [],
    });
  });

  describe('API Journey monitors on Serverless', () => {
    const apiMonitor = {
      type: MonitorTypeEnum.API,
      id: 'orders-api-health',
      name: 'Orders API health',
      schedule: 1,
      content: 'apiJourney("orders", () => {})',
      privateLocations: ['Test private location'],
    };

    const serverlessRouteContext = {
      ...routeContext,
      server: { ...serverMock, cloud: { isServerlessEnabled: true } },
    };

    it('rejects a brand-new API Journey project monitor', async () => {
      const pushMonitorFormatter = new ProjectMonitorFormatter({
        projectId: 'test-project',
        spaceId: 'default-space',
        monitors: [],
        routeContext: serverlessRouteContext,
      });
      pushMonitorFormatter.getProjectMonitorsForProject = jest.fn().mockResolvedValue([]);
      await pushMonitorFormatter.init();

      const result = pushMonitorFormatter.validateProjectMonitor({
        monitor: apiMonitor,
        publicLocations,
        privateLocations,
        isNewMonitor: true,
      });

      expect(result).toBeNull();
      expect(pushMonitorFormatter.failedMonitors).toEqual([
        expect.objectContaining({
          id: 'orders-api-health',
          reason: 'API Journey monitors are not yet supported on Serverless',
        }),
      ]);
    });

    it('allows re-pushing an already-existing API Journey project monitor unchanged', async () => {
      const pushMonitorFormatter = new ProjectMonitorFormatter({
        projectId: 'test-project',
        spaceId: 'default-space',
        monitors: [],
        routeContext: serverlessRouteContext,
      });
      pushMonitorFormatter.getProjectMonitorsForProject = jest.fn().mockResolvedValue([]);
      await pushMonitorFormatter.init();

      const result = pushMonitorFormatter.validateProjectMonitor({
        monitor: apiMonitor,
        publicLocations,
        privateLocations,
        isNewMonitor: false,
      });

      expect(result).not.toBeNull();
      expect(pushMonitorFormatter.failedMonitors).toEqual([]);
    });
  });
});

const payloadData = [
  {
    ...DEFAULT_FIELDS[MonitorTypeEnum.BROWSER],
    __ui: {
      script_source: {
        file_name: '',
        is_generated_script: false,
      },
    },
    config_id: '',
    custom_heartbeat_id: 'check if title is present 10 0-test-project-default-space',
    enabled: true,
    'filter_journeys.match': 'check if title is present 10 0',
    'filter_journeys.tags': [],
    form_monitor_type: 'multistep',
    ignore_https_errors: false,
    journey_id: 'check if title is present 10 0',
    locations: privateLocations.map((l) => formatLocation(l)),
    name: 'check if title is present 10 0',
    namespace: 'default_space',
    origin: 'project',
    original_space: 'default-space',
    params: '{"url":"http://localhost:8080"}',
    playwright_options:
      '{"userAgent":"Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1","viewport":{"width":375,"height":667},"deviceScaleFactor":2,"isMobile":true,"hasTouch":true,"headless":true}',
    playwright_text_assertion: '',
    project_id: 'test-project',
    schedule: {
      number: '3',
      unit: 'm',
    },
    screenshots: 'on',
    'service.name': '',
    'source.inline.script': '',
    'source.project.content':
      'UEsDBBQACAAIAAAAIQAAAAAAAAAAAAAAAAAQAAAAYmFzaWMuam91cm5leS50c2WQQU7DQAxF9znFV8QiUUOmXcCCUMQl2NdMnWbKJDMaO6Ilyt0JASQkNv9Z1teTZWNAIqwP5kU4iZGOug863u7uDXsSddbIddCOl0kMX6iPnsVoOAYxryTO1ucwpoGvtUrm+hiSYsLProIoxwp8iWwVM9oUeuTP/9V5k7UhofCscNhj2yx4xN2CzabElOHXWRxsx/YNroU69QwniImFB8Vui5vJzYcKxYRIJ66WTNQL5hL7p1WD9aYi9zQOtgPFGPNqecJ1sCj+tAB6J6erpj4FDcW3qh6TL5u1Mq/8yjn7BFBLBwhGDIWc4QAAAEkBAABQSwECLQMUAAgACAAAACEARgyFnOEAAABJAQAAEAAAAAAAAAAAACAApIEAAAAAYmFzaWMuam91cm5leS50c1BLBQYAAAAAAQABAD4AAAAfAQAAAAA=',
    'ssl.certificate': '',
    'ssl.certificate_authorities': '',
    'ssl.key': '',
    'ssl.key_passphrase': '',
    'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
    'ssl.verification_mode': 'full',
    synthetics_args: [],
    tags: [],
    timeout: null,
    type: 'browser',
    'url.port': null,
    urls: '',
    id: '',
    hash: 'lleklrkelkj',
  },
  {
    ...DEFAULT_FIELDS[MonitorTypeEnum.BROWSER],
    __ui: {
      script_source: {
        file_name: '',
        is_generated_script: false,
      },
    },
    config_id: '',
    custom_heartbeat_id: 'check if title is present 10 1-test-project-default-space',
    enabled: true,
    'filter_journeys.match': 'check if title is present 10 1',
    'filter_journeys.tags': [],
    form_monitor_type: 'multistep',
    ignore_https_errors: false,
    journey_id: 'check if title is present 10 1',
    locations: privateLocations.map((l) => formatLocation(l)),
    name: 'check if title is present 10 1',
    namespace: 'default_space',
    origin: 'project',
    original_space: 'default-space',
    params: '{"url":"http://localhost:8080"}',
    playwright_options:
      '{"userAgent":"Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1","viewport":{"width":375,"height":667},"deviceScaleFactor":2,"isMobile":true,"hasTouch":true,"headless":true}',
    playwright_text_assertion: '',
    project_id: 'test-project',
    schedule: {
      number: '3',
      unit: 'm',
    },
    screenshots: 'on',
    'service.name': '',
    'source.inline.script': '',
    'source.project.content':
      'UEsDBBQACAAIAAAAIQAAAAAAAAAAAAAAAAAQAAAAYmFzaWMuam91cm5leS50c2WQQU7DQAxF9znFV8QiUUOmXcCCUMQl2NdMnWbKJDMaO6Ilyt0JASQkNv9Z1teTZWNAIqwP5kU4iZGOug863u7uDXsSddbIddCOl0kMX6iPnsVoOAYxryTO1ucwpoGvtUrm+hiSYsLProIoxwp8iWwVM9oUeuTP/9V5k7UhofCscNhj2yx4xN2CzabElOHXWRxsx/YNroU69QwniImFB8Vui5vJzYcKxYRIJ66WTNQL5hL7p1WD9aYi9zQOtgPFGPNqecJ1sCj+tAB6J6erpj4FDcW3qh6TL5u1Mq/8yjn7BFBLBwhGDIWc4QAAAEkBAABQSwECLQMUAAgACAAAACEARgyFnOEAAABJAQAAEAAAAAAAAAAAACAApIEAAAAAYmFzaWMuam91cm5leS50c1BLBQYAAAAAAQABAD4AAAAfAQAAAAA=',
    'ssl.certificate': '',
    'ssl.certificate_authorities': '',
    'ssl.key': '',
    'ssl.key_passphrase': '',
    'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
    'ssl.verification_mode': 'full',
    synthetics_args: [],
    tags: [],
    timeout: null,
    type: 'browser',
    'url.port': null,
    urls: '',
    id: '',
    hash: 'lleklrkelkj',
  },
];

const soData = [
  {
    attributes: formatSecrets({
      ...payloadData[0],
      revision: 1,
    } as any),
    type: 'synthetics-monitor-multi-space',
  },
  {
    attributes: formatSecrets({
      ...payloadData[1],
      revision: 1,
    } as any),
    type: 'synthetics-monitor-multi-space',
  },
];

const soResult = soData.map((so) => ({ id: 'test-id', ...so }));
