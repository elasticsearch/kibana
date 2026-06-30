/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ObjectType } from '@kbn/config-schema';
import type { Logger } from '@kbn/core/server';
import type { TaskDefinition, TaskRunCreatorFunction, TaskPriority, TaskCost } from './task';
import { taskDefinitionSchema } from './task';
import { CONCURRENCY_ALLOW_LIST_BY_TASK_TYPE } from './constants';

/**
 * Types that are no longer registered and will be marked as unregistered
 */
export const REMOVED_TYPES: string[] = [
  // for testing
  'sampleTaskRemovedType',

  // deprecated in https://github.com/elastic/kibana/pull/121442
  'alerting:siem.signals',

  'search_sessions_monitor',
  'search_sessions_cleanup',
  'search_sessions_expire',

  'cleanup_failed_action_executions',
  'reports:monitor',

  // deprecated in https://github.com/elastic/kibana/pull/216916
  'obs-ai-assistant:knowledge-base-migration',

  // Legacy SML crawler task types
  'agent_builder:sml_crawler',

  // removed in https://github.com/elastic/kibana/pull/250218
  'logs-data-telemetry',

  // one-off cleanup task removed after completing in its target project (added in #273285)
  'alerting:clear_stale_uiam_api_keys',
];

export const SHARED_CONCURRENCY_TASKS: string[][] = [
  // for testing
  ['sampleTaskSharedConcurrencyType1', 'sampleTaskSharedConcurrencyType2'],

  // reporting
  ['report:execute', 'report:execute-scheduled'],
];

/**
 * Defines a task which can be scheduled and run by the Kibana
 * task manager.
 */
export interface TaskRegisterDefinition {
  /**
   * A brief, human-friendly title for this task.
   */
  title?: string;
  /**
   * How long, in minutes or seconds, the system should wait for the task to complete
   * before it is considered to be timed out. (e.g. '5m', the default). If
   * the task takes longer than this, Kibana will send it a kill command and
   * the task will be re-attempted.
   */
  timeout?: string;
  /**
   * An optional definition of task priority. Tasks will be sorted by priority prior to claiming
   * so high priority tasks will always be claimed before normal priority, which will always be
   * claimed before low priority
   */
  priority?: TaskPriority;
  /**
   * An optional definition of the cost associated with running the task.
   */
  cost?: TaskCost;
  /**
   * An optional more detailed description of what this task does.
   */
  description?: string;

  /**
   * Creates an object that has a run function which performs the task's work,
   * and an optional cancel function which cancels the task.
   */
  createTaskRunner: TaskRunCreatorFunction;

  /**
   * Up to how many times the task should retry when it fails to run. This will
   * default to the global variable. The default value, if not specified, is 1.
   */
  maxAttempts?: number;
  /**
   * The maximum number tasks of this type that can be run concurrently per Kibana instance.
   * Setting this value will force Task Manager to poll for this task type separately from other task types
   * which can add significant load to the ES cluster, so please use this configuration only when absolutely necessary.
   * The default value, if not given, is 0.
   */
  maxConcurrency?: number;
  stateSchemaByVersion?: Record<
    number,
    {
      schema: ObjectType;
      up: (state: Record<string, unknown>) => Record<string, unknown>;
    }
  >;

  paramsSchema?: ObjectType;
}

/**
 * A mapping of task type id to the task definition.
 */
export type TaskDefinitionRegistry = Record<string, TaskRegisterDefinition>;

export class TaskTypeDictionary {
  private definitions = new Map<string, TaskDefinition>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  [Symbol.iterator]() {
    return this.definitions.entries();
  }

  public getAllTypes() {
    return [...this.definitions.keys()];
  }

  public getAllDefinitions() {
    return [...this.definitions.values()];
  }

  public has(type: string) {
    return this.definitions.has(type);
  }

  public size() {
    return this.definitions.size;
  }

  public get(type: string): TaskDefinition | undefined {
    return this.definitions.get(type);
  }

