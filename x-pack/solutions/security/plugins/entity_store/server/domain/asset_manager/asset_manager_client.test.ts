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
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import { loggerMock } from '@kbn/logging-mocks';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import { AssetManagerClient } from './asset_manager_client';
import { LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT } from '../saved_objects/global_state/constants';
import {
  installSharedElasticsearchAssets,
  installIndicesAndDataStreams,
  uninstallElasticsearchAssets,
} from './install_assets';
import { installEuidStoredScripts, deleteEuidStoredScripts } from './euid_stored_scripts';
import { scheduleExtractEntityTask, stopExtractEntityTask } from '../../tasks/extract_entity_task';
import {
  scheduleHistorySnapshotTasks,
  stopHistorySnapshotTask,
} from '../../tasks/history_snapshot_task';
import { scheduleStatusReportTask, stopStatusReportTask } from '../../tasks/status_report_task';
import { stopAndRemoveV1, stopAndRemoveV1SharedTasks } from '../../infra/remove_v1';

jest.mock('./install_assets');
jest.mock('./euid_stored_scripts');
jest.mock('../../tasks/extract_entity_task');
jest.mock('../../tasks/history_snapshot_task');
jest.mock('../../tasks/status_report_task');
jest.mock('../../infra/remove_v1');

const mockInstallSharedElasticsearchAssets =
  installSharedElasticsearchAssets as jest.MockedFunction<typeof installSharedElasticsearchAssets>;
const mockInstallIndicesAndDataStreams = installIndicesAndDataStreams as jest.MockedFunction<
  typeof installIndicesAndDataStreams
>;
const mockUninstallElasticsearchAssets = uninstallElasticsearchAssets as jest.MockedFunction<
  typeof uninstallElasticsearchAssets
>;
const mockInstallEuidStoredScripts = installEuidStoredScripts as jest.MockedFunction<
  typeof installEuidStoredScripts
>;
const mockDeleteEuidStoredScripts = deleteEuidStoredScripts as jest.MockedFunction<
  typeof deleteEuidStoredScripts
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
const mockStopAndRemoveV1 = stopAndRemoveV1 as jest.MockedFunction<typeof stopAndRemoveV1>;
const mockStopAndRemoveV1SharedTasks = stopAndRemoveV1SharedTasks as jest.MockedFunction<
  typeof stopAndRemoveV1SharedTasks
>;

