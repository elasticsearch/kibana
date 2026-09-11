/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreStart, ElasticsearchClient, KibanaRequest } from '@kbn/core/server';
import type { WorkflowGraph } from '@kbn/workflows/graph';
import type { WorkflowExecutionPersistence } from '../repositories/execution_persistence';
import type { NodesFactory } from '../step/nodes_factory';
import type { StepExecutionRuntimeFactory } from '../workflow_context_manager/step_execution_runtime_factory';
import type { StepIoService } from '../workflow_context_manager/step_io_service';
import type { WorkflowExecutionCursorApi } from '../workflow_context_manager/workflow_execution_cursor';
import type { WorkflowExecutionRuntimeManager } from '../workflow_context_manager/workflow_execution_runtime_manager';
import type { WorkflowExecutionState } from '../workflow_context_manager/workflow_execution_state';
import type { IWorkflowEventLogger } from '../workflow_event_logger';
import type { WorkflowTaskManager } from '../workflow_task_manager/workflow_task_manager';

export interface WorkflowExecutionLoopParams {
  workflowExecutionGraph: WorkflowGraph;
  workflowRuntime: WorkflowExecutionRuntimeManager;
  workflowExecutionCursor: WorkflowExecutionCursorApi;
  stepExecutionRuntimeFactory: StepExecutionRuntimeFactory;
  workflowExecutionState: WorkflowExecutionState;
  stepIoService: StepIoService;
  workflowLogger: IWorkflowEventLogger;
  workflowExecutionRepository: WorkflowExecutionPersistence;
  nodesFactory: NodesFactory;
  esClient: ElasticsearchClient;
  fakeRequest: KibanaRequest<unknown, unknown, unknown>;
  coreStart: CoreStart;
  signal: AbortSignal;
  workflowTaskManager: WorkflowTaskManager;
}
