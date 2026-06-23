/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { random } from 'lodash';
import { schema } from '@kbn/config-schema';
import type { Plugin, CoreSetup, CoreStart, KibanaRequest } from '@kbn/core/server';
import { throwRetryableError } from '@kbn/task-manager-plugin/server/task_running';
import { EventEmitter } from 'events';
import { firstValueFrom, Subject } from 'rxjs';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
  ConcreteTaskInstance,
  RunContext,
} from '@kbn/task-manager-plugin/server';
import { DEFAULT_MAX_WORKERS } from '@kbn/task-manager-plugin/server/config';
import {
  getDeleteTaskRunResult,
  TaskCost,
  TaskPriority,
} from '@kbn/task-manager-plugin/server/task';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import { initRoutes } from './init_routes';

// this plugin's dependendencies
export interface SampleTaskManagerFixtureSetupDeps {
  taskManager: TaskManagerSetupContract;
}
export interface SampleTaskManagerFixtureStartDeps {
  taskManager: TaskManagerStartContract;
}

export class SampleTaskManagerFixturePlugin
  implements
    Plugin<void, void, SampleTaskManagerFixtureSetupDeps, SampleTaskManagerFixtureStartDeps>
{
  taskManagerStart$: Subject<TaskManagerStartContract> = new Subject<TaskManagerStartContract>();
  taskManagerStart: Promise<TaskManagerStartContract> = firstValueFrom(this.taskManagerStart$);

  public setup(core: CoreSetup, { taskManager }: SampleTaskManagerFixtureSetupDeps) {
    const taskTestingEvents = new EventEmitter();
    taskTestingEvents.setMaxListeners(DEFAULT_MAX_WORKERS * 2);

    const defaultSampleTaskConfig = {
      timeout: '1m',
      // This task allows tests to specify its behavior (whether it reschedules itself, whether it errors, etc)
      // taskInstance.params has the following optional fields:
      //    nextRunMilliseconds: number - If specified, the run method will return a runAt that is now + nextRunMilliseconds
      //    failWith: string - If specified, the task will throw an error with the specified message
      //    failOn: number - If specified, the task will only throw the `failWith` error when `count` equals to the failOn value
      //    waitForParams : boolean - should the task stall ands wait to receive params asynchronously before using the default params
      //    waitForEvent : string - if provided, the task will stall (after completing the run) and wait for an asyn event before completing
      createTaskRunner: ({ taskInstance }: { taskInstance: ConcreteTaskInstance }) => ({
        async run() {
          const { params, state, id } = taskInstance;
          const prevState = state || { count: 0 };

          const count = (prevState.count || 0) + 1;

          const runParams = {
            ...params,
            // if this task requires custom params provided async - wait for them
            ...(params.waitForParams ? await once(taskTestingEvents, id) : {}),
          };

          if (runParams.failWith) {
            if (!runParams.failOn || (runParams.failOn && count === runParams.failOn)) {
              throw new Error(runParams.failWith);
            }
          }

          const [{ elasticsearch }] = await core.getStartServices();
          await elasticsearch.client.asInternalUser.index({
            index: '.kibana_task_manager_test_result',
            document: {
              type: 'task',
              taskId: taskInstance.id,
              params: JSON.stringify(runParams),
              state: JSON.stringify(state),
              ranAt: new Date(),
            },
            refresh: true,
          });

          // Stall task  run until a certain event is triggered
          if (runParams.waitForEvent) {
            await once(taskTestingEvents, runParams.waitForEvent);
          }

          return {
            state: { count },
            runAt: millisecondsFromNow(runParams.nextRunMilliseconds),
          };
        },
      }),
    };

    taskManager.registerTaskDefinitions({
      sampleTask: {
        ...defaultSampleTaskConfig,
        title: 'Sample Task',
        description: 'A sample task for testing the task_manager.',
        stateSchemaByVersion: {
          1: {
            up: (state: Record<string, unknown>) => ({ count: state.count }),
            schema: schema.object({
              count: schema.maybe(schema.number()),
            }),
          },
        },
      },
      sampleUserResolvingTask: {
        title: 'Sample User Resolving Task',
        description:
          'A task that captures security.authc.getCurrentUser(fakeRequest) and the output of enriching a child request into task state, used to verify profile_uid enrichment end-to-end.',
        timeout: '1m',
        maxAttempts: 1,
        stateSchemaByVersion: {
          1: {
            up: (state: Record<string, unknown>) => state,
            schema: schema.object({
              resolvedFromTaskRequest: schema.maybe(
                schema.nullable(
                  schema.object({
                    profileUid: schema.maybe(schema.string()),
                    usernameWasUndefined: schema.boolean(),
                  })
                )
              ),
              resolvedFromChildRequest: schema.maybe(
                schema.nullable(
                  schema.object({
                    profileUid: schema.maybe(schema.string()),
                    usernameWasUndefined: schema.boolean(),
                  })
                )
              ),
              ran: schema.maybe(schema.boolean()),
            }),
          },
        },
        createTaskRunner: ({ taskInstance, fakeRequest, enrichRequest }: RunContext) => ({
          async run() {
            // Use Core's wrapped security so getCurrentUser consults the
            // fake-request enrichment map.
            const [{ security, elasticsearch }] = await core.getStartServices();

            const resolveUser = (request: KibanaRequest | undefined) => {
              if (!request) {
                return null;
              }
              const user = security.authc.getCurrentUser(request);
              if (!user) {
                return null;
              }
              // Verify identity fields are suppressed (read returns undefined).
              const usernameWasUndefined = user.username === undefined;
              return { profileUid: user.profile_uid, usernameWasUndefined };
            };

            const resolvedFromTaskRequest = resolveUser(fakeRequest);

            let resolvedFromChildRequest = null;
            if (fakeRequest && enrichRequest) {
              const childFakeRequest = kibanaRequestFactory({
                headers: {
                  authorization: (fakeRequest.headers.authorization as string) ?? '',
                },
                path: '/',
              });
              enrichRequest(childFakeRequest);
              resolvedFromChildRequest = resolveUser(childFakeRequest);
            }

            await elasticsearch.client.asInternalUser.index({
              index: '.kibana_task_manager_test_result',
              document: {
                type: 'task',
                taskId: taskInstance.id,
                state: JSON.stringify({
                  resolvedFromTaskRequest,
                  resolvedFromChildRequest,
                }),
                ranAt: new Date(),
              },
              refresh: true,
            });

            return {
              state: {
                resolvedFromTaskRequest,
                resolvedFromChildRequest,
                ran: true,
              },
            };
          },
        }),
      },
      sampleRecurringTask: {
        timeout: '1m',
        title: 'Sample Recurring Task',
        description: 'A sample recurring task for testing the task_manager.',
        stateSchemaByVersion: {
          1: {
            up: (state: Record<string, unknown>) => ({ count: state.count }),
            schema: schema.object({
              count: schema.maybe(schema.number()),
            }),
          },
        },
        createTaskRunner: ({ taskInstance }: { taskInstance: ConcreteTaskInstance }) => ({
          async run() {
            const { params, state, schedule } = taskInstance;

            const [{ elasticsearch }] = await core.getStartServices();
            await elasticsearch.client.asInternalUser.index({
              index: '.kibana_task_manager_test_result',
              document: {
                type: 'task',
                taskId: taskInstance.id,
                params: JSON.stringify(params),
                state: JSON.stringify(state),
                ranAt: new Date(),
              },
              refresh: true,
            });

            return {
              state: {},
              schedule,
            };
          },
        }),
      },
      singleAttemptSampleTask: {
        ...defaultSampleTaskConfig,
        title: 'Failing Sample Task',
        description:
          'A sample task for testing the task_manager that fails on the first attempt to run.',
        // fail after the first failed run
        maxAttempts: 1,
        stateSchemaByVersion: {
          1: {
            up: (state: Record<string, unknown>) => ({ count: state.count }),
            schema: schema.object({
              count: schema.maybe(schema.number()),
            }),
          },
        },
      },
      sampleTaskWithSingleConcurrency: {
        ...defaultSampleTaskConfig,
        title: 'Sample Task With Single Concurrency',
        maxConcurrency: 1,
        timeout: '60s',
        description: 'A sample task that can only have one concurrent instance.',
        stateSchemaByVersion: {
          1: {
            up: (state: Record<string, unknown>) => ({ count: state.count }),
            schema: schema.object({
              count: schema.maybe(schema.number()),
            }),
          },
        },
      },
      sampleTaskSharedConcurrencyType1: {
        ...defaultSampleTaskConfig,
        title: 'Sample Task With Shared Concurrency 1',
        maxConcurrency: 1,
        timeout: '60s',
        description: 'A sample task that shares concurrency with another task type.',
        stateSchemaByVersion: {
          1: {
            up: (state: Record<string, unknown>) => ({ count: state.count }),
            schema: schema.object({
              count: schema.maybe(schema.number()),
            }),
          },
        },
      },
      sampleTaskSharedConcurrencyType2: {
        ...defaultSampleTaskConfig,
        title: 'Sample Task With Shared Concurrency 2',
        maxConcurrency: 1,
        timeout: '60s',
        description: 'A sample task that shares concurrency with another task type.',
        stateSchemaByVersion: {
          1: {
            up: (state: Record<string, unknown>) => ({ count: state.count }),
            schema: schema.object({
              count: schema.maybe(schema.number()),
            }),
          },
        },
      },
      sampleTaskWithLimitedConcurrency: {
        ...defaultSampleTaskConfig,
        title: 'Sample Task With Max Concurrency of 2',
        maxConcurrency: 2,
        timeout: '60s',
        description: 'A sample task that can only have two concurrent instance.',
        stateSchemaByVersion: {
          1: {
            up: (state: Record<string, unknown>) => ({ count: state.count }),
            schema: schema.object({
              count: schema.maybe(schema.number()),
            }),
          },
        },
      },
      sampleRecurringTaskDisablesItself: {
        title: 'Sample Recurring Task that disables itself',
        description: 'A sample task that disables itself.',
        maxAttempts: 3,
        timeout: '60s',
        createTaskRunner: () => ({
          async run() {
            await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 seconds
            return {
              shouldDisableTask: true,
              state: {},
            };
          },
        }),
      },
      sampleRecurringTaskTimingOut: {
        title: 'Sample Recurring Task that Times Out',
        description: 'A sample task that times out each run.',
        maxAttempts: 3,
        timeout: '1s',
        createTaskRunner: () => ({
          async run() {
            return await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 seconds
          },
        }),
      },
      sampleRecurringTaskTimingOutWithError: {
        title: 'Sample Recurring Task that Times Out and Throws an Error',
        description: 'A sample task that times out each run and throws an error.',
        maxAttempts: 3,
        timeout: '1s',
        createTaskRunner: () => {
          let isCancelled: boolean = false;
          return {
            async run() {
              await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 seconds
              if (isCancelled) {
                throw new Error('The task was cancelled and there was an error!');
              }
            },
            async cancel() {
              isCancelled = true;
            },
          };
        },
      },
      sampleRecurringTaskThatDeletesItself: {
        title: 'Sample Recurring Task that Times Out',
        description: 'A sample task that requests deletion.',
        stateSchemaByVersion: {
          1: {
            up: (state: Record<string, unknown>) => ({ count: state.count }),
            schema: schema.object({
              count: schema.maybe(schema.number()),
            }),
          },
        },
        createTaskRunner: ({ taskInstance }: { taskInstance: ConcreteTaskInstance }) => ({
          async run() {
            const { state } = taskInstance;
            const prevState = state || { count: 0 };

            const count = (prevState.count || 0) + 1;

            const [{ elasticsearch }] = await core.getStartServices();
            await elasticsearch.client.asInternalUser.index({
              index: '.kibana_task_manager_test_result',
              body: {
                type: 'task',
                taskId: taskInstance.id,
                state: JSON.stringify(state),
                ranAt: new Date(),
              },
              refresh: true,
            });

            if (count === 5) {
              return getDeleteTaskRunResult();
            }
            return {
              state: { count },
            };
          },
        }),
      },
      sampleAdHocTaskTimingOut: {
        title: 'Sample Ad-Hoc Task that Times Out',
        description: 'A sample task that times out.',
        maxAttempts: 3,
        timeout: '1s',
        createTaskRunner: ({ taskInstance }: { taskInstance: ConcreteTaskInstance }) => {
          let isCancelled: boolean = false;
          return {
            async run() {
              // wait for 15 seconds
              await new Promise((r) => setTimeout(r, 15000));

              if (!isCancelled) {
                const [{ elasticsearch }] = await core.getStartServices();
                await elasticsearch.client.asInternalUser.index({
                  index: '.kibana_task_manager_test_result',
                  body: {
                    type: 'task',
                    taskType: 'sampleAdHocTaskTimingOut',
                    taskId: taskInstance.id,
                  },
                  refresh: true,
                });
              }
            },
            async cancel() {
              isCancelled = true;
            },
          };
        },
      },
      sampleRecurringTaskWhichHangs: {
        title: 'Sample Recurring Task that Hangs for a minute',
        description: 'A sample task that Hangs for a minute on each run.',
        maxAttempts: 3,
        timeout: '60s',
        createTaskRunner: () => ({
          async run() {
            return await new Promise((resolve) => {});
          },
        }),
      },
      sampleLongRunningRecurringTask: {
        title: 'Sample Long Running Recurring Task',
        description: 'A sample long running task that hangs for 1m 30s.',
        timeout: '365d',
        createTaskRunner: () => ({
          async run() {
            await new Promise((resolve) => setTimeout(resolve, 90000));
            return {
              state: {},
            };
          },
        }),
      },
      sampleOneTimeTaskThrowingError: {
        title: 'Sample One-Time Task that throws an error',
        description: 'A sample task that throws an error each run.',
        maxAttempts: 3,
        createTaskRunner: () => ({
          async run() {
            throwRetryableError(new Error('Error'), new Date(Date.now() + random(2, 5) * 1000));
          },
        }),
      },
      taskToDisable: {
        title: 'Task used for testing it being disabled',
        description: '',
        maxAttempts: 1,
        paramsSchema: schema.object({}),
        createTaskRunner: () => ({
          async run() {},
        }),
      },
      extraLargeCostTask: {
        title: 'Task used for testing task cost',
        cost: TaskCost.ExtraLarge,
        createTaskRunner: ({ taskInstance }: { taskInstance: ConcreteTaskInstance }) => ({
          async run() {
            const { state, schedule } = taskInstance;
            const prevState = state || { count: 0 };
            const count = (prevState.count || 0) + 1;

            const [{ elasticsearch }] = await core.getStartServices();
            await elasticsearch.client.asInternalUser.index({
              index: '.kibana_task_manager_test_result',
              body: {
                type: 'task',
                taskType: 'extraLargeCostTask',
                taskId: taskInstance.id,
                state: JSON.stringify(state),
                ranAt: new Date(),
              },
              refresh: true,
            });

            return {
              state: { count },
              schedule,
            };
          },
        }),
      },
      lowPriorityTask: {
        title: 'Task used for testing priority claiming',
        priority: TaskPriority.Low,
        createTaskRunner: ({ taskInstance }: { taskInstance: ConcreteTaskInstance }) => ({
          async run() {
            const { state, schedule } = taskInstance;
            const prevState = state || { count: 0 };

            const count = (prevState.count || 0) + 1;

            const [{ elasticsearch }] = await core.getStartServices();
            await elasticsearch.client.asInternalUser.index({
              index: '.kibana_task_manager_test_result',
              body: {
                type: 'task',
                taskType: 'lowPriorityTask',
                taskId: taskInstance.id,
                state: JSON.stringify(state),
                ranAt: new Date(),
              },
              refresh: true,
            });

            return {
              state: { count },
              schedule,
            };
          },
        }),
      },
      normalLongRunningPriorityTask: {
        title: 'Task used for testing long running priority claiming',
        priority: TaskPriority.Low,
        createTaskRunner: ({ taskInstance }: { taskInstance: ConcreteTaskInstance }) => ({
          async run() {
            const { state, schedule } = taskInstance;
            const prevState = state || { count: 0 };

            const count = (prevState.count || 0) + 1;

            const [{ elasticsearch }] = await core.getStartServices();
            await elasticsearch.client.asInternalUser.index({
              index: '.kibana_task_manager_test_result',
              body: {
                type: 'task',
                taskType: 'normalLongRunningPriorityTask',
                taskId: taskInstance.id,
                state: JSON.stringify(state),
                ranAt: new Date(),
              },
              refresh: true,
            });

            return {
              state: { count },
              schedule,
            };
          },
        }),
      },
    });

    const taskWithTiming = {
      createTaskRunner: ({ taskInstance }: { taskInstance: ConcreteTaskInstance }) => ({
        async run() {
          const stopTiming = startTaskTimer();

          const {
            params: { delay = 0 },
            state: { timings = [] },
          } = taskInstance;

          if (delay) {
            await new Promise((resolve) => {
              setTimeout(resolve, delay);
            });
          }

          return {
            state: { timings: [...timings, stopTiming()] },
          };
        },
      }),
    };

    taskManager.registerTaskDefinitions({
      timedTask: {
        title: 'Task With Tracked Timings',
        timeout: '60s',
        description: 'A task that tracks its execution timing.',
        ...taskWithTiming,
      },
      timedTaskWithSingleConcurrency: {
        title: 'Task With Tracked Timings and Single Concurrency',
        maxConcurrency: 1,
        timeout: '60s',
        description:
          'A task that can only have one concurrent instance and tracks its execution timing.',
        ...taskWithTiming,
      },
      timedTaskWithLimitedConcurrency: {
        title: 'Task With Tracked Timings and Limited Concurrency',
        maxConcurrency: 2,
        timeout: '60s',
        description:
          'A task that can only have two concurrent instance and tracks its execution timing.',
        ...taskWithTiming,
      },
    });

    taskManager.addMiddleware({
      async beforeSave({ taskInstance, ...opts }) {
        const modifiedInstance = {
          ...taskInstance,
          params: {
            originalParams: taskInstance.params,
            superFly: 'My middleware param!',
          },
        };

        return {
          ...opts,
          taskInstance: modifiedInstance,
        };
      },

      async beforeRun({ taskInstance, ...opts }) {
        return {
          ...opts,
          taskInstance: {
            ...taskInstance,
            params: taskInstance.params.originalParams,
          },
        };
      },

      async beforeMarkRunning(context) {
        if (context.taskInstance?.params?.originalParams?.throwOnMarkAsRunning) {
          throw new Error(`Sample task ${context.taskInstance.id} threw on MarkAsRunning`);
        }
        return context;
      },
    });
    initRoutes(
      core.http.createRouter(),
      this.taskManagerStart,
      core.getStartServices().then(([{ security }]) => security),
      taskTestingEvents
    );
  }

  public start(core: CoreStart, { taskManager }: SampleTaskManagerFixtureStartDeps) {
    this.taskManagerStart$.next(taskManager);
    this.taskManagerStart$.complete();
  }
  public stop() {}
}

function millisecondsFromNow(ms: number) {
  if (!ms) {
    return;
  }

  const dt = new Date();
  dt.setTime(dt.getTime() + ms);
  return dt;
}

const once = function (emitter: EventEmitter, event: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    emitter.once(event, (data) => resolve(data || {}));
  });
};

function startTaskTimer(): () => { start: number; stop: number } {
  const start = Date.now();
  return () => ({ start, stop: Date.now() });
}
