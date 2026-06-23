/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionsClient, IUnsecuredActionsClient } from '@kbn/actions-plugin/server';
import type {
  CoreStart,
  ElasticsearchClient,
  KibanaRequest,
  Logger,
  SecurityServiceStart,
} from '@kbn/core/server';
import type { PublicMethodsOf } from '@kbn/utility-types';
import type { IWorkflowEventLoggerService } from '@kbn/workflows-execution-engine/server';
import type { WorkflowsExtensionsServerPluginStart } from '@kbn/workflows-extensions/server';

import type { IWorkflowChangeHistoryService } from './workflow_change_history_types';
import type { WorkflowExecutionQueryService } from './workflow_execution_query_service';
import type { WorkflowValidationService } from './workflow_validation_service';
import type { WorkflowStorage } from '../storage/workflow_storage';
import type { WorkflowTaskScheduler } from '../tasks/workflow_task_scheduler';

/** Core deps shared by all services that access workflow storage. */
export interface WorkflowStorageDeps {
  logger: Logger;
  workflowStorage: WorkflowStorage;
}

/** Deps for WorkflowCrudService (CRUD + deletion + disable-all). */
export interface WorkflowCrudDeps extends WorkflowStorageDeps {
  esClient: ElasticsearchClient;
  getSecurity: () => SecurityServiceStart | undefined;
  workflowsExtensions: WorkflowsExtensionsServerPluginStart | undefined;
  getTaskScheduler: () => WorkflowTaskScheduler | null;
  executionQueryService: WorkflowExecutionQueryService;
  validationService: WorkflowValidationService;
  getCoreStart: () => CoreStart;
  changeHistoryService: IWorkflowChangeHistoryService;
  /** Frozen at WorkflowsService startup from `workflows:versioning:enabled`. */
  workflowVersioningEnabled: boolean;
}

/** Deps for WorkflowSearchService. */
export interface WorkflowSearchDeps extends WorkflowStorageDeps {
  esClient: ElasticsearchClient;
}

/** Deps for WorkflowExecutionQueryService. */
export interface WorkflowExecutionQueryDeps {
  logger: Logger;
  esClient: ElasticsearchClient;
  workflowEventLoggerService: IWorkflowEventLoggerService;
}

/** Deps for WorkflowValidationService. */
export interface WorkflowValidationDeps {
  workflowsExtensions: WorkflowsExtensionsServerPluginStart | undefined;
  getActionsClient: () => Promise<IUnsecuredActionsClient>;
  getActionsClientWithRequest: (request: KibanaRequest) => Promise<PublicMethodsOf<ActionsClient>>;
}
