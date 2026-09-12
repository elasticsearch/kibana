/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  ActionsApiRequestHandlerContext,
  PluginSetupContract as ActionsPluginSetupContract,
  PluginStartContract as ActionsPluginStartContract,
} from '@kbn/actions-plugin/server';
import type {
  AlertingApiRequestHandlerContext,
  AlertingServerSetup,
} from '@kbn/alerting-plugin/server';
import type { CustomRequestHandlerContext, IRouter } from '@kbn/core/server';
import type { DataViewsServerPluginStart } from '@kbn/data-views-plugin/server';
import type { FeaturesPluginSetup } from '@kbn/features-plugin/server';

import type { InboxPluginSetup } from '@kbn/inbox-plugin/server';
import type {
  LicensingApiRequestHandlerContext,
  LicensingPluginStart,
} from '@kbn/licensing-plugin/server';
import type { SecurityPluginStart } from '@kbn/security-plugin-types-server';
import type { ServerlessServerSetup } from '@kbn/serverless/server/types';
import type { SpacesPluginSetup, SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type { WorkflowsApiRequestHandlerContext } from '@kbn/workflows/server/types';
import type { WorkflowsExecutionEnginePluginStart } from '@kbn/workflows-execution-engine/server';
import type {
  WorkflowsExtensionsServerPluginSetup,
  WorkflowsExtensionsServerPluginStart,
} from '@kbn/workflows-extensions/server';
import type { WorkflowsManagementApi } from './api/workflows_management_api';

export interface WorkflowsServerPluginSetup {
  management: WorkflowsManagementApi;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface WorkflowsServerPluginStart {}

export interface WorkflowsServerPluginSetupDeps {
  features?: FeaturesPluginSetup;
  taskManager?: TaskManagerSetupContract;
  actions?: ActionsPluginSetupContract;
  alerting?: AlertingServerSetup;
  spaces: SpacesPluginSetup;
  serverless?: ServerlessServerSetup;
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup;
  /**
   * Optional Inbox plugin. When present, Workflows registers itself as the
   * `workflows` source so paused `waitForInput` steps surface in the
   * cross-cutting Inbox UI / MCP / API.
   */
  inbox?: InboxPluginSetup;
}

export interface WorkflowsServerPluginStartDeps {
  taskManager: TaskManagerStartContract;
  workflowsExecutionEngine: WorkflowsExecutionEnginePluginStart;
  actions: ActionsPluginStartContract;
  security?: SecurityPluginStart;
  spaces: SpacesPluginStart;
  workflowsExtensions: WorkflowsExtensionsServerPluginStart;
  licensing: LicensingPluginStart;
  dataViews: DataViewsServerPluginStart;
}

export type WorkflowsManagementRequestHandlerContext = Promise<void>;

export type WorkflowsRequestHandlerContext = CustomRequestHandlerContext<{
  workflows: WorkflowsApiRequestHandlerContext;
  actions: ActionsApiRequestHandlerContext;
  alerting: AlertingApiRequestHandlerContext;
  licensing: LicensingApiRequestHandlerContext;
  workflowsManagement: WorkflowsManagementRequestHandlerContext;
}>;

export type WorkflowsRouter = IRouter<WorkflowsRequestHandlerContext>;
