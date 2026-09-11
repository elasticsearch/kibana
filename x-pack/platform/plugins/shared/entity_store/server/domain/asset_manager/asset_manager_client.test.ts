/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ElasticsearchClient,
  KibanaRequest,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import { loggerMock } from '@kbn/logging-mocks';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import { AssetManagerClient } from './asset_manager_client';
import { LATEST_LOG_EXTRACTION_DEFAULTS } from '../saved_objects/global_state/constants';
import {
  installSharedElasticsearchAssets,
  installIndicesAndDataStreams,
  uninstallElasticsearchAssets,
} from './install_assets';
import { scheduleExtractEntityTask, stopExtractEntityTask } from '../../tasks/extract_entity_task';
import {
  scheduleHistorySnapshotTasks,
  stopHistorySnapshotTask,
} from '../../tasks/history_snapshot_task';
import { scheduleStatusReportTask, stopStatusReportTask } from '../../tasks/status_report_task';
import { scheduleResilienceTask, stopResilienceTask } from '../../tasks/resilience_task';
import { removeEntityMaintainer } from '../../tasks/entity_maintainers';
import { entityMaintainersRegistry } from '../../tasks/entity_maintainers/entity_maintainers_registry';
import { stopAndRemoveV1, stopAndRemoveV1SharedTasks } from '../../infra/remove_v1';

jest.mock('./install_assets');
jest.mock('../../tasks/extract_entity_task');
jest.mock('../../tasks/history_snapshot_task');
jest.mock('../../tasks/status_report_task');
jest.mock('../../tasks/resilience_task');
jest.mock('../../tasks/entity_maintainers', () => ({
  removeEntityMaintainer: jest.fn(),
}));
jest.mock('../../tasks/entity_maintainers/entity_maintainers_registry', () => ({
  entityMaintainersRegistry: {
    getAll: jest.fn(),
  },
}));
jest.mock('../../infra/remove_v1');

const mockInstallSharedElasticsearchAssets =
  installSharedElasticsearchAssets as jest.MockedFunction<typeof installSharedElasticsearchAssets>;
const mockInstallIndicesAndDataStreams = installIndicesAndDataStreams as jest.MockedFunction<
  typeof installIndicesAndDataStreams
>;
const mockUninstallElasticsearchAssets = uninstallElasticsearchAssets as jest.MockedFunction<
  typeof uninstallElasticsearchAssets
>;
const mockScheduleExtractEntityTask = scheduleExtractEntityTask as jest.MockedFunction<
  typeof scheduleExtractEntityTask
>;
const mockStopExtractEntityTask = stopExtractEntityTask as jest.MockedFunction<
  typeof stopExtractEntityTask
>;
const mockScheduleHistorySnapshotTasks = scheduleHistorySnapshotTasks as jest.MockedFunction<
  typeof scheduleHistorySnapshotTasks
>;
const mockStopHistorySnapshotTask = stopHistorySnapshotTask as jest.MockedFunction<
  typeof stopHistorySnapshotTask
>;
const mockScheduleStatusReportTask = scheduleStatusReportTask as jest.MockedFunction<
  typeof scheduleStatusReportTask
>;
const mockStopStatusReportTask = stopStatusReportTask as jest.MockedFunction<
  typeof stopStatusReportTask
>;
const mockScheduleResilienceTask = scheduleResilienceTask as jest.MockedFunction<
  typeof scheduleResilienceTask
>;
const mockStopResilienceTask = stopResilienceTask as jest.MockedFunction<typeof stopResilienceTask>;
const mockRemoveEntityMaintainer = removeEntityMaintainer as jest.MockedFunction<
  typeof removeEntityMaintainer
>;
const mockEntityMaintainersGetAll = entityMaintainersRegistry.getAll as jest.MockedFunction<
  typeof entityMaintainersRegistry.getAll
>;
const mockStopAndRemoveV1 = stopAndRemoveV1 as jest.MockedFunction<typeof stopAndRemoveV1>;
const mockStopAndRemoveV1SharedTasks = stopAndRemoveV1SharedTasks as jest.MockedFunction<
  typeof stopAndRemoveV1SharedTasks
>;