  public ensureHas(type: string) {
    if (!this.has(type)) {
      throw new Error(
        `Unsupported task type "${type}". Supported types are ${this.getAllTypes().join(', ')}`
      );
    }
  }

  /**
   * Method for allowing consumers to register task definitions into the system.
   * @param taskDefinitions - The Kibana task definitions dictionary
   */
  public registerTaskDefinitions(taskDefinitions: TaskDefinitionRegistry) {
    const taskTypesToRegister = Object.keys(taskDefinitions);
    const duplicate = taskTypesToRegister.find((type) => this.definitions.has(type));
    if (duplicate) {
      throw new Error(`Task ${duplicate} is already defined!`);
    }

    const invalidTaskType = taskTypesToRegister.find((type) => type.includes(','));
    if (invalidTaskType) {
      throw new Error(`Task type "${invalidTaskType}" cannot contain a comma.`);
    }

    const removed = taskTypesToRegister.find((type) => REMOVED_TYPES.indexOf(type) >= 0);
    if (removed) {
      throw new Error(`Task ${removed} has been removed from registration!`);
    }

    for (const taskType of taskTypesToRegister) {
      if (taskDefinitions[taskType].maxConcurrency !== undefined) {
        if (!CONCURRENCY_ALLOW_LIST_BY_TASK_TYPE.includes(taskType)) {
          // maxConcurrency is designed to limit how many tasks of the same type a single Kibana
          // instance should run at a time. Meaning if you have 8 Kibanas running, you will still
          // see up to 8 tasks running at a time but one per Kibana instance. This is helpful for
          // reporting purposes but not for many other cases and are better off not setting this value.
          throw new Error(`maxConcurrency setting isn't allowed for task type: ${taskType}`);
        }

        // if this task type shares concurrency with another task type and both have been
        // registered, throw an error if their maxConcurrency values are different
        this.verifySharedConcurrencyAndCost(
          taskType,
          taskDefinitions[taskType].maxConcurrency!,
          taskDefinitions[taskType].cost
        );
      }
    }

    try {
      for (const definition of sanitizeTaskDefinitions(taskDefinitions)) {
        this.definitions.set(definition.type, definition);
      }
    } catch (e) {
      this.logger.error(`Could not sanitize task definitions: ${e.message}`);
    }
  }

  private verifySharedConcurrencyAndCost(
    taskType: string,
    maxConcurrency: number,
    cost?: TaskCost
  ) {
    const shared = sharedConcurrencyTaskTypes(taskType);

    if (shared) {
      const otherTaskTypes: string[] = shared.filter((type) => type !== taskType);

      for (const otherTaskType of otherTaskTypes) {
        const otherTaskDef = this.definitions.get(otherTaskType);
        if (otherTaskDef && otherTaskDef.maxConcurrency !== maxConcurrency) {
          throw new Error(
            `Task type "${taskType}" shares concurrency limits with ${otherTaskType} but has a different maxConcurrency.`
          );
        }
        if (otherTaskDef && otherTaskDef.cost !== cost) {
          throw new Error(
            `Task type "${taskType}" shares concurrency limits with ${otherTaskType} but has a different cost.`
          );
        }
      }
    }
  }
}

/**
 * Sanitizes the system's task definitions. Task definitions have optional properties, and
 * this ensures they all are given a reasonable default.
 *
 * @param taskDefinitions - The Kibana task definitions dictionary
 */
export function sanitizeTaskDefinitions(taskDefinitions: TaskDefinitionRegistry): TaskDefinition[] {
  return Object.entries(taskDefinitions).map(([type, rawDefinition]) => {
    return taskDefinitionSchema.validate({ type, ...rawDefinition }) as TaskDefinition;
  });
}

export function sharedConcurrencyTaskTypes(taskType: string) {
  return SHARED_CONCURRENCY_TASKS.find((tasks: string[]) => tasks.includes(taskType));
}
