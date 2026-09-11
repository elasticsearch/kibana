/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AuthenticatedUser, KibanaRequest, Logger } from '@kbn/core/server';
import type { RunnableConfig } from '@langchain/core/runnables';
import { v4 as uuidV4 } from 'uuid';
import type { MigrationTaskItemsStats } from '../../../../../common/siem_migrations/model/common.gen';
import {
  SiemMigrationStatus,
  SiemMigrationTaskStatus,
} from '../../../../../common/siem_migrations/constants';
import type { RuleMigrationFilters } from '../../../../../common/siem_migrations/rules/types';
import type { SiemMigrationsDataClient } from '../data/siem_migrations_data_client';
import type { SiemMigrationTaskStats } from '../data/types';
import type {
  StoredSiemMigration,
  SiemMigrationsClientDependencies,
  MigrationDocument,
  ItemDocument,
} from '../types';
import type { SiemMigrationVendor } from '../../../../../common/siem_migrations/types';
import type {
  SiemMigrationTaskEvaluateParams,
  SiemMigrationTaskStartParams,
  SiemMigrationTaskStartResult,
  SiemMigrationTaskStopResult,
} from './types';
import type {
  SiemMigrationTaskRunner,
  SiemTaskRunnerConstructor,
} from './siem_migrations_task_runner';
import type { SiemMigrationEvaluatorConstructor } from './siem_migrations_task_evaluator';

export type MigrationsRunning<
  M extends MigrationDocument = StoredSiemMigration,
  I extends ItemDocument = ItemDocument,
  P extends object = {},
  C extends object = {},
  O extends object = {}
> = Map<string, SiemMigrationTaskRunner<M, I, P, C, O>>;

export abstract class SiemMigrationsTaskClient<
  M extends MigrationDocument = StoredSiemMigration,
  I extends ItemDocument = ItemDocument,
  P extends object = {}, // The migration task input parameters schema
  C extends object = {}, // The migration task config schema
  O extends object = {} // The migration task output schema