describe('AssetManagerClient', () => {
  const namespace = 'default';

  let client: AssetManagerClient;
  let mockUserEsClient: jest.Mocked<ElasticsearchClient>;
  let mockInternalEsClient: jest.Mocked<ElasticsearchClient>;
  let mockEngineDescriptorClient: {
    getAll: jest.Mock;
    init: jest.Mock;
    findOrThrow: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let mockGlobalStateClient: {
    init: jest.Mock;
    findOrThrow: jest.Mock;
    find: jest.Mock;
    findLogExtractionOverrides: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockInstallSharedElasticsearchAssets.mockResolvedValue(undefined);
    mockInstallIndicesAndDataStreams.mockResolvedValue(undefined);
    mockUninstallElasticsearchAssets.mockResolvedValue(undefined);
    mockScheduleExtractEntityTask.mockResolvedValue(undefined);
    mockStopExtractEntityTask.mockResolvedValue(undefined);
    mockScheduleHistorySnapshotTasks.mockResolvedValue(undefined);
    mockStopHistorySnapshotTask.mockResolvedValue(undefined);
    mockScheduleStatusReportTask.mockResolvedValue(undefined);
    mockStopStatusReportTask.mockResolvedValue(undefined);
    mockScheduleResilienceTask.mockResolvedValue(undefined);
    mockStopResilienceTask.mockResolvedValue(undefined);
    mockRemoveEntityMaintainer.mockResolvedValue(undefined);
    mockEntityMaintainersGetAll.mockReturnValue([
      { id: 'automated-resolution', interval: '1h', minLicense: 'basic' },
      { id: 'risk-score', interval: '1h', minLicense: 'platinum' },
    ]);
    mockStopAndRemoveV1.mockResolvedValue(undefined);
    mockStopAndRemoveV1SharedTasks.mockResolvedValue(undefined);

    mockEngineDescriptorClient = {
      getAll: jest.fn().mockResolvedValue([]),
      init: jest.fn().mockResolvedValue(undefined),
      findOrThrow: jest.fn().mockResolvedValue({ type: 'user', status: 'started' }),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    mockGlobalStateClient = {
      init: jest.fn().mockResolvedValue({
        historySnapshot: { status: 'started', frequency: '24h' },
        logsExtraction: LATEST_LOG_EXTRACTION_DEFAULTS,
      }),
      findOrThrow: jest.fn().mockResolvedValue({
        historySnapshot: {},
        logsExtraction: {},
      }),
      find: jest.fn().mockResolvedValue(undefined),
      findLogExtractionOverrides: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    mockUserEsClient = {} as jest.Mocked<ElasticsearchClient>;
    mockInternalEsClient = {} as jest.Mocked<ElasticsearchClient>;

    client = new AssetManagerClient({
      logger: loggerMock.create(),
      esClient: mockUserEsClient,
      internalEsClient: mockInternalEsClient,
      taskManager: {} as jest.Mocked<TaskManagerStartContract>,
      engineDescriptorClient:
        mockEngineDescriptorClient as unknown as import('../saved_objects').EngineDescriptorClient,
      globalStateClient:
        mockGlobalStateClient as unknown as import('../saved_objects').EntityStoreGlobalStateClient,
      namespace,
      isServerless: false,
      logsExtractionClient: {} as unknown as import('../logs_extraction').LogsExtractionClient,
      security: {} as SecurityPluginStart,
      analytics: {
        reportEvent: jest.fn(),
      } as unknown as import('../../telemetry/events').TelemetryReporter,
      savedObjectsClient: {
        delete: jest.fn().mockResolvedValue({}),
      } as unknown as SavedObjectsClientContract,
    });
  });

  it('creates shared indices and data streams once during init', async () => {
    await client.init({} as KibanaRequest, ['host', 'user']);

    expect(mockInstallSharedElasticsearchAssets).toHaveBeenCalledTimes(1);
    expect(mockInstallIndicesAndDataStreams).not.toHaveBeenCalled();
    expect(mockEngineDescriptorClient.init).toHaveBeenCalledTimes(2);
    expect(mockEngineDescriptorClient.init).toHaveBeenCalledWith('host');
    expect(mockEngineDescriptorClient.init).toHaveBeenCalledWith('user');
    expect(mockScheduleExtractEntityTask).toHaveBeenCalledTimes(2);
  });

  it('schedules status and history tasks only after engine descriptors exist', async () => {
    const order: string[] = [];
    mockEngineDescriptorClient.init.mockImplementation(async () => {
      order.push('descriptor');
    });
    mockScheduleStatusReportTask.mockImplementation(async () => {
      order.push('status');
    });
    mockScheduleHistorySnapshotTasks.mockImplementation(async () => {
      order.push('history');
    });

    await client.init({} as KibanaRequest, ['host', 'user']);

    const lastDescriptor = order.lastIndexOf('descriptor');
    expect(lastDescriptor).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('status')).toBeGreaterThan(lastDescriptor);
    expect(order.indexOf('history')).toBeGreaterThan(lastDescriptor);
  });

  it('runs v1 cleanup as the internal user', async () => {
    await client.init({} as KibanaRequest, ['host', 'user']);

    // Legacy v1 cleanup must not require the enabling user to hold transform/enrich
    // privileges, so it runs as the internal/system user.
    // Reference-equality (toBe) matters here: both mock clients are `{}` and would be
    // structurally equal under objectContaining.
    expect(mockStopAndRemoveV1).toHaveBeenCalled();
    mockStopAndRemoveV1.mock.calls.forEach(([arg]) => {
      expect(arg.esClient).toBe(mockInternalEsClient);
      expect(arg.esClient).not.toBe(mockUserEsClient);
    });
  });

  it('runs legacy security asset migration as the internal user', async () => {
    await client.init({} as KibanaRequest, ['host']);

    expect(mockInstallSharedElasticsearchAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        esClient: mockUserEsClient,
        migrationEsClient: mockInternalEsClient,
        namespace,
      })
    );
  });

  it('does not recreate shared indices or data streams during per-type install', async () => {
    const installed = await client.install('host');

    expect(installed).toBe(true);
    expect(mockEngineDescriptorClient.init).toHaveBeenCalledWith('host');
    expect(mockInstallIndicesAndDataStreams).not.toHaveBeenCalled();
    expect(mockEngineDescriptorClient.update).not.toHaveBeenCalled();
  });

  describe('getPrivileges', () => {
    let checkPrivilegesWithRequestMock: jest.Mock;
    let getLocalIndexPatternsMock: jest.Mock;
    let getPrivilegesClient: AssetManagerClient;

    beforeEach(() => {
      checkPrivilegesWithRequestMock = jest.fn().mockResolvedValue({});
      getLocalIndexPatternsMock = jest.fn();

      getPrivilegesClient = new AssetManagerClient({
        logger: loggerMock.create(),
        esClient: {} as jest.Mocked<ElasticsearchClient>,
        internalEsClient: {} as jest.Mocked<ElasticsearchClient>,
        taskManager: {} as jest.Mocked<TaskManagerStartContract>,
        engineDescriptorClient:
          mockEngineDescriptorClient as unknown as import('../saved_objects').EngineDescriptorClient,
        globalStateClient:
          mockGlobalStateClient as unknown as import('../saved_objects').EntityStoreGlobalStateClient,
        namespace,
        isServerless: false,
        logsExtractionClient: {
          getLocalIndexPatterns: getLocalIndexPatternsMock,
        } as unknown as import('../logs_extraction').LogsExtractionClient,
        security: {
          authz: {
            checkPrivilegesDynamicallyWithRequest: jest
              .fn()
              .mockReturnValue(checkPrivilegesWithRequestMock),
            actions: {
              savedObject: {
                get: jest.fn().mockReturnValue('some-kibana-privilege'),
              },
            },
          },
        } as unknown as SecurityPluginStart,
        analytics: {
          reportEvent: jest.fn(),
        } as unknown as import('../../telemetry/events').TelemetryReporter,
        savedObjectsClient: {} as SavedObjectsClientContract,
      });
    });

    it('strips negative index patterns before forwarding to _has_privileges', async () => {
      getLocalIndexPatternsMock.mockResolvedValue([
        'logs-*',
        '-logs-cloud_security_posture.*',
        '.entities.entities-default',
        '-logs-excluded-*',
      ]);

      await getPrivilegesClient.getPrivileges({} as KibanaRequest);

      const [calledWith] = checkPrivilegesWithRequestMock.mock.calls[0];
      const indexKeys = Object.keys(calledWith.elasticsearch.index);

      expect(indexKeys.every((key) => !key.startsWith('-'))).toBe(true);
      expect(indexKeys).toContain('logs-*');
      expect(indexKeys).toContain('.entities.entities-default');
      expect(indexKeys).not.toContain('-logs-cloud_security_posture.*');
      expect(indexKeys).not.toContain('-logs-excluded-*');
    });

    it('checks the cluster + target assets that install creates as the requesting user', async () => {
      // The updates data stream is also returned as an extraction source.
      getLocalIndexPatternsMock.mockResolvedValue(['logs-*', '.entities.v2.updates.default']);
      checkPrivilegesWithRequestMock.mockResolvedValue({ hasAllRequested: true });

      await getPrivilegesClient.getPrivileges({} as KibanaRequest);

      expect(checkPrivilegesWithRequestMock).toHaveBeenCalledTimes(1);
      const [calledWith] = checkPrivilegesWithRequestMock.mock.calls[0];

      // Ingest pipelines + templates are both created during install.
      expect(calledWith.elasticsearch.cluster).toEqual(
        expect.arrayContaining(['manage_index_templates', 'manage_ingest_pipelines'])
      );

      // The concrete latest index + its alias, and the updates/metadata data streams.
      const indexKeys = Object.keys(calledWith.elasticsearch.index);
      expect(indexKeys).toContain('entities-latest-default');
      expect(indexKeys).toContain('.entities.v2.latest.default-*');
      expect(indexKeys).toContain('.entities.v2.updates.default');
      expect(indexKeys).toContain('.entities.v2.metadata.default');
      expect(calledWith.elasticsearch.index['.entities.v2.latest.default-*']).toEqual(
        expect.arrayContaining(['manage'])
      );
      // Updates data stream is both a target (manage) and a source (view_index_metadata);
      // privileges must be unioned, not overwritten.
      expect(calledWith.elasticsearch.index['.entities.v2.updates.default']).toEqual(
        expect.arrayContaining(['manage', 'view_index_metadata'])
      );
    });

    it('falls back to legacy security_* target names when neutral privileges fail', async () => {
      getLocalIndexPatternsMock.mockResolvedValue(['logs-*']);
      checkPrivilegesWithRequestMock
        .mockResolvedValueOnce({
          hasAllRequested: false,
          privileges: { elasticsearch: {}, kibana: [] },
        })
        .mockResolvedValueOnce({
          hasAllRequested: true,
          privileges: { elasticsearch: {}, kibana: [] },
        });

      const result = await getPrivilegesClient.getPrivileges({} as KibanaRequest);

      expect(result.hasAllRequested).toBe(true);
      expect(checkPrivilegesWithRequestMock).toHaveBeenCalledTimes(2);

      const [, legacyCall] = checkPrivilegesWithRequestMock.mock.calls;
      const legacyIndexKeys = Object.keys(legacyCall[0].elasticsearch.index);
      expect(legacyIndexKeys).toContain('entities-latest-default');
      expect(legacyIndexKeys).toContain('.entities.v2.latest.security_default-*');
      expect(legacyIndexKeys).toContain('.entities.v2.updates.security_default');
      expect(legacyIndexKeys).toContain('.entities.v2.metadata.security_default');
      expect(legacyIndexKeys).not.toContain('.entities.v2.latest.default-*');
    });
  });

  describe('uninstall', () => {
    // getAll is called twice: once via getStatus (before delete) and once for
    // remainingEngines (after delete). Sequence the mock accordingly.
    it('keeps shared assets when other engines remain (see: https://github.com/elastic/security-team/issues/18143)', async () => {
      mockEngineDescriptorClient.getAll
        .mockResolvedValueOnce([
          { type: 'host', status: 'started' },
          { type: 'user', status: 'started' },
        ])
        .mockResolvedValueOnce([{ type: 'user', status: 'started' }]);

      const result = await client.uninstall('host');

      expect(result).toBe(true);
      expect(mockStopExtractEntityTask).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'host', namespace })
      );
      expect(mockEngineDescriptorClient.delete).toHaveBeenCalledWith('host');
      // Shared, per-namespace / cluster assets must survive.
      expect(mockUninstallElasticsearchAssets).not.toHaveBeenCalled();
      expect(mockGlobalStateClient.delete).not.toHaveBeenCalled();
      expect(mockStopHistorySnapshotTask).not.toHaveBeenCalled();
      expect(mockStopStatusReportTask).not.toHaveBeenCalled();
      expect(mockRemoveEntityMaintainer).not.toHaveBeenCalled();
    });

    it('deletes shared assets when the last engine is uninstalled', async () => {
      mockEngineDescriptorClient.getAll
        .mockResolvedValueOnce([{ type: 'host', status: 'started' }])
        .mockResolvedValueOnce([]);

      const result = await client.uninstall('host');

      expect(result).toBe(true);
      expect(mockEngineDescriptorClient.delete).toHaveBeenCalledWith('host');
      expect(mockStopHistorySnapshotTask).toHaveBeenCalledWith(
        expect.objectContaining({ namespace })
      );
      expect(mockStopStatusReportTask).toHaveBeenCalledWith(expect.objectContaining({ namespace }));
      expect(mockRemoveEntityMaintainer).toHaveBeenCalled();
      expect(mockUninstallElasticsearchAssets).toHaveBeenCalledWith(
        expect.objectContaining({ esClient: mockUserEsClient, namespace })
      );
      expect(mockGlobalStateClient.delete).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when the type is not installed', async () => {
      mockEngineDescriptorClient.getAll.mockResolvedValueOnce([
        { type: 'user', status: 'started' },
      ]);

      const result = await client.uninstall('host');

      expect(result).toBe(false);
      expect(mockEngineDescriptorClient.delete).not.toHaveBeenCalled();
      expect(mockStopExtractEntityTask).not.toHaveBeenCalled();
      expect(mockUninstallElasticsearchAssets).not.toHaveBeenCalled();
    });
  });

  describe('cleanupNamespace', () => {
    it('removes namespace tasks, ES assets, and global state', async () => {
      await client.cleanupNamespace();

      expect(mockStopHistorySnapshotTask).toHaveBeenCalledWith(
        expect.objectContaining({ namespace })
      );
      expect(mockStopStatusReportTask).toHaveBeenCalledWith(expect.objectContaining({ namespace }));
      expect(mockRemoveEntityMaintainer).toHaveBeenCalledTimes(2);
      expect(mockRemoveEntityMaintainer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'automated-resolution', namespace })
      );
      expect(mockRemoveEntityMaintainer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'risk-score', namespace })
      );
      expect(mockUninstallElasticsearchAssets).toHaveBeenCalledWith(
        expect.objectContaining({ esClient: mockUserEsClient, namespace })
      );
      expect(mockGlobalStateClient.delete).toHaveBeenCalledTimes(1);
      expect(mockStopExtractEntityTask).not.toHaveBeenCalled();
    });
  });

  describe('logsExtraction resolution on install', () => {
    // Resolution (merging params with existing/defaults) is globalStateClient's responsibility.
    // AssetManagerClient passes provided params through unchanged.

    it('passes undefined logsExtraction when no params are provided', async () => {
      await client.init({} as KibanaRequest, ['host']);

      expect(mockGlobalStateClient.init).toHaveBeenCalledWith(
        expect.objectContaining({ logsExtraction: undefined })
      );
    });

    it('passes provided params directly as logsExtraction overrides', async () => {
      await client.init({} as KibanaRequest, ['host'], { delay: '2m', frequency: '1m' });

      expect(mockGlobalStateClient.init).toHaveBeenCalledWith(
        expect.objectContaining({ logsExtraction: { delay: '2m', frequency: '1m' } })
      );
    });

    it('passes empty object when empty params are provided', async () => {
      await client.init({} as KibanaRequest, ['host'], {});

      expect(mockGlobalStateClient.init).toHaveBeenCalledWith(
        expect.objectContaining({ logsExtraction: {} })
      );
    });

    it('passes partial params as overrides, not expanded to full config', async () => {
      await client.init({} as KibanaRequest, ['host'], { delay: '2m' });

      expect(mockGlobalStateClient.init).toHaveBeenCalledWith(
        expect.objectContaining({ logsExtraction: { delay: '2m' } })
      );
    });
  });
});

