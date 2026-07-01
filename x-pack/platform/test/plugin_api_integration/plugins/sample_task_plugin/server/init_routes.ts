/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type {
  RequestHandlerContext,
  KibanaRequest,
  KibanaResponseFactory,
  IKibanaResponse,
  IRouter,
  IScopedClusterClient,
  FakeRawRequest,
  SecurityServiceStart,
} from '@kbn/core/server';
import type { EventEmitter } from 'events';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import {
  BACKGROUND_TASK_NODE_SO_NAME,
  TASK_SO_NAME,
} from '@kbn/task-manager-plugin/server/saved_objects';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';

const scope = 'testing';
const taskManagerQuery = {
  bool: {
    filter: {
      bool: {
        must: [
          {
            term: {
              'task.scope': scope,
            },
          },
        ],
      },
    },
  },
};

const innerTaskSchema = schema.object({
  enabled: schema.boolean({ defaultValue: true }),
  taskType: schema.string(),
  schedule: schema.maybe(
    schema.oneOf([
      schema.object({
        interval: schema.string(),
      }),
      schema.object({
        rrule: schema.object({
          dtstart: schema.maybe(schema.string()),
          freq: schema.number(),
          interval: schema.number(),
          tzid: schema.string({ defaultValue: 'UTC' }),
          byhour: schema.maybe(schema.arrayOf(schema.number({ min: 0, max: 23 }))),
          byminute: schema.maybe(schema.arrayOf(schema.number({ min: 0, max: 59 }))),
          byweekday: schema.maybe(schema.arrayOf(schema.number({ min: 1, max: 7 }))),
          bymonthday: schema.maybe(schema.arrayOf(schema.number({ min: 1, max: 31 }))),
        }),
      }),
    ])
  ),
  interval: schema.maybe(schema.string()),
  params: schema.recordOf(schema.string(), schema.any(), { defaultValue: {} }),
  state: schema.recordOf(schema.string(), schema.any(), { defaultValue: {} }),
  id: schema.maybe(schema.string()),
  timeoutOverride: schema.maybe(schema.string()),
  cost: schema.maybe(schema.string()),
  priority: schema.maybe(schema.oneOf([schema.literal(1), schema.literal(40), schema.literal(50)])),
});

const taskSchema = schema.object({
  task: innerTaskSchema,
});