> {
  protected abstract readonly TaskRunnerClass: SiemTaskRunnerConstructor<M, I, P, C, O>;
  protected abstract readonly EvaluatorClass?: SiemMigrationEvaluatorConstructor<M, I, P, C, O>;

  constructor(
    protected migrationsRunning: MigrationsRunning<M, I, P, C, O>,
    private logger: Logger,
    private data: SiemMigrationsDataClient<M, I>,
    private request: KibanaRequest,
    private currentUser: AuthenticatedUser,
    private dependencies: SiemMigrationsClientDependencies
  ) {}

  /** Starts a rule migration task */
  async start(params: SiemMigrationTaskStartParams<C>): Promise<SiemMigrationTaskStartResult> {
    const { migrationId, connectorId, invocationConfig } = params;
    if (this.migrationsRunning.has(migrationId)) {
      return { exists: true, started: false };
    }
    // Just in case some previous execution was interrupted without cleaning up
    await this.data.items.updateStatus(
      migrationId,
      { status: SiemMigrationStatus.PROCESSING },
      SiemMigrationStatus.PENDING,
      { refresh: true }
    );

    const { items, vendor } = await this.data.items.getStats(migrationId);
    if (items.total === 0) {
      return { exists: false, started: false };
    }
    if (items.pending === 0) {
      return { exists: true, started: false };
    }

    const migrationLogger = this.logger.get(migrationId);
    const abortController = new AbortController();
    const migrationTaskRunner = new this.TaskRunnerClass(
      migrationId,
      vendor,
      this.request,
      this.currentUser,
      abortController,
      this.data,
      migrationLogger,
      this.dependencies
    );

    await migrationTaskRunner.setup(connectorId);

    if (this.migrationsRunning.has(migrationId)) {
      // Just to prevent a race condition in the setup
      throw new Error('Task already running for this migration');
    }

    migrationLogger.info('Starting migration');

    this.migrationsRunning.set(migrationId, migrationTaskRunner);

    await this.data.migrations.saveAsStarted({
      id: migrationId,
      connectorId,
      ...this.getLastExecutionConfig(invocationConfig),
    });

    // run the migration in the background without awaiting and resolve the `start` promise
    migrationTaskRunner
      .run(invocationConfig)
      .then(() => {
        // The task runner has finished normally. Abort errors are also handled here, it's an expected finish scenario, nothing special should be done.
        migrationLogger.debug('Migration execution task finished');
        this.data.migrations.saveAsFinished({ id: migrationId }).catch((error) => {
          migrationLogger.error(`Error saving migration as finished: ${error}`);
        });
      })
      .catch((error) => {
        // Unexpected errors, no use in throwing them since the `start` promise is long gone. Just log and store the error message
        migrationLogger.error(`Error executing migration task: ${error}`);
        this.data.migrations
          .saveAsFailed({ id: migrationId, error: error.message })
          .catch((saveError) => {
            migrationLogger.error(`Error saving migration as failed: ${saveError}`);
          });
      })
      .finally(() => {
        this.migrationsRunning.delete(migrationId);
      });

    return { exists: true, started: true };
  }

  /** Updates all the rules in a migration to be re-executed */
  public async updateToRetry(
    migrationId: string,
    filter: RuleMigrationFilters
  ): Promise<{ updated: boolean }> {
    this.logger.warn(
      `Updating migration ID:${migrationId} to retry with filter: ${JSON.stringify(
        filter,
        null,
        2
      )}`
    );
    if (this.migrationsRunning.has(migrationId)) {
      // not update migrations that are currently running
      return { updated: false };
    }
    filter.installed = false; // only retry rules that are not installed
    await this.data.items.updateStatus(migrationId, filter, SiemMigrationStatus.PENDING, {
      refresh: true,
    });
    return { updated: true };
  }

  /** Returns the stats of a migration */
  public async getStats(migrationId: string): Promise<SiemMigrationTaskStats> {
    const migration = await this.data.migrations.get(migrationId);
    if (!migration) {
      throw new Error(`Migration with ID ${migrationId} not found`);
    }
    const dataStats = await this.data.items.getStats(migrationId);
    const taskStats = this.getTaskStats(migration, dataStats.items);
    return { ...taskStats, ...dataStats, name: migration.name };
  }

  /** Returns the stats of all migrations */
  async getAllStats(): Promise<SiemMigrationTaskStats[]> {
    const allDataStats = await this.data.items.getAllStats();
    const allMigrations = await this.data.migrations.getAll();
    const allMigrationsMap = new Map<string, StoredSiemMigration>(
      allMigrations.map((migration) => [migration.id, migration])
    );

    const allStats: SiemMigrationTaskStats[] = [];

    for (const dataStats of allDataStats) {
      const migration = allMigrationsMap.get(dataStats.id);
      if (migration) {
        const tasksStats = this.getTaskStats(migration, dataStats.items);
        allStats.push({ name: migration.name, ...tasksStats, ...dataStats });
      }
    }
    return allStats;
  }

  private getTaskStats(
    migration: StoredSiemMigration,
    dataStats: MigrationTaskItemsStats
  ): Pick<SiemMigrationTaskStats, 'status' | 'last_execution'> {
    return {
      status: this.getTaskStatus(migration, dataStats),
      last_execution: migration.last_execution,
    };
  }

  private getTaskStatus(
    migration: StoredSiemMigration,
    dataStats: MigrationTaskItemsStats
  ): SiemMigrationTaskStatus {
    const { id: migrationId, last_execution: lastExecution } = migration;
    if (this.migrationsRunning.has(migrationId)) {
      return SiemMigrationTaskStatus.RUNNING;
    }
    if (dataStats.completed + dataStats.failed === dataStats.total) {
      return SiemMigrationTaskStatus.FINISHED;
    }
    if (lastExecution?.is_stopped) {
      return SiemMigrationTaskStatus.STOPPED;
    }
    if (dataStats.pending === dataStats.total) {
      return SiemMigrationTaskStatus.READY;
    }
    return SiemMigrationTaskStatus.INTERRUPTED;
  }

  // Overridable method to get the last execution config
  protected getLastExecutionConfig(_invocationConfig: RunnableConfig<C>): Record<string, unknown> {
    return {};
  }

  /** Stops one running migration */
  async stop(migrationId: string): Promise<SiemMigrationTaskStopResult> {
    try {
      const migrationRunning = this.migrationsRunning.get(migrationId);
      if (migrationRunning) {
        migrationRunning.abortController.abort('Stopped by user');
        await this.data.migrations.setIsStopped({ id: migrationId });
        return { exists: true, stopped: true };
      }

      const { items } = await this.data.items.getStats(migrationId);
      if (items.total > 0) {
        return { exists: true, stopped: true };
      }
      return { exists: false, stopped: true };
    } catch (err) {
      this.logger.error(`Error stopping migration ID:${migrationId}`, err);
      return { exists: true, stopped: false };
    }
  }

  /** Creates a new evaluator for the rule migration task */
  async evaluate(params: SiemMigrationTaskEvaluateParams<C>): Promise<void> {
    if (!this.EvaluatorClass) {
      throw new Error('Evaluator class needs to be defined to use evaluate method');
    }
    const { evaluationId, langsmithOptions, connectorId, abortController } = params;

    const migrationLogger = this.logger.get('evaluate');

    const taskRunner = new this.TaskRunnerClass(
      evaluationId,
      this.request,
      this.currentUser,
      abortController,
      this.data,
      migrationLogger,
      this.dependencies
    );

    const migrationTaskEvaluator = new this.EvaluatorClass(
      taskRunner,
      this.dependencies,
      this.logger
    );

    await migrationTaskEvaluator.evaluate({
      connectorId,
      langsmithOptions,
    });
  }

  /** Creates a single-invocation runner for direct graph execution (evals). No DB writes. */
  async createInvoker(
    connectorId: string,
    opts: { abortController: AbortController; vendor: SiemMigrationVendor }
  ): Promise<{ execute: (input: P, config?: RunnableConfig<C>) => Promise<O> }> {
    const invokeId = uuidV4();
    const invokeLogger = this.logger.get('invoke');
    const runner = new this.TaskRunnerClass(
      invokeId,
      opts.vendor,
      this.request,
      this.currentUser,
      opts.abortController,
      this.data,
      invokeLogger,
      this.dependencies
    );
    await runner.setup(connectorId);
    return {
      execute: (input: P, config?: RunnableConfig<C>) =>
        runner.executeTask(input, {
          ...config,
          signal: opts.abortController.signal,
          metadata: { migrationId: invokeId, evalsInvoke: true },
        }),
    };
  }

  /** Returns if a migration is running or not */
  isMigrationRunning(migrationId: string): boolean {
    return this.migrationsRunning.has(migrationId);
  }
}
