/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createMigrationTask,
  scheduleAssetCriticalityEcsCompliancyMigration,
} from './schedule_ecs_compliancy_migration';

import { loggerMock } from '@kbn/logging-mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { auditLoggerMock } from '@kbn/core-security-server-mocks';

const mockIsEcsDataMigrationRequired = jest.fn().mockResolvedValue(false);
const mockMigrateEcsData = jest.fn().mockResolvedValue({
  updated: 100,
  failures: [],
});
jest.mock('../asset_criticality_migration_client', () => ({
  AssetCriticalityMigrationClient: jest.fn().mockImplementation(() => ({
    isEcsDataMigrationRequired: mockIsEcsDataMigrationRequired,
    migrateEcsData: mockMigrateEcsData,
  })),
}));
const mockTaskManagerStart = taskManagerMock.createStart();
const logger = loggerMock.create();
const auditLogger = auditLoggerMock.create();

const getStartServices = jest.fn().mockResolvedValue([
  {
    elasticsearch: {
      client: elasticsearchServiceMock.createClusterClient(),
    },
  },
  { taskManager: mockTaskManagerStart },
]);
const mockAbortController = {
  abort: jest.fn(),
  signal: new AbortController().signal,
} satisfies AbortController;

global.AbortController = jest.fn().mockImplementation(() => mockAbortController);

describe('scheduleAssetCriticalityEcsCompliancyMigration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register the task if taskManager is available', async () => {
    const taskManager = taskManagerMock.createSetup();
    await scheduleAssetCriticalityEcsCompliancyMigration({
      auditLogger,
      taskManager,
      logger,
      getStartServices,
      kibanaVersion: '8.0.0',
      hasEncryptionKey: true,
    });

    expect(taskManager.registerTaskDefinitions).toHaveBeenCalledWith({
      'security-solution-ea-asset-criticality-ecs-migration': expect.any(Object),
    });
  });

  it('should not register the task if taskManager is not available', async () => {
    await expect(
      scheduleAssetCriticalityEcsCompliancyMigration({
        auditLogger,
        taskManager: undefined,
        logger,
        getStartServices,
        kibanaVersion: '8.0.0',
        hasEncryptionKey: true,
      })
    ).resolves.not.toThrow();
  });

  it('should schedule the task if data migration is required', async () => {
    mockIsEcsDataMigrationRequired.mockResolvedValue(true);

    await scheduleAssetCriticalityEcsCompliancyMigration({
      auditLogger,
      taskManager: taskManagerMock.createSetup(),
      logger,
      getStartServices,
      kibanaVersion: '8.0.0',
      hasEncryptionKey: true,
    });

    expect(mockTaskManagerStart.ensureScheduled).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'security-solution-ea-asset-criticality-ecs-migration-task-id',
        taskType: 'security-solution-ea-asset-criticality-ecs-migration',
      })
    );
  });

  it('should log an error if scheduling the task fails', async () => {
    mockIsEcsDataMigrationRequired.mockResolvedValue(true);
    mockTaskManagerStart.ensureScheduled.mockRejectedValue(new Error('Failed to schedule task'));

    await scheduleAssetCriticalityEcsCompliancyMigration({
      auditLogger,
      taskManager: taskManagerMock.createSetup(),
      logger,
      getStartServices,
      kibanaVersion: '8.0.0',
      hasEncryptionKey: true,
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Error scheduling security-solution-ea-asset-criticality-ecs-migration-task-id, received Failed to schedule task'
    );
  });

  it('should not schedule the task if data migration is not required', async () => {
    mockIsEcsDataMigrationRequired.mockResolvedValue(false);

    await scheduleAssetCriticalityEcsCompliancyMigration({
      auditLogger,
      taskManager: taskManagerMock.createSetup(),
      logger,
      getStartServices,
      kibanaVersion: '8.0.0',
      hasEncryptionKey: true,
    });

    expect(mockTaskManagerStart.ensureScheduled).not.toHaveBeenCalled();
  });

  describe('#createMigrationTask', () => {
    it('should run the migration task and log the result', async () => {
      const migrationTask = createMigrationTask({
        getStartServices,
        logger,
        auditLogger,
      })({ abortController: mockAbortController });

      await migrationTask.run();

      expect(mockMigrateEcsData).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Task "security-solution-ea-asset-criticality-ecs-migration" finished. Updated documents: 100, failures: 0'
      );
    });

    it('should log failures if there are any', async () => {
      mockMigrateEcsData.mockResolvedValueOnce({
        updated: 50,
        failures: [{ cause: 'Error 1' }, { cause: 'Error 2' }],
      });

      const migrationTask = createMigrationTask({
        getStartServices,
        logger,
        auditLogger,
      })({ abortController: mockAbortController });

      await migrationTask.run();

      expect(mockMigrateEcsData).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Task "security-solution-ea-asset-criticality-ecs-migration" finished. Updated documents: 50, failures: Error 1\nError 2'
      );
    });

    it('should abort request and log when the task is cancelled', async () => {
      const migrationTask = createMigrationTask({
        getStartServices,
        logger,
        auditLogger,
      })({ abortController: mockAbortController });

      await migrationTask.run();
      await migrationTask.cancel();

      expect(mockAbortController.abort).toHaveBeenCalled();

      expect(logger.debug).toHaveBeenCalledWith(
        'Task cancelled: "security-solution-ea-asset-criticality-ecs-migration"'
      );
    });
  });
});
