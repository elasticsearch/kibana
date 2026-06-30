/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import {
  SavedObjectsErrorHelpers,
  type CoreStart,
  type ElasticsearchClient,
  type KibanaRequest,
} from '@kbn/core/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { LicenseType } from '@kbn/licensing-types';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/server';
import {
  getTaskId,
  removeEntityMaintainer,
  scheduleEntityMaintainerTask,
  startEntityMaintainer,
  stopEntityMaintainer,
} from '../../tasks/entity_maintainers';
import {
  canRunMaintainerWithLicense,
  createMaintainerStatus,
  persistMaintainerState,
  runEntityMaintainerTask,
} from '../../tasks/entity_maintainers/execution';
import { entityMaintainersRegistry } from '../../tasks/entity_maintainers/entity_maintainers_registry';
import type {
  EntityMaintainerState,
  EntityMaintainerStatus,
} from '../../tasks/entity_maintainers/types';
import { EntityMaintainerTaskStatus } from '../../tasks/entity_maintainers/types';
import type { TelemetryReporter } from '../../telemetry/events';
import { CRUDClient } from '../crud';
import { EntityMetadataClient } from '../entity_metadata';
import { createMaintainerTelemetryClient } from '../../tasks/entity_maintainers/maintainer_telemetry_client';

interface TaskSnapshot {
  runs: number;
  lastSuccessTimestamp: string | null;
  lastErrorTimestamp: string | null;
  state: EntityMaintainerState;
}

export interface EntityMaintainerListEntry {
  id: string;
  taskStatus: EntityMaintainerTaskStatus;
  interval: string;
  description?: string;
  nextRunAt: string | null;
  minLicense: LicenseType;
  taskSnapshot?: TaskSnapshot;
}

interface EntityMaintainersClientDeps {
  logger: Logger;
  taskManager: TaskManagerStartContract;
  namespace: string;
  analytics: TelemetryReporter;
  coreStart: CoreStart;
  licensing: LicensingPluginStart;
}

interface SyncExecutionContext {
  taskId: string;
  status: EntityMaintainerStatus;
  abortController: AbortController;
  logger: Logger;
  fakeRequest: KibanaRequest;
  esClient: ElasticsearchClient;
  cpsEsClient: ElasticsearchClient;
  crudClient: CRUDClient;
  entityMetadataClient: EntityMetadataClient;
}

export class EntityMaintainersClient {
  private readonly logger: Logger;
  private readonly taskManager: TaskManagerStartContract;
  private readonly namespace: string;
  private readonly analytics: TelemetryReporter;
  private readonly coreStart: CoreStart;
  private readonly licensing: LicensingPluginStart;

  constructor(deps: EntityMaintainersClientDeps) {
    this.logger = deps.logger;
    this.taskManager = deps.taskManager;
    this.namespace = deps.namespace;
    this.analytics = deps.analytics;
    this.coreStart = deps.coreStart;
    this.licensing = deps.licensing;
  }

  public async start(id: string, request: KibanaRequest): Promise<void> {
    if (!entityMaintainersRegistry.hasId(id)) {
      return;
    }
    this.logger.debug(`Starting entity maintainer task: ${id}`);
    try {
      await startEntityMaintainer({
        taskManager: this.taskManager,
        id,
        namespace: this.namespace,
        logger: this.logger,
        request,
        analytics: this.analytics,
      });
    } catch (error) {
      this.logger.error(`Failed to start entity maintainer task: ${id}`, { error });
      throw error;
    }
  }

  /**
   * Schedules only maintainers that do not yet have a task document (taskSnapshot undefined).
   * Uses getMaintainers() to determine which registry entries already have tasks.
   */
  public async init(request: KibanaRequest, options?: { autoStart?: boolean }): Promise<void> {
    this.logger.debug('Initializing entity maintainer tasks');
    try {
      const maintainers = await this.getMaintainers();
      const toSchedule = maintainers.filter((m) => m.taskSnapshot === undefined);
      await Promise.all(
        toSchedule.map(async ({ id, interval }) => {
          await scheduleEntityMaintainerTask({
            logger: this.logger,
            taskManager: this.taskManager,
            id,
            interval,
            namespace: this.namespace,
            request,
            enabled: options?.autoStart ?? true,
          });
        })
      );
    } catch (error) {
      this.logger.error('Failed to initialize entity maintainer tasks', { error });
      throw error;
    }
  }

