/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { withSpan } from '@kbn/apm-utils';
import type { RulesClientContext, ScheduleTaskOptions } from '../types';

export type BuildTaskInstanceOpts = Omit<ScheduleTaskOptions, 'throwOnConflict'>;

export const buildTaskInstance = (context: RulesClientContext, opts: BuildTaskInstanceOpts) => ({
  id: opts.id, // Task document uses the same ID as the rule.
  taskType: `alerting:${opts.ruleTypeId}`,
  schedule: opts.schedule,
  params: {
    alertId: opts.id,
    spaceId: context.spaceId,
    consumer: opts.consumer,
  },
  state: {
    previousStartedAt: null,
    alertTypeState: {},
    alertInstances: {},
  },
  scope: ['alerting'],
  enabled: true,
});

export async function scheduleTask(context: RulesClientContext, opts: ScheduleTaskOptions) {
  const { throwOnConflict, ...buildOpts } = opts;
  const taskInstance = buildTaskInstance(context, buildOpts);
  try {
    return await withSpan({ name: 'taskManager.schedule', type: 'rules' }, () =>
      context.taskManager.schedule(taskInstance)
    );
  } catch (err) {
    if (err.statusCode === 409 && !throwOnConflict) {
      return taskInstance;
    }
    throw err;
  }
}

export async function bulkScheduleTask(
  context: RulesClientContext,
  tasks: BuildTaskInstanceOpts[]
) {
  const taskInstances = tasks.map((t) => buildTaskInstance(context, t));
  return withSpan({ name: 'taskManager.bulkSchedule', type: 'tasks' }, () =>
    context.taskManager.bulkSchedule(taskInstances)
  );
}