export function initRoutes(
  router: IRouter,
  taskManagerStart: Promise<TaskManagerStartContract>,
  coreSecurityStart: Promise<SecurityServiceStart>,
  taskTestingEvents: EventEmitter
) {
  async function ensureIndexIsRefreshed(client: IScopedClusterClient) {
    return await client.asInternalUser.indices.refresh({
      index: '.kibana_task_manager',
    });
  }

  router.post(
    {
      path: `/api/sample_tasks/schedule`,
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {
        body: taskSchema,
      },
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> {
      const taskManager = await taskManagerStart;
      const { task: taskFields } = req.body;
      const task = {
        ...taskFields,
        scope: [scope],
      };

      const taskResult = await taskManager.schedule(task, { req });

      return res.ok({ body: taskResult });
    }
  );

  router.post(
    {
      path: `/api/sample_tasks/schedule_with_api_key`,
      validate: {
        body: taskSchema,
      },
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> {
      const taskManager = await taskManagerStart;
      const { task: taskFields } = req.body;
      const task = {
        ...taskFields,
        scope: [scope],
      };

      const taskResult = await taskManager.schedule(task, { request: req });

      return res.ok({ body: taskResult });
    }
  );

  router.post(
    {
      path: `/api/sample_tasks/schedule_with_fake_request`,
      validate: {
        body: taskSchema,
      },
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
    },
    async function (
      _: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> {
      const taskManager = await taskManagerStart;
      const security = await coreSecurityStart;
      const { task: taskFields } = req.body;

      const apiKeyCreateResult = await security.authc.apiKeys.grantAsInternalUser(req, {
        name: `test task-manager schedule from fake request`,
        role_descriptors: {},
        metadata: { managed: true },
      });

      const fakeRawRequest: FakeRawRequest = {
        headers: {
          authorization: `ApiKey ${Buffer.from(
            `${apiKeyCreateResult!.id}:${apiKeyCreateResult!.api_key}`
          ).toString('base64')}`,
        },
      };
      const fakeRequest = kibanaRequestFactory(fakeRawRequest);
      const task = {
        ...taskFields,
        scope: [scope],
      };

      const taskResult = await taskManager.schedule(task, { request: fakeRequest });

      return res.ok({ body: taskResult });
    }
  );

  router.post(
    {
      path: `/api/sample_tasks/schedule_for_profile_test`,
      validate: {
        body: schema.object({
          task: innerTaskSchema,
          userProfileId: schema.string(),
          userName: schema.maybe(schema.string()),
        }),
      },
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> {
      const taskManager = await taskManagerStart;
      const security = await coreSecurityStart;
      const { task: taskFields, userProfileId, userName } = req.body;

      const apiKeyCreateResult = await security.authc.apiKeys.grantAsInternalUser(req, {
        name: `test task-manager schedule for profile test`,
        role_descriptors: {},
        metadata: { managed: true },
      });

      const fakeRawRequest: FakeRawRequest = {
        headers: {
          authorization: `ApiKey ${Buffer.from(
            `${apiKeyCreateResult!.id}:${apiKeyCreateResult!.api_key}`
          ).toString('base64')}`,
        },
        path: '/',
      };
      const fakeRequest = kibanaRequestFactory(fakeRawRequest);

      // FTR runs under basic auth and can't produce a session-backed request
      // with a profile_uid. We schedule the task through Task Manager's normal
      // path (so the API-key strategy and userScope plumbing run for real),
      // then patch `userScope.userProfileId`/`userName` on the stored SO to
      // mimic a task that was originally scheduled by a session-backed user.
      // `runAt` is deferred so the poller can't claim the task before the patch
      // lands.
      const deferredRunAt = new Date(Date.now() + 10_000);
      const scheduled = await taskManager.schedule(
        {
          ...taskFields,
          scope: [scope],
          runAt: deferredRunAt,
        },
        { request: fakeRequest }
      );

      const soClient = (await context.core).savedObjects.getClient({
        includedHiddenTypes: [TASK_SO_NAME],
      });
      await soClient.update(TASK_SO_NAME, scheduled.id, {
        userScope: { ...scheduled.userScope, userProfileId, userName },
      });

      // Make the task eligible for the next polling cycle now that userScope
      // is patched; `runSoon` only updates runAt/scheduledAt/status and leaves
      // userScope intact.
      await taskManager.runSoon(scheduled.id);

      return res.ok({ body: await taskManager.get(scheduled.id) });
    }
  );

  router.post(
    {
      path: '/api/sample_tasks/bulk_update_schedules_with_api_key',
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {
        body: schema.object({
          taskIds: schema.arrayOf(schema.string()),
          schedule: schema.oneOf([
            schema.object({ interval: schema.maybe(schema.string()) }),
            schema.object({
              rrule: schema.object({
                freq: schema.number(),
                interval: schema.number(),
                tzid: schema.string(),
                byhour: schema.maybe(schema.arrayOf(schema.number({ min: 0, max: 23 }))),
                byminute: schema.maybe(schema.arrayOf(schema.number({ min: 0, max: 59 }))),
                byweekday: schema.maybe(schema.arrayOf(schema.string())),
                bymonthday: schema.maybe(schema.arrayOf(schema.number({ min: 1, max: 31 }))),
              }),
            }),
          ]),
          regenerateApiKey: schema.maybe(schema.boolean({ defaultValue: false })),
        }),
      },
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> {
      const taskManager = await taskManagerStart;
      const { taskIds, schedule, regenerateApiKey } = req.body;

      const taskResult = await taskManager.bulkUpdateSchedules(taskIds, schedule, {
        request: req,
        regenerateApiKey,
      });

      return res.ok({ body: taskResult });
    }
  );

  router.post(
    {
      path: `/api/sample_tasks/bulk_update_schedules_with_fake_request`,
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {
        body: schema.object({
          taskIds: schema.arrayOf(schema.string()),
          schedule: schema.oneOf([
            schema.object({ interval: schema.maybe(schema.string()) }),
            schema.object({
              rrule: schema.object({
                freq: schema.number(),
                interval: schema.number(),
                tzid: schema.string(),
                byhour: schema.maybe(schema.arrayOf(schema.number({ min: 0, max: 23 }))),
                byminute: schema.maybe(schema.arrayOf(schema.number({ min: 0, max: 59 }))),
                byweekday: schema.maybe(schema.arrayOf(schema.string())),
                bymonthday: schema.maybe(schema.arrayOf(schema.number({ min: 1, max: 31 }))),
              }),
            }),
          ]),
        }),
      },
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ) {
      const { taskIds, schedule } = req.body;
      try {
        const taskManager = await taskManagerStart;
        const security = await coreSecurityStart;

        const apiKeyCreateResult = await security.authc.apiKeys.grantAsInternalUser(req, {
          name: `test task-manager bulk update schedules from fake request`,
          role_descriptors: {},
          metadata: { managed: true },
        });

        const fakeRawRequest: FakeRawRequest = {
          headers: {
            authorization: `ApiKey ${Buffer.from(
              `${apiKeyCreateResult!.id}:${apiKeyCreateResult!.api_key}`
            ).toString('base64')}`,
          },
        };
        const fakeRequest = kibanaRequestFactory(fakeRawRequest);
        return res.ok({
          body: await taskManager.bulkUpdateSchedules(taskIds, schedule, { request: fakeRequest }),
        });
      } catch (err) {
        return res.ok({ body: { taskIds, error: `${err}` } });
      }
    }
  );

  router.post(
    {
      path: `/api/sample_tasks/run_soon`,
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {
        body: schema.object({
          task: schema.object({
            id: schema.string({}),
          }),
          force: schema.maybe(schema.boolean({ defaultValue: false })),
        }),
      },
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> {
      const {
        task: { id },
        force,
      } = req.body;
      try {
        const taskManager = await taskManagerStart;
        return res.ok({ body: await taskManager.runSoon(id, force) });
      } catch (err) {
        return res.ok({ body: { id, error: `${err}` } });
      }
    }
  );

  router.post(
    {
      path: `/api/sample_tasks/run_mark_removed_tasks_as_unrecognized`,
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {
        body: schema.object({}),
      },
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> {
      try {
        const taskManager = await taskManagerStart;
        await taskManager.ensureScheduled({
          id: 'mark_removed_tasks_as_unrecognized',
          taskType: 'task_manager:mark_removed_tasks_as_unrecognized',
          schedule: { interval: '1h' },
          state: {},
          params: {},
        });
        return res.ok({ body: await taskManager.runSoon('mark_removed_tasks_as_unrecognized') });
      } catch (err) {
        return res.ok({ body: { id: 'mark_removed_tasks_as_unrecognized', error: `${err}` } });
      }
    }
  );

  router.post(
    {
      path: `/api/sample_tasks/bulk_enable`,
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {
        body: schema.object({
          taskIds: schema.arrayOf(schema.string()),
          runSoon: schema.boolean({ defaultValue: true }),
        }),
      },
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ) {
      const { taskIds, runSoon } = req.body;
      try {
        const taskManager = await taskManagerStart;
        return res.ok({ body: await taskManager.bulkEnable(taskIds, runSoon) });
      } catch (err) {
        return res.ok({ body: { taskIds, error: `${err}` } });
      }
    }
  );

  router.post(
    {
      path: `/api/sample_tasks/bulk_disable`,
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {
        body: schema.object({
          taskIds: schema.arrayOf(schema.string()),
        }),
      },
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ) {
      const { taskIds } = req.body;
      try {
        const taskManager = await taskManagerStart;
        return res.ok({ body: await taskManager.bulkDisable(taskIds) });
      } catch (err) {
        return res.ok({ body: { taskIds, error: `${err}` } });
      }
    }
  );

  router.post(
    {
      path: `/api/sample_tasks/bulk_update_schedules`,
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {
        body: schema.object({
          taskIds: schema.arrayOf(schema.string()),
          schedule: schema.oneOf([
            schema.object({ interval: schema.maybe(schema.string()) }),
            schema.object({
              rrule: schema.object({
                freq: schema.number(),
                interval: schema.number(),
                tzid: schema.string(),
                byhour: schema.maybe(schema.arrayOf(schema.number({ min: 0, max: 23 }))),
                byminute: schema.maybe(schema.arrayOf(schema.number({ min: 0, max: 59 }))),
                byweekday: schema.maybe(schema.arrayOf(schema.string())),
                bymonthday: schema.maybe(schema.arrayOf(schema.number({ min: 1, max: 31 }))),
              }),
            }),
          ]),
        }),
      },
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ) {
      const { taskIds, schedule } = req.body;
      try {
        const taskManager = await taskManagerStart;
        return res.ok({ body: await taskManager.bulkUpdateSchedules(taskIds, schedule) });
      } catch (err) {
        return res.ok({ body: { taskIds, error: `${err}` } });
      }
    }
  );

  router.post(
    {
      path: `/api/sample_tasks/ensure_scheduled`,
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {
        body: schema.object({
          task: schema.object({
            taskType: schema.string(),
            params: schema.object({}),
            state: schema.maybe(schema.object({})),
            id: schema.maybe(schema.string()),
            schedule: schema.maybe(schema.object({ interval: schema.string() })),
          }),
        }),
      },
    },
    async function (
      _: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> {
      try {
        const { task: taskFields } = req.body;
        const task = {
          ...taskFields,
          scope: [scope],
        };

        const taskManager = await taskManagerStart;
        const taskResult = await taskManager.ensureScheduled(task, { req });

        return res.ok({ body: taskResult });
      } catch (err) {
        return res.ok({ body: err });
      }
    }
  );

  router.post(
    {
      path: `/api/sample_tasks/event`,
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {
        body: schema.object({
          event: schema.string(),
          data: schema.recordOf(schema.string(), schema.any(), { defaultValue: {} }),
        }),
      },
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> {
      try {
        const { event, data } = req.body;
        taskTestingEvents.emit(event, data);
        return res.ok({ body: event });
      } catch (err) {
        return res.ok({ body: err });
      }
    }
  );

  router.get(
    {
      path: `/api/sample_tasks`,
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {},
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> {
      try {
        const taskManager = await taskManagerStart;
        return res.ok({
          body: await taskManager.fetch({
            size: 20,
            query: taskManagerQuery,
          }),
        });
      } catch (err) {
        return res.ok({ body: err });
      }
    }
  );

  router.get(
    {
      path: `/api/sample_tasks/task/{taskId}`,
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {
        params: schema.object({
          taskId: schema.string(),
        }),
      },
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> {
      try {
        await ensureIndexIsRefreshed((await context.core).elasticsearch.client);
        const taskManager = await taskManagerStart;
        return res.ok({ body: await taskManager.get(req.params.taskId) });
      } catch ({ isBoom, output, message }) {
        return res.ok({ body: isBoom ? output.payload : { message } });
      }
    }
  );

  router.get(
    {
      path: `/api/ensure_tasks_index_refreshed`,
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {},
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> {
      await ensureIndexIsRefreshed((await context.core).elasticsearch.client);
      return res.ok({ body: {} });
    }
  );

  router.delete(
    {
      path: `/api/sample_tasks`,
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {},
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> {
      try {
        await ensureIndexIsRefreshed((await context.core).elasticsearch.client);
        let tasksFound = 0;
        const taskManager = await taskManagerStart;
        do {
          const { docs: tasks } = await taskManager.fetch({
            query: taskManagerQuery,
          });
          tasksFound = tasks.length;
          await Promise.all(tasks.map((task) => taskManager.remove(task.id)));
        } while (tasksFound > 0);
        return res.ok({ body: 'OK' });
      } catch ({ isBoom, output, message }) {
        return res.ok({ body: isBoom ? output.payload : { message } });
      }
    }
  );

  router.get(
    {
      path: '/api/registered_tasks',
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {},
    },
    async (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> => {
      try {
        const tm = await taskManagerStart;
        return res.ok({
          body: tm.getRegisteredTypes(),
        });
      } catch (err) {
        return res.badRequest({ body: err });
      }
    }
  );

  router.post(
    {
      path: `/api/update_kibana_node`,
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {
        body: schema.object({
          id: schema.string(),
          lastSeen: schema.string(),
        }),
      },
    },
    async function (
      context: RequestHandlerContext,
      req: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> {
      const { id, lastSeen } = req.body;

      const client = (await context.core).savedObjects.getClient({
        includedHiddenTypes: [BACKGROUND_TASK_NODE_SO_NAME],
      });
      const node = await client.update(
        BACKGROUND_TASK_NODE_SO_NAME,
        id,
        {
          id,
          last_seen: lastSeen,
        },
        { upsert: { id, last_seen: lastSeen }, refresh: false, retryOnConflict: 3 }
      );

      return res.ok({
        body: node,
      });
    }
  );

  router.post(
    {
      path: `/api/invalidate_api_key_task/run_soon`,
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization because it is used only for testing',
        },
      },
      validate: {},
    },
    async function (
      _: RequestHandlerContext,
      __: KibanaRequest<any, any, any, any>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse<any>> {
      const taskId = 'invalidate_api_keys';
      try {
        const taskManager = await taskManagerStart;
        return res.ok({ body: await taskManager.runSoon(taskId) });
      } catch (err) {
        return res.ok({ body: { id: taskId, error: `${err}` } });
      }
    }
  );
}
