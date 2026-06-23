/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { TaskManagerSetupContract } from '@kbn/task-manager-plugin/server';

import { registerExtractEntityTasks } from './extract_entity_task';
import { registerHistorySnapshotTask } from './history_snapshot_task';
import { registerStatusReportTask } from './status_report_task';
import type { EntityStoreCoreSetup } from '../types';
import { ALL_ENTITY_TYPES } from '../../common/domain/definitions/entity_schema';

export function registerTasks(
  taskManager: TaskManagerSetupContract,
  logger: Logger,
  core: EntityStoreCoreSetup,
  isServerless: boolean
) {
  registerExtractEntityTasks({
    taskManager,
    logger,
    entityTypes: ALL_ENTITY_TYPES,
    core,
    isServerless,
  });
  registerHistorySnapshotTask({ taskManager, logger, core });
  registerStatusReportTask({ taskManager, logger, core });
}