describe('AssetManagerClient.reinstallSharedAssetsIfMissing', () => {
  const namespace = 'default';

  let client: AssetManagerClient;
  let mockUserEsClient: jest.Mocked<ElasticsearchClient>;
  let mockLogger: ReturnType<typeof loggerMock.create>;

  const buildClient = (
    overrides: Partial<{
      latestExists: boolean;
      metadataExists: boolean;
    }> = {}
  ) => {
    const { latestExists = true, metadataExists = true } = overrides;

    mockUserEsClient = {
      indices: {
        exists: jest.fn().mockResolvedValue(latestExists),
        getDataStream: jest.fn().mockImplementation(async ({ name }: { name: string }) => {
          return metadataExists ? { data_streams: [{ name }] } : { data_streams: [] };
        }),
      },
    } as unknown as jest.Mocked<ElasticsearchClient>;

    mockLogger = loggerMock.create();

    client = new AssetManagerClient({
      logger: mockLogger,
      esClient: mockUserEsClient,
      internalEsClient: {} as jest.Mocked<ElasticsearchClient>,
      taskManager: {} as jest.Mocked<TaskManagerStartContract>,
      engineDescriptorClient: {
        getAll: jest.fn().mockResolvedValue([]),
        init: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      } as unknown as import('../saved_objects').EngineDescriptorClient,
      globalStateClient: {
        init: jest.fn(),
        findOrThrow: jest.fn(),
        find: jest.fn(),
        findLogExtractionOverrides: jest.fn().mockResolvedValue({}),
        delete: jest.fn(),
      } as unknown as import('../saved_objects').EntityStoreGlobalStateClient,
      namespace,
      isServerless: false,
      logsExtractionClient: {} as unknown as import('../logs_extraction').LogsExtractionClient,
      security: {} as import('@kbn/security-plugin/server').SecurityPluginStart,
      analytics: {
        reportEvent: jest.fn(),
      } as unknown as import('../../telemetry/events').TelemetryReporter,
      savedObjectsClient: {} as SavedObjectsClientContract,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockInstallSharedElasticsearchAssets.mockResolvedValue(undefined);
  });

  it('returns false and does not reinstall when all assets are present', async () => {
    buildClient({ latestExists: true, metadataExists: true });

    const result = await client.reinstallSharedAssetsIfMissing();

    expect(result).toBe(false);
    expect(mockInstallSharedElasticsearchAssets).not.toHaveBeenCalled();
  });

  it('returns true and reinstalls when the latest index is missing', async () => {
    buildClient({ latestExists: false, metadataExists: true });

    const result = await client.reinstallSharedAssetsIfMissing();

    expect(result).toBe(true);
    expect(mockInstallSharedElasticsearchAssets).toHaveBeenCalledTimes(1);
    expect(mockInstallSharedElasticsearchAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        migrationEsClient: expect.anything(),
      })
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('.entities.v2.latest.default-00001')
    );
  });

  it('returns true and reinstalls when the metadata data stream is missing', async () => {
    buildClient({ latestExists: true, metadataExists: false });

    const result = await client.reinstallSharedAssetsIfMissing();

    expect(result).toBe(true);
    expect(mockInstallSharedElasticsearchAssets).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('.entities.v2.metadata.default')
    );
  });

  it('propagates non-404 errors from getDataStream instead of treating them as missing', async () => {
    buildClient();

    mockUserEsClient.indices.getDataStream = jest
      .fn()
      .mockRejectedValue({ statusCode: 503, message: 'Service Unavailable' });

    await expect(client.reinstallSharedAssetsIfMissing()).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(mockInstallSharedElasticsearchAssets).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});

