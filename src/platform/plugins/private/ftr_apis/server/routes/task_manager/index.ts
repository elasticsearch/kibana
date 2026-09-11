/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IRouter } from '@kbn/core/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import { registerTaskManagerRunSoonRoute } from './run_soon';
import { registerTaskManagerDeleteRoute } from './delete';
import { registerTaskManagerScheduleRoute } from './schedule';
import { registerTaskManagerBulkScheduleRoute } from './bulk_schedule';
import { registerTaskManagerGetRoute } from './get';

export const registerTaskManagerRoutes = (
  router: IRouter,
  getStartContract: () => TaskManagerStartContract | undefined
) => {
  registerTaskManagerRunSoonRoute(router, getStartContract);
  registerTaskManagerScheduleRoute(router, getStartContract);
  registerTaskManagerBulkScheduleRoute(router, getStartContract);
  registerTaskManagerDeleteRoute(router, getStartContract);
  registerTaskManagerGetRoute(router, getStartContract);
};