  public async stop(id: string, request: KibanaRequest): Promise<void> {
    if (!entityMaintainersRegistry.hasId(id)) {
      return;
    }
    this.logger.debug(`Stopping entity maintainer task: ${id}`);
    try {
      await stopEntityMaintainer({
        taskManager: this.taskManager,
        id,
        request,
        namespace: this.namespace,
        logger: this.logger,
        analytics: this.analytics,
      });
    } catch (error) {
      this.logger.error(`Failed to stop entity maintainer task: ${id}`, { error });
      throw error;
    }
  }

  public async runNow(id: string): Promise<void> {
    try {
      if (!entityMaintainersRegistry.hasId(id)) {
        this.logger.debug(`Maintainer not found, skipping run now: ${id}`);
        return;
      }
      const taskId = getTaskId(id, this.namespace);
      await this.taskManager.runSoon(taskId);
    } catch (error) {
      this.logger.error(`Failed to run entity maintainer task: ${id}`, { error });
      throw error;
    }
  }

  public async runSync(id: string, request: KibanaRequest): Promise<void> {
    try {
      if (!entityMaintainersRegistry.hasId(id)) {
        this.logger.debug(`Maintainer not found, skipping run sync: ${id}`);
        return;
      }
      const { run, setup, initialState } = entityMaintainersRegistry.getLifecycle(id);
      const { minLicense } = entityMaintainersRegistry.get(id);
      const hasValidLicense = await canRunMaintainerWithLicense({
        id,
        minLicense,
        licensing: this.licensing,
        logger: this.logger,
      });
      if (!hasValidLicense) {
        // Keep sync behavior aligned with task execution, skip run when license is invalid
        return;
      }

      const { taskId, ...executionContext } = await this.getSyncExecutionContext({
        id,
        request,
        initialState,
      });

      const telemetryClient = createMaintainerTelemetryClient({
        id,
        namespace: this.namespace,
        analytics: this.analytics,
      });

      const result = await runEntityMaintainerTask({
        ...executionContext,
        id,
        run,
        setup,
        analytics: this.analytics,
        telemetryClient,
      });

      await persistMaintainerState({
        taskManager: this.taskManager,
        taskId,
        state: result.state,
        request,
      });
    } catch (error) {
      this.logger.error(`Failed to run entity maintainer task synchronously: ${id}`, { error });
      throw error;
    }
  }

  public async stopAll(request: KibanaRequest): Promise<void> {
    this.logger.debug('Stopping all entity maintainer tasks');
    const tasks = entityMaintainersRegistry.getAll();
    const results = await Promise.allSettled(tasks.map(({ id }) => this.stop(id, request)));
    const failures = results
      .map((r, i) => ({ result: r, id: tasks[i].id }))
      .filter(
        (x): x is { result: PromiseRejectedResult; id: string } => x.result.status === 'rejected'
      );
    if (failures.length > 0) {
      failures.forEach(({ result, id }) => {
        this.logger.error(`Failed to stop entity maintainer task: ${id}`, { error: result.reason });
      });
      throw new Error(
        `Failed to stop ${failures.length} of ${tasks.length} entity maintainer tasks: ${failures
          .map(({ id }) => id)
          .join(', ')}`
      );
    }
  }

  public async startAll(request: KibanaRequest): Promise<void> {
    this.logger.debug('Starting all entity maintainer tasks');
    const tasks = entityMaintainersRegistry.getAll();
    const results = await Promise.allSettled(tasks.map(({ id }) => this.start(id, request)));
    const failures = results
      .map((r, i) => ({ result: r, id: tasks[i].id }))
      .filter(
        (x): x is { result: PromiseRejectedResult; id: string } => x.result.status === 'rejected'
      );
    if (failures.length > 0) {
      failures.forEach(({ result, id }) => {
        this.logger.error(`Failed to start entity maintainer task: ${id}`, {
          error: result.reason,
        });
      });
      throw new Error(
        `Failed to start ${failures.length} of ${tasks.length} entity maintainer tasks: ${failures
          .map(({ id }) => id)
          .join(', ')}`
      );
    }
  }