describe('AssetManagerClient.getStatus component name resolution', () => {
  /**
   * Tests for the legacy-aware template and component-template collectors introduced to fix
   * https://github.com/elastic/kibana/issues/286283 — status page reports neutral names as
   * missing after an FF-off upgrade that leaves legacy Security-scoped assets in place.
   *
   * getIndexComponents is already legacy-aware; this suite covers getIndexTemplateComponents
   * and getComponentTemplateComponents which were not.
   */

  const namespace = 'default';

  const buildClient = ({
    latestTemplateExists,
    legacyLatestTemplateExists,
    updatesTemplateExists,
    legacyUpdatesTemplateExists,
    latestComponentTemplateExists,
    legacyLatestComponentTemplateExists,
    updatesComponentTemplateExists,
    legacyUpdatesComponentTemplateExists,
  }: {
    latestTemplateExists: boolean;
    legacyLatestTemplateExists: boolean;
    updatesTemplateExists: boolean;
    legacyUpdatesTemplateExists: boolean;
    latestComponentTemplateExists: boolean;
    legacyLatestComponentTemplateExists: boolean;
    updatesComponentTemplateExists: boolean;
    legacyUpdatesComponentTemplateExists: boolean;
  }) => {
    const getIndexTemplate = jest.fn().mockImplementation(async ({ name }: { name: string }) => {
      const exists =
        (name.includes('security_') && name.includes('latest') && legacyLatestTemplateExists) ||
        (!name.includes('security_') && name.includes('latest') && latestTemplateExists) ||
        (name.includes('security_') && name.includes('updates') && legacyUpdatesTemplateExists) ||
        (!name.includes('security_') && name.includes('updates') && updatesTemplateExists);
      if (!exists) throw new Error('index_template not found [404]');
      return {};
    });

    const getComponentTemplate = jest
      .fn()
      .mockImplementation(async ({ name }: { name: string }) => {
        const exists =
          (name.includes('security_') &&
            name.includes('latest') &&
            legacyLatestComponentTemplateExists) ||
          (!name.includes('security_') &&
            name.includes('latest') &&
            latestComponentTemplateExists) ||
          (name.includes('security_') &&
            name.includes('updates') &&
            legacyUpdatesComponentTemplateExists) ||
          (!name.includes('security_') &&
            name.includes('updates') &&
            updatesComponentTemplateExists);
        if (!exists) throw new Error('component_template not found [404]');
        return {};
      });

    // Stub the minimum ES surface getStatus/getComponentsForEngine needs.
    // index and dataStream probes are not under test here — return "found" for all of them
    // so the index rows don't interfere with the assertions.
    const esClient = {
      indices: {
        exists: jest.fn().mockResolvedValue(true),
        getIndexTemplate,
        getDataStream: jest.fn().mockResolvedValue({ data_streams: [{}] }),
      },
      cluster: { getComponentTemplate },
    } as unknown as jest.Mocked<ElasticsearchClient>;

    const taskManager = {
      get: jest
        .fn()
        .mockRejectedValue(
          SavedObjectsErrorHelpers.createGenericNotFoundError('task', 'entity_store')
        ),
    } as unknown as jest.Mocked<TaskManagerStartContract>;

    const engineDescriptorClient = {
      getAll: jest.fn().mockResolvedValue([{ type: 'user', status: 'started' }]),
      init: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const globalStateClient = {
      findOrThrow: jest.fn().mockResolvedValue({ historySnapshot: {}, logsExtraction: {} }),
      init: jest.fn(),
      find: jest.fn(),
      findLogExtractionOverrides: jest.fn().mockResolvedValue({}),
      delete: jest.fn(),
    };

    return new AssetManagerClient({
      logger: loggerMock.create(),
      esClient,
      internalEsClient: esClient,
      taskManager,
      engineDescriptorClient:
        engineDescriptorClient as unknown as import('../saved_objects').EngineDescriptorClient,
      globalStateClient:
        globalStateClient as unknown as import('../saved_objects').EntityStoreGlobalStateClient,
      namespace,
      isServerless: true,
      logsExtractionClient: {} as unknown as import('../logs_extraction').LogsExtractionClient,
      security: {} as import('@kbn/security-plugin/server').SecurityPluginStart,
      analytics: {
        reportEvent: jest.fn(),
      } as unknown as import('../../telemetry/events').TelemetryReporter,
      savedObjectsClient: {} as SavedObjectsClientContract,
    });
  };

  const getComponentsByResource = async (client: AssetManagerClient, resource: string) => {
    const { engines } = await client.getStatus(true);
    const components =
      (engines[0] as { components?: Array<{ resource: string; id: string; installed: boolean }> })
        .components ?? [];
    return components.filter((c) => c.resource === resource);
  };

  describe('legacy-only assets (FF-off post-upgrade scenario)', () => {
    it('reports neutral index template name as not installed when only legacy exists', async () => {
      const client = buildClient({
        latestTemplateExists: false,
        legacyLatestTemplateExists: true,
        updatesTemplateExists: false,
        legacyUpdatesTemplateExists: true,
        latestComponentTemplateExists: false,
        legacyLatestComponentTemplateExists: true,
        updatesComponentTemplateExists: false,
        legacyUpdatesComponentTemplateExists: true,
      });

      const templates = await getComponentsByResource(client, 'index_template');

      expect(templates).toHaveLength(1);
      expect(templates[0].id).not.toContain('security_');
      expect(templates[0].installed).toBe(false);
    });

    it('reports neutral component template name as not installed when only legacy exists', async () => {
      const client = buildClient({
        latestTemplateExists: false,
        legacyLatestTemplateExists: true,
        updatesTemplateExists: false,
        legacyUpdatesTemplateExists: true,
        latestComponentTemplateExists: false,
        legacyLatestComponentTemplateExists: true,
        updatesComponentTemplateExists: false,
        legacyUpdatesComponentTemplateExists: true,
      });

      const componentTemplates = await getComponentsByResource(client, 'component_template');

      expect(componentTemplates).toHaveLength(1);
      expect(componentTemplates[0].id).not.toContain('security_');
      expect(componentTemplates[0].installed).toBe(false);
    });
  });

  describe('neutral-only assets (greenfield install)', () => {
    it('reports neutral index template names as installed', async () => {
      const client = buildClient({
        latestTemplateExists: true,
        legacyLatestTemplateExists: false,
        updatesTemplateExists: true,
        legacyUpdatesTemplateExists: false,
        latestComponentTemplateExists: true,
        legacyLatestComponentTemplateExists: false,
        updatesComponentTemplateExists: true,
        legacyUpdatesComponentTemplateExists: false,
      });

      const templates = await getComponentsByResource(client, 'index_template');

      expect(templates).toHaveLength(1);
      expect(templates[0].id).not.toContain('security_');
      expect(templates[0].installed).toBe(true);
    });

    it('reports neutral component template names as installed', async () => {
      const client = buildClient({
        latestTemplateExists: true,
        legacyLatestTemplateExists: false,
        updatesTemplateExists: true,
        legacyUpdatesTemplateExists: false,
        latestComponentTemplateExists: true,
        legacyLatestComponentTemplateExists: false,
        updatesComponentTemplateExists: true,
        legacyUpdatesComponentTemplateExists: false,
      });

      const componentTemplates = await getComponentsByResource(client, 'component_template');

      expect(componentTemplates).toHaveLength(1);
      expect(componentTemplates[0].id).not.toContain('security_');
      expect(componentTemplates[0].installed).toBe(true);
    });
  });

  describe('no assets present (not installed)', () => {
    it('reports legacy names with installed: false when neither naming scheme exists', async () => {
      const client = buildClient({
        latestTemplateExists: false,
        legacyLatestTemplateExists: false,
        updatesTemplateExists: false,
        legacyUpdatesTemplateExists: false,
        latestComponentTemplateExists: false,
        legacyLatestComponentTemplateExists: false,
        updatesComponentTemplateExists: false,
        legacyUpdatesComponentTemplateExists: false,
      });

      const templates = await getComponentsByResource(client, 'index_template');
      const componentTemplates = await getComponentsByResource(client, 'component_template');

      expect(templates.every((t) => !t.installed)).toBe(true);
      expect(componentTemplates.every((t) => !t.installed)).toBe(true);
    });
  });
});
