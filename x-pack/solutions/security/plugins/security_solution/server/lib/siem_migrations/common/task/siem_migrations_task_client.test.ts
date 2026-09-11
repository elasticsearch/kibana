/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AuthenticatedUser, KibanaRequest } from '@kbn/core/server';
import type { MigrationsRunning } from './siem_migrations_task_client';
import { SiemMigrationsTaskClient } from './siem_migrations_task_client';
import {
  SiemMigrationStatus,
  SiemMigrationTaskStatus,
} from '../../../../../common/siem_migrations/constants';
import type { SiemTaskRunnerConstructor } from './siem_migrations_task_runner';
import { SiemMigrationTaskRunner } from './siem_migrations_task_runner';
import type { MockedLogger } from '@kbn/logging-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import type { SiemMigrationTaskStartParams } from './types';
import { createSiemMigrationsDataClientMock } from '../data/__mocks__/mocks';
import type { SiemMigrationDataStats } from '../data/types';
import type { RuleMigrationFilters } from '../../../../../common/siem_migrations/rules/types';
import type { SiemMigrationsClientDependencies, StoredSiemMigration } from '../types';
import { httpServerMock } from '@kbn/core/server/mocks';
import type { StoredRuleMigration } from '../../rules/types';

jest.mock('./siem_migrations_task_runner');

const currentUser = {} as AuthenticatedUser;
const dependencies = {} as SiemMigrationsClientDependencies;
const migrationId = 'migration1';

const mockRunnerInstance = {
  setup: jest.fn().mockResolvedValue(undefined),
  run: jest.fn().mockResolvedValue(undefined),
  executeTask: jest.fn().mockResolvedValue({}),
  abortController: { abort: jest.fn() },
} as unknown as SiemMigrationTaskRunner;

const MockTaskRunnerClass =
  SiemMigrationTaskRunner as unknown as jest.MockedClass<SiemTaskRunnerConstructor>;

MockTaskRunnerClass.mockImplementation(() => mockRunnerInstance);

class TestTaskClient extends SiemMigrationsTaskClient {
  TaskRunnerClass = MockTaskRunnerClass;
  EvaluatorClass = undefined;
}

