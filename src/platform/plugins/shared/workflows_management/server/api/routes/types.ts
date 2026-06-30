/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/core/server';
import type { SpacesServiceSetup } from '@kbn/spaces-plugin/server';
import type { WorkflowManagementAuditLog } from './utils/workflow_audit_logging';
import type { WorkflowsManagementConfig } from '../../config';
import type { WorkflowsRouter } from '../../types';
import type { WorkflowsManagementApi } from '../workflows_management_api';
import type { WorkflowsService } from '../workflows_management_service';

export interface RouteDependencies {
  router: WorkflowsRouter;
  api: WorkflowsManagementApi;
  workflowsService: WorkflowsService;
  config: WorkflowsManagementConfig;
  logger: Logger;
  spaces: SpacesServiceSetup;
  audit: WorkflowManagementAuditLog;
}

export type RouteHandler = (deps: RouteDependencies) => void;