  public async removeAll(): Promise<void> {
    this.logger.debug('Removing all entity maintainer tasks');
    try {
      const tasks = entityMaintainersRegistry.getAll();
      await Promise.all(
        tasks.map(async ({ id }) => {
          await removeEntityMaintainer({
            taskManager: this.taskManager,
            id,
            namespace: this.namespace,
            logger: this.logger,
            analytics: this.analytics,
          });
        })
      );
    } catch (error) {
      this.logger.error('Failed to remove all entity maintainer tasks', { error });
      throw error;
    }
  }

  public async getMaintainers(ids?: string[]): Promise<EntityMaintainerListEntry[]> {
    const entries = entityMaintainersRegistry.getAll();
    const filteredEntries = ids?.length ? entries.filter(({ id }) => ids.includes(id)) : entries;

    const results = await Promise.all(
      filteredEntries.map(async (entry): Promise<EntityMaintainerListEntry> => {
        const { id, interval, description, minLicense } = entry;
        const taskId = getTaskId(id, this.namespace);
        let taskSnapshot: TaskSnapshot | undefined;
        let nextRunAt: string | null = null;
        let taskStatus: EntityMaintainerTaskStatus = EntityMaintainerTaskStatus.NEVER_STARTED;

        try {
          const task = await this.taskManager.get(taskId);
          const { metadata, state, taskStatus: taskStatusFromState } = task.state;
          nextRunAt = task.runAt?.toISOString() ?? null;
          taskStatus = taskStatusFromState;
          const runs = metadata?.runs ?? 0;
          const lastSuccessTimestamp = metadata?.lastSuccessTimestamp ?? null;
          const lastErrorTimestamp = metadata?.lastErrorTimestamp ?? null;
          taskSnapshot = {
            runs,
            lastSuccessTimestamp,
            lastErrorTimestamp,
            state,
          };
        } catch (error) {
          // NotFound is part of the expected flow, it means the task has been registered but has not been scheduled yet.
          if (!SavedObjectsErrorHelpers.isNotFoundError(error)) {
            this.logger.error(`Failed to get task snapshot for entity maintainer: ${id}`, {
              error,
            });
            throw error;
          }
        }

        return {
          id,
          taskStatus,
          interval,
          description,
          nextRunAt,
          minLicense,
          taskSnapshot,
        };
      })
    );

    return results;
  }

  private async getSyncExecutionContext({
    id,
    request,
    initialState,
  }: {
    id: string;
    request: KibanaRequest;
    initialState: EntityMaintainerState;
  }): Promise<SyncExecutionContext> {
    const taskId = getTaskId(id, this.namespace);
    const task = await this.taskManager.get(taskId);
    const taskStatus = task.state as Partial<EntityMaintainerStatus>;
    const status = createMaintainerStatus({
      status: taskStatus,
      namespace: this.namespace,
      initialState,
    });
    const esClient = this.coreStart.elasticsearch.client.asScoped(request).asCurrentUser;
    const cpsEsClient = this.coreStart.elasticsearch.client.asScoped(request, {
      projectRouting: 'space',
    }).asCurrentUser;
    const crudClient = new CRUDClient({
      logger: this.logger,
      esClient,
      namespace: status.metadata.namespace,
    });
    const entityMetadataClient = new EntityMetadataClient({
      logger: this.logger,
      esClient: this.coreStart.elasticsearch.client.asInternalUser,
      namespace: status.metadata.namespace,
    });
    const abortController = new AbortController();
    const logger = this.logger.get(taskId);

    return {
      taskId,
      status,
      fakeRequest: request,
      logger,
      abortController,
      esClient,
      cpsEsClient,
      crudClient,
      entityMetadataClient,
    };
  }
}