describe('RuleMigrationsTaskClient', () => {
  let migrationsRunning: MigrationsRunning;
  let request: KibanaRequest;
  let logger: MockedLogger;
  let data: ReturnType<typeof createSiemMigrationsDataClientMock>;
  const params: SiemMigrationTaskStartParams = {
    migrationId,
    connectorId: 'connector1',
    invocationConfig: {},
  };

  beforeEach(() => {
    migrationsRunning = new Map();
    logger = loggerMock.create();
    request = httpServerMock.createKibanaRequest();

    data = createSiemMigrationsDataClientMock();
    // @ts-expect-error resetting private property for each test.
    TestTaskClient.migrationsLastError = new Map();
    jest.clearAllMocks();
  });

  describe('start', () => {
    it('should not start if migration is already running', async () => {
      // Pre-populate with the migration id.
      migrationsRunning.set(migrationId, {} as SiemMigrationTaskRunner);
      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const result = await client.start(params);
      expect(result).toEqual({ exists: true, started: false });
      expect(data.items.updateStatus).not.toHaveBeenCalled();
    });

    it('should not start if there are no rules to migrate (total = 0)', async () => {
      data.items.getStats.mockResolvedValue({
        items: { total: 0, pending: 0, completed: 0, failed: 0 },
      } as SiemMigrationDataStats);
      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const result = await client.start(params);
      expect(data.items.updateStatus).toHaveBeenCalledWith(
        migrationId,
        { status: SiemMigrationStatus.PROCESSING },
        SiemMigrationStatus.PENDING,
        { refresh: true }
      );
      expect(result).toEqual({ exists: false, started: false });
    });

    it('should not start if there are no pending rules', async () => {
      data.items.getStats.mockResolvedValue({
        items: { total: 10, pending: 0, completed: 10, failed: 0 },
      } as SiemMigrationDataStats);
      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const result = await client.start(params);
      expect(result).toEqual({ exists: true, started: false });
    });

    it('should start migration successfully', async () => {
      data.items.getStats.mockResolvedValue({
        items: { total: 10, pending: 5, completed: 0, failed: 0 },
      } as SiemMigrationDataStats);

      // Use our custom mock for this test.
      (SiemMigrationTaskRunner as jest.Mock).mockImplementationOnce(() => mockRunnerInstance);

      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const result = await client.start(params);
      expect(result).toEqual({ exists: true, started: true });
      expect(logger.get).toHaveBeenCalledWith(migrationId);
      expect(mockRunnerInstance.setup).toHaveBeenCalledWith(params.connectorId);
      expect(logger.get(migrationId).info).toHaveBeenCalledWith('Starting migration');
      expect(migrationsRunning.has(migrationId)).toBe(true);

      // Allow the asynchronous run() call to complete its finally callback.
      await new Promise(process.nextTick);
      expect(migrationsRunning.has(migrationId)).toBe(false);
      // @ts-expect-error check private property
      expect(TestTaskClient.migrationsLastError.has(migrationId)).toBe(false);
    });

    it('should throw error if a race condition occurs after setup', async () => {
      data.items.getStats.mockResolvedValue({
        items: { total: 10, pending: 5, completed: 0, failed: 0 },
      } as SiemMigrationDataStats);
      const mockedRunnerInstance = {
        setup: jest.fn().mockImplementationOnce(() => {
          // Simulate a race condition by setting the migration as running during setup.
          migrationsRunning.set(migrationId, {} as SiemMigrationTaskRunner);
          return Promise.resolve();
        }),
        run: jest.fn().mockResolvedValue(undefined),
        abortController: { abort: jest.fn() },
      };
      (SiemMigrationTaskRunner as jest.Mock).mockImplementation(() => mockedRunnerInstance);

      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      await expect(client.start(params)).rejects.toThrow('Task already running for this migration');
    });

    it('should mark migration as started by calling saveAsStarted', async () => {
      data.items.getStats.mockResolvedValue({
        items: { total: 10, pending: 5, completed: 0, failed: 0 },
      } as SiemMigrationDataStats);

      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );

      await client.start({
        ...params,
      });

      expect(data.migrations.saveAsStarted).toHaveBeenCalledWith({
        id: migrationId,
        connectorId: params.connectorId,
      });
    });

    it('should mark migration as ended by calling saveAsEnded if run completes successfully', async () => {
      migrationsRunning = new Map();
      data.items.getStats.mockResolvedValue({
        items: { total: 10, pending: 5, completed: 0, failed: 0 },
      } as SiemMigrationDataStats);

      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );

      await client.start(params);
      // Allow the asynchronous run() call to complete its finally callback.
      await new Promise(process.nextTick);
      expect(data.migrations.saveAsFinished).toHaveBeenCalledWith({ id: migrationId });
    });
  });

  describe('updateToRetry', () => {
    it('should not update if migration is currently running', async () => {
      migrationsRunning.set(migrationId, {} as SiemMigrationTaskRunner);
      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const filter: RuleMigrationFilters = { fullyTranslated: true };
      const result = await client.updateToRetry(migrationId, filter);
      expect(result).toEqual({ updated: false });
      expect(data.items.updateStatus).not.toHaveBeenCalled();
    });

    it('should update to retry if migration is not running', async () => {
      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const filter: RuleMigrationFilters = { fullyTranslated: true };
      const result = await client.updateToRetry(migrationId, filter);
      expect(filter.installed).toBe(false);
      expect(data.items.updateStatus).toHaveBeenCalledWith(
        migrationId,
        { fullyTranslated: true, installed: false },
        SiemMigrationStatus.PENDING,
        { refresh: true }
      );
      expect(result).toEqual({ updated: true });
    });
  });

  describe('getStats', () => {
    it('should return RUNNING status if migration is running', async () => {
      migrationsRunning.set(migrationId, {} as SiemMigrationTaskRunner); // migration is running
      data.items.getStats.mockResolvedValue({
        items: { total: 10, pending: 5, completed: 3, failed: 2 },
      } as SiemMigrationDataStats);

      data.migrations.get.mockResolvedValue({
        id: migrationId,
      } as unknown as StoredRuleMigration);

      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const stats = await client.getStats(migrationId);
      expect(stats.status).toEqual(SiemMigrationTaskStatus.RUNNING);
    });

    it('should return READY status if pending equals total', async () => {
      data.items.getStats.mockResolvedValue({
        items: { total: 10, pending: 10, completed: 0, failed: 0 },
      } as SiemMigrationDataStats);
      data.migrations.get.mockResolvedValue({
        id: migrationId,
      } as unknown as StoredRuleMigration);

      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const stats = await client.getStats(migrationId);
      expect(stats.status).toEqual(SiemMigrationTaskStatus.READY);
    });

    it('should return FINISHED status if completed+failed equals total', async () => {
      data.items.getStats.mockResolvedValue({
        items: { total: 10, pending: 0, completed: 5, failed: 5 },
      } as SiemMigrationDataStats);

      data.migrations.get.mockResolvedValue({
        id: migrationId,
      } as unknown as StoredSiemMigration);
      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const stats = await client.getStats(migrationId);
      expect(stats.status).toEqual(SiemMigrationTaskStatus.FINISHED);
    });

    it('should return STOPPED status for other cases', async () => {
      data.items.getStats.mockResolvedValue({
        items: { total: 10, pending: 2, completed: 3, failed: 2 },
      } as SiemMigrationDataStats);
      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const stats = await client.getStats(migrationId);
      expect(stats.status).toEqual(SiemMigrationTaskStatus.INTERRUPTED);
    });

    it('should include error if one exists', async () => {
      const errorMessage = 'Test error';
      data.items.getStats.mockResolvedValue({
        id: 'migration-1',
        items: { total: 10, pending: 2, completed: 3, failed: 2 },
      } as SiemMigrationDataStats);

      data.migrations.get.mockResolvedValue({
        id: 'migration-1',
        name: 'Test Migration',
        created_at: new Date().toISOString(),
        created_by: 'test-user',
        last_execution: {
          error: errorMessage,
        },
      });

      data.migrations.get.mockResolvedValue({
        id: migrationId,
        last_execution: {
          error: 'Test error',
        },
      } as unknown as StoredRuleMigration);

      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const stats = await client.getStats(migrationId);
      expect(stats.last_execution?.error).toEqual('Test error');
    });
  });

  describe('getAllStats', () => {
    it('should return combined stats for all migrations', async () => {
      const statsArray = [
        {
          id: 'm1',
          items: { total: 10, pending: 10, completed: 0, failed: 0 },
        } as SiemMigrationDataStats,
        {
          id: 'm2',
          items: { total: 10, pending: 2, completed: 3, failed: 2 },
        } as SiemMigrationDataStats,
      ];
      const migrations = [{ id: 'm1' }, { id: 'm2' }] as unknown as StoredSiemMigration[];
      data.items.getAllStats.mockResolvedValue(statsArray);
      data.migrations.getAll.mockResolvedValue(migrations);
      // Mark migration m1 as running.
      migrationsRunning.set('m1', {} as SiemMigrationTaskRunner);
      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const allStats = await client.getAllStats();
      const m1Stats = allStats.find((s) => s.id === 'm1');
      const m2Stats = allStats.find((s) => s.id === 'm2');
      expect(m1Stats?.status).toEqual(SiemMigrationTaskStatus.RUNNING);
      expect(m2Stats?.status).toEqual(SiemMigrationTaskStatus.INTERRUPTED);
    });
  });

  describe('stop', () => {
    it('should stop a running migration', async () => {
      const abortMock = jest.fn();
      const migrationRunner = {
        abortController: { abort: abortMock },
      } as unknown as SiemMigrationTaskRunner;
      migrationsRunning.set(migrationId, migrationRunner);
      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const result = await client.stop(migrationId);
      expect(result).toEqual({ exists: true, stopped: true });
      expect(abortMock).toHaveBeenCalled();
    });

    it('should return stopped even if migration is already stopped', async () => {
      data.items.getStats.mockResolvedValue({
        items: { total: 10, pending: 10, completed: 0, failed: 0 },
      } as SiemMigrationDataStats);
      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const result = await client.stop(migrationId);
      expect(result).toEqual({ exists: true, stopped: true });
    });

    it('should return exists false if migration is not running and total equals 0', async () => {
      data.items.getStats.mockResolvedValue({
        items: { total: 0, pending: 0, completed: 0, failed: 0 },
      } as SiemMigrationDataStats);
      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const result = await client.stop(migrationId);
      expect(result).toEqual({ exists: false, stopped: true });
    });

    it('should catch errors and return exists true, stopped false', async () => {
      const error = new Error('Stop error');
      data.items.getStats.mockRejectedValue(error);
      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const result = await client.stop(migrationId);
      expect(result).toEqual({ exists: true, stopped: false });
      expect(logger.error).toHaveBeenCalledWith(
        `Error stopping migration ID:${migrationId}`,
        error
      );
    });

    it('should mark migration task as stopped when manually stopping a running migration', async () => {
      const abortMock = jest.fn();
      const migrationRunner = {
        abortController: { abort: abortMock },
      } as unknown as SiemMigrationTaskRunner;
      migrationsRunning.set(migrationId, migrationRunner);
      data.migrations.setIsStopped.mockResolvedValue(undefined);

      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      await client.stop(migrationId);
      expect(data.migrations.setIsStopped).toHaveBeenCalledWith({ id: migrationId });
    });
  });
  describe('createInvoker', () => {
    it('should call setup with the provided connectorId', async () => {
      const abortController = new AbortController();
      (SiemMigrationTaskRunner as jest.Mock).mockImplementation(() => mockRunnerInstance);
      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      await client.createInvoker('connector-1', { abortController, vendor: 'splunk' });
      expect(mockRunnerInstance.setup).toHaveBeenCalledWith('connector-1');
    });

    it('should return an execute function that calls executeTask with merged config', async () => {
      const abortController = new AbortController();
      (SiemMigrationTaskRunner as jest.Mock).mockImplementation(() => mockRunnerInstance);
      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const invoker = await client.createInvoker('connector-1', {
        abortController,
        vendor: 'splunk',
      });
      const input = { foo: 'bar' };
      const extraConfig = { configurable: { skipPrebuiltRulesMatching: true } };
      await invoker.execute(input as never, extraConfig);
      expect(mockRunnerInstance.executeTask).toHaveBeenCalledWith(input, {
        ...extraConfig,
        signal: abortController.signal,
        metadata: { migrationId: expect.any(String), evalsInvoke: true },
      });
    });

    it('protects metadata from being overridden by caller config', async () => {
      const abortController = new AbortController();
      (SiemMigrationTaskRunner as jest.Mock).mockImplementation(() => mockRunnerInstance);
      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );
      const invoker = await client.createInvoker('connector-1', {
        abortController,
        vendor: 'splunk',
      });

      const input = { id: 'r1' };
      const configWithMetadata = { metadata: { evalsInvoke: false, other: 'data' } };
      await invoker.execute(input as never, configWithMetadata);

      expect(mockRunnerInstance.executeTask).toHaveBeenCalledWith(
        input,
        expect.objectContaining({
          metadata: expect.objectContaining({ evalsInvoke: true }), // our value wins
        })
      );
    });
  });

  describe('task error', () => {
    it('should call saveAsFailed when there has been an error during the migration', async () => {
      data.items.getStats.mockResolvedValue({
        items: { total: 10, pending: 10, completed: 0, failed: 0 },
      } as SiemMigrationDataStats);
      const error = new Error('Migration error');

      const mockedRunnerInstance = {
        setup: jest.fn().mockResolvedValue(undefined),
        run: jest.fn().mockRejectedValue(error),
      } as unknown as SiemMigrationTaskRunner;

      (SiemMigrationTaskRunner as jest.Mock).mockImplementation(() => mockedRunnerInstance);

      const client = new TestTaskClient(
        migrationsRunning,
        logger,
        data,
        request,
        currentUser,
        dependencies
      );

      const response = await client.start(params);

      // Allow the asynchronous run() call to complete its finally callback.
      await new Promise(process.nextTick);

      expect(response).toEqual({ exists: true, started: true });

      expect(data.migrations.saveAsFailed).toHaveBeenCalledWith({
        id: migrationId,
        error: error.message,
      });
    });
  });
});