describe('AssetManagerClient', () => {
  const namespace = 'default';

  let client: AssetManagerClient;
  let mockEngineDescriptorClient: {
    getAll: jest.Mock;
    init: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let mockGlobalStateClient: {
    init: jest.Mock;
    findOrThrow: jest.Mock;
    find: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockInstallSharedElasticsearchAssets.mockResolvedValue(undefined);
    mockInstallIndicesAndDataStreams.mockResolvedValue(undefined);
    mockUninstallElasticsearchAssets.mockResolvedValue(undefined);
    mockInstallEuidStoredScripts.mockResolvedValue(undefined);
    mockDeleteEuidStoredScripts.mockResolvedValue(undefined);
    mockScheduleExtractEntityTask.mockResolvedValue(undefined);
    mockStopExtractEntityTask.mockResolvedValue(undefined);
    mockScheduleHistorySnapshotTasks.mockResolvedValue(undefined);
    mockStopHistorySnapshotTask.mockResolvedValue(undefined);
    mockScheduleStatusReportTask.mockResolvedValue(undefined);
    mockStopStatusReportTask.mockResolvedValue(undefined);
    mockStopAndRemoveV1.mockResolvedValue(undefined);
    mockStopAndRemoveV1SharedTasks.mockResolvedValue(undefined);

    mockEngineDescriptorClient = {
      getAll: jest.fn().mockResolvedValue([]),
      init: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    mockGlobalStateClient = {
      init: jest.fn().mockResolvedValue(undefined),
      findOrThrow: jest.fn().mockResolvedValue({
        historySnapshot: {},
        logsExtraction: {},
      }),
      find: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    client = new AssetManagerClient({
      logger: loggerMock.create(),
      esClient: {} as jest.Mocked<ElasticsearchClient>,
      taskManager: {} as jest.Mocked<TaskManagerStartContract>,
      engineDescriptorClient:
        mockEngineDescriptorClient as unknown as import('../saved_objects').EngineDescriptorClient,
      globalStateClient:
        mockGlobalStateClient as unknown as import('../saved_objects').EntityStoreGlobalStateClient,
      remoteLogExtractionStateClient: {
        delete: jest.fn().mockResolvedValue(undefined),
      } as unknown as import('../saved_objects/remote_log_extraction_state').RemoteLogExtractionStateClient,
      namespace,
      isServerless: false,
      logsExtractionClient: {} as unknown as import('../logs_extraction').LogsExtractionClient,
      security: {} as SecurityPluginStart,
      analytics: {
        reportEvent: jest.fn(),
      } as unknown as import('../../telemetry/events').TelemetryReporter,
      savedObjectsClient: {} as SavedObjectsClientContract,
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
        taskManager: {} as jest.Mocked<TaskManagerStartContract>,
        engineDescriptorClient:
          mockEngineDescriptorClient as unknown as import('../saved_objects').EngineDescriptorClient,
        globalStateClient:
          mockGlobalStateClient as unknown as import('../saved_objects').EntityStoreGlobalStateClient,
        remoteLogExtractionStateClient: {
          delete: jest.fn().mockResolvedValue(undefined),
        } as unknown as import('../saved_objects/remote_log_extraction_state').RemoteLogExtractionStateClient,
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
  });

  describe('logsExtraction resolution on install', () => {
    const existingLogsExtraction = {
      additionalIndexPatterns: ['existing-*'],
      fieldHistoryLength: 99,
      lookbackPeriod: '12h',
      delay: '5m',
      docsLimit: 1234,
      maxLogsPerPage: 5678,
      timeout: '60s',
      frequency: '2m',
    };

    it('fresh install with no params applies defaults', async () => {
      mockGlobalStateClient.find.mockResolvedValue(undefined);

      await client.init({} as KibanaRequest, ['host']);

      expect(mockGlobalStateClient.init).toHaveBeenCalledWith(
        expect.objectContaining({
          logsExtraction: expect.objectContaining({
            additionalIndexPatterns: [],
            fieldHistoryLength: 10,
            lookbackPeriod: '3h',
            delay: '1m',
            frequency: '1m',
            docsLimit: 10000,
            maxLogsPerPage: LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT,
            timeout: '59s',
          }),
        })
      );
    });

    it('fresh install with params merges params with defaults', async () => {
      mockGlobalStateClient.find.mockResolvedValue(undefined);

      await client.init({} as KibanaRequest, ['host'], { delay: '2m', frequency: '1m' });

      expect(mockGlobalStateClient.init).toHaveBeenCalledWith(
        expect.objectContaining({
          logsExtraction: expect.objectContaining({
            delay: '2m',
            frequency: '1m',
            lookbackPeriod: '3h',
            fieldHistoryLength: 10,
            additionalIndexPatterns: [],
            docsLimit: 10000,
            maxLogsPerPage: LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT,
          }),
        })
      );
    });

    it('re-install with no params preserves existing config', async () => {
      mockGlobalStateClient.find.mockResolvedValue({
        historySnapshot: {},
        logsExtraction: existingLogsExtraction,
      });

      await client.init({} as KibanaRequest, ['host']);

      expect(mockGlobalStateClient.init).toHaveBeenCalledWith(
        expect.objectContaining({ logsExtraction: existingLogsExtraction })
      );
    });

    it('re-install with empty params object preserves existing config', async () => {
      mockGlobalStateClient.find.mockResolvedValue({
        historySnapshot: {},
        logsExtraction: existingLogsExtraction,
      });

      await client.init({} as KibanaRequest, ['host'], {});

      expect(mockGlobalStateClient.init).toHaveBeenCalledWith(
        expect.objectContaining({ logsExtraction: existingLogsExtraction })
      );
    });

    it('re-install with params overwrites existing config with parsed params', async () => {
      mockGlobalStateClient.find.mockResolvedValue({
        historySnapshot: {},
        logsExtraction: existingLogsExtraction,
      });

      await client.init({} as KibanaRequest, ['host'], { delay: '2m' });

      expect(mockGlobalStateClient.init).toHaveBeenCalledWith(
        expect.objectContaining({
          logsExtraction: expect.objectContaining({
            delay: '2m',
            frequency: '1m',
            lookbackPeriod: '3h',
            fieldHistoryLength: 10,
            additionalIndexPatterns: [],
            docsLimit: 10000,
            maxLogsPerPage: LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT,
          }),
        })
      );
    });
  });
});
