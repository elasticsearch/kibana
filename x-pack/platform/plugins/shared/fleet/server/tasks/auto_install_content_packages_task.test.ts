/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClientMock } from '@kbn/core/server/mocks';
import { coreMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import type { TaskManagerSetupContract } from '@kbn/task-manager-plugin/server';
import { TaskStatus } from '@kbn/task-manager-plugin/server';
import { getDeleteTaskRunResult } from '@kbn/task-manager-plugin/server/task';
import type { CoreSetup } from '@kbn/core/server';

import * as Registry from '../services/epm/registry';

import { createAppContextStartContractMock, createMockPackageService } from '../mocks';

import type { PackageClient } from '../services';
import { appContextService, dataStreamService } from '../services';

import { getInstalledPackages } from '../services/epm/packages';

import {
  AutoInstallContentPackagesTask,
  TYPE,
  VERSION,
} from './auto_install_content_packages_task';

jest.mock('../services');
jest.mock('../services/epm/registry');
jest.mock('../services/epm/packages', () => ({
  getInstalledPackages: jest.fn(),
}));
jest.mock('../services/epm/packages/get_prerelease_setting', () => ({
  getPrereleaseFromSettings: jest.fn().mockReturnValue(false),
}));

const MockRegistry = jest.mocked(Registry);

const MOCK_TASK_INSTANCE = {
  id: `${TYPE}:${VERSION}`,
  runAt: new Date(),
  attempts: 0,
  ownerId: '',
  status: TaskStatus.Running,
  startedAt: new Date(),
  scheduledAt: new Date(),
  retryAt: new Date(),
  params: {},
  state: {},
  taskType: TYPE,
};

const mockGetInstalledPackages = getInstalledPackages as jest.Mock;

describe('AutoInstallContentPackagesTask', () => {
  const { createSetup: coreSetupMock } = coreMock;
  const { createSetup: tmSetupMock, createStart: tmStartMock } = taskManagerMock;

  let mockContract: ReturnType<typeof createAppContextStartContractMock>;
  let mockTask: AutoInstallContentPackagesTask;
  let mockCore: CoreSetup;
  let mockTaskManagerSetup: jest.Mocked<TaskManagerSetupContract>;
  let packageClientMock: jest.Mocked<PackageClient>;

  beforeEach(async () => {
    mockContract = createAppContextStartContractMock();
    appContextService.start(mockContract);
    mockCore = coreSetupMock({
      pluginStartContract: {
        packageService: createMockPackageService(),
      },
    });
    packageClientMock = ((await mockCore.getStartServices())[2] as any).packageService
      .asInternalUser;
    mockTaskManagerSetup = tmSetupMock();
    mockTask = new AutoInstallContentPackagesTask({
      core: mockCore,
      taskManager: mockTaskManagerSetup,
      logFactory: loggingSystemMock.create(),
      config: {
        taskInterval: '10m',
      },
    });
    mockGetInstalledPackages.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Task lifecycle', () => {
    it('Should create task', () => {
      expect(mockTask).toBeInstanceOf(AutoInstallContentPackagesTask);
    });

    it('Should register task', () => {
      expect(mockTaskManagerSetup.registerTaskDefinitions).toHaveBeenCalled();
    });

    it('Should schedule task', async () => {
      const mockTaskManagerStart = tmStartMock();
      await mockTask.start({ taskManager: mockTaskManagerStart });
      expect(mockTaskManagerStart.ensureScheduled).toHaveBeenCalled();
    });
  });

  describe('Task logic', () => {
    let esClient: ElasticsearchClientMock;
    const runTask = async (taskInstance = MOCK_TASK_INSTANCE) => {
      const mockTaskManagerStart = tmStartMock();
      await mockTask.start({ taskManager: mockTaskManagerStart });
      const createTaskRunner =
        mockTaskManagerSetup.registerTaskDefinitions.mock.calls[0][0][TYPE].createTaskRunner;
      const taskRunner = createTaskRunner(taskManagerMock.createRunContext({ taskInstance }));
      return taskRunner.run();
    };

    beforeEach(async () => {
      const [{ elasticsearch }] = await mockCore.getStartServices();
      esClient = elasticsearch.client.asInternalUser as ElasticsearchClientMock;
      (dataStreamService.getAllFleetDataStreamNames as jest.Mock).mockResolvedValue([
        'logs-system.cpu-default',
        'logs-system.memory-default',
        'logs-system.test-default',
      ]);
      jest
        .spyOn(appContextService, 'getExperimentalFeatures')
        .mockReturnValue({ enableAutoInstallContentPackages: true } as any);
      MockRegistry.fetchList.mockResolvedValue([
        {
          name: 'kubernetes_otel',
          version: '1.1.0',
          discovery: {
            datasets: [{ name: 'system.cpu' }, { name: 'system.memory' }],
          },
        } as any,
        {
          name: 'test_package',
          version: '1.1.0',
          discovery: {
            datasets: [{ name: 'system.test' }],
          },
        } as any,
      ]);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('Should not run if task is outdated', async () => {
      const result = await runTask({ ...MOCK_TASK_INSTANCE, id: 'old-id' });

      expect(esClient.deleteByQuery).not.toHaveBeenCalled();
      expect(result).toEqual(getDeleteTaskRunResult());
    });

    it('should install content packages', async () => {
      await runTask();

      expect(packageClientMock.installPackage).toHaveBeenCalledWith({
        pkgName: 'kubernetes_otel',
        pkgVersion: '1.1.0',
        useStreaming: true,
        automaticInstall: true,
      });
      expect(packageClientMock.installPackage).toHaveBeenCalledTimes(2);
    });

    it('should install content packages and filter out installed datasets', async () => {
      mockGetInstalledPackages.mockResolvedValue({
        items: [
          {
            name: 'test_package',
            version: '1.1.0',
          },
        ],
      });

      await runTask();

      expect(packageClientMock.installPackage).toHaveBeenCalledWith({
        pkgName: 'kubernetes_otel',
        pkgVersion: '1.1.0',
        useStreaming: true,
        automaticInstall: true,
      });
      expect(packageClientMock.installPackage).toHaveBeenCalledTimes(1);
    });

    it('should not call registry if cached', async () => {
      packageClientMock.getInstallation.mockResolvedValue({
        install_status: 'installed',
        version: '1.1.0',
      } as any);

      await runTask();
      await runTask();

      expect(MockRegistry.fetchList).toHaveBeenCalledTimes(1);
    });

    it('should install package if old version is installed', async () => {
      mockGetInstalledPackages.mockResolvedValue({
        items: [
          {
            name: 'kubernetes_otel',
            version: '1.0.0',
          },
        ],
      });

      await runTask();

      expect(packageClientMock.installPackage).toHaveBeenCalledWith({
        pkgName: 'kubernetes_otel',
        pkgVersion: '1.1.0',
        useStreaming: true,
        automaticInstall: true,
      });
    });

    it('should not install package if latest version is installed', async () => {
      mockGetInstalledPackages.mockResolvedValue({
        items: [
          {
            name: 'kubernetes_otel',
            version: '1.1.0',
          },
          {
            name: 'test_package',
            version: '1.1.0',
          },
        ],
      });

      await runTask();

      expect(packageClientMock.installPackage).not.toHaveBeenCalled();
      expect(dataStreamService.getAllFleetDataStreamNames).not.toHaveBeenCalled();
    });

    it('should not install package that has been rolled back', async () => {
      mockGetInstalledPackages.mockResolvedValue({
        items: [
          {
            name: 'kubernetes_otel',
            version: '1.0.0',
            rolledBack: true,
          },
          {
            name: 'test_package',
            version: '1.0.0',
          },
        ],
      });

      await runTask();

      expect(packageClientMock.installPackage).toHaveBeenCalledTimes(1);
      expect(packageClientMock.installPackage).toHaveBeenCalledWith({
        pkgName: 'test_package',
        pkgVersion: '1.1.0',
        useStreaming: true,
        automaticInstall: true,
      });
      expect(packageClientMock.installPackage).not.toHaveBeenCalledWith(
        expect.objectContaining({ pkgName: 'kubernetes_otel' })
      );
    });

    it('should not downgrade package when a newer prerelease version is installed', async () => {
      // Registry has 1.1.0, but a prerelease 2.0.0-preview is already installed.
      // The task must not downgrade to 1.1.0.
      mockGetInstalledPackages.mockResolvedValue({
        items: [
          {
            name: 'kubernetes_otel',
            version: '2.0.0-preview',
          },
          {
            name: 'test_package',
            version: '2.0.0-preview',
          },
        ],
      });

      await runTask();

      expect(packageClientMock.installPackage).not.toHaveBeenCalled();
    });

    it('should not downgrade one package while upgrading another', async () => {
      // kubernetes_otel has a prerelease installed (must not downgrade),
      // test_package has an older version installed (must upgrade).
      mockGetInstalledPackages.mockResolvedValue({
        items: [
          {
            name: 'kubernetes_otel',
            version: '2.0.0-preview',
          },
          {
            name: 'test_package',
            version: '1.0.0',
          },
        ],
      });

      await runTask();

      expect(packageClientMock.installPackage).toHaveBeenCalledTimes(1);
      expect(packageClientMock.installPackage).toHaveBeenCalledWith({
        pkgName: 'test_package',
        pkgVersion: '1.1.0',
        useStreaming: true,
        automaticInstall: true,
      });
      expect(packageClientMock.installPackage).not.toHaveBeenCalledWith(
        expect.objectContaining({ pkgName: 'kubernetes_otel' })
      );
    });

    describe('getDatasetsWithData', () => {
      it('should deduplicate datasets when multiple data streams share the same dataset but have different namespaces', async () => {
        (dataStreamService.getAllFleetDataStreamNames as jest.Mock).mockResolvedValue([
          'logs-system.cpu-default',
          'logs-system.cpu-production',
        ]);

        const result: string[] = await (mockTask as any).getDatasetsWithData(esClient, []);

        expect(result).toEqual(['system.cpu']);
      });

      it('should deduplicate datasets when multiple data streams share the same dataset but have different types', async () => {
        (dataStreamService.getAllFleetDataStreamNames as jest.Mock).mockResolvedValue([
          'logs-system.cpu-default',
          'metrics-system.cpu-default',
        ]);

        const result: string[] = await (mockTask as any).getDatasetsWithData(esClient, []);

        expect(result).toEqual(['system.cpu']);
      });
    });
  });
});
