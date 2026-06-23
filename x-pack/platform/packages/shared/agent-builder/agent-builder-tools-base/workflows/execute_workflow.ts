/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import { SpanKind } from '@opentelemetry/api';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import {
  ElasticGenAIAttributes,
  GenAISemanticConventions,
  withActiveInferenceSpan,
} from '@kbn/inference-tracing';
import { toWorkflowExecutionState } from './get_execution_state';
import type { WorkflowExecutionResult } from './execute_workflow_types';

type WorkflowApi = WorkflowsServerPluginSetup['management'];

const DEFAULT_COMPLETION_TIMEOUT_SEC = 120;

interface ExecuteWorkflowBaseParams {
  workflowParams: Record<string, unknown>;
  request: KibanaRequest;
  spaceId: string;
  workflowApi: WorkflowApi;
  waitForCompletion?: boolean;
  completionTimeoutSec?: number;
  metadata?: Record<string, unknown>;
}

export interface ExecuteSavedWorkflowParams extends ExecuteWorkflowBaseParams {
  workflowId: string;
  yaml?: never;
  name?: never;
}

export interface ExecuteInlineWorkflowParams extends ExecuteWorkflowBaseParams {
  yaml: string;
  workflowId?: string;
  name?: string;
}

export type ExecuteWorkflowParams = ExecuteSavedWorkflowParams | ExecuteInlineWorkflowParams;

const isInlineParams = (params: ExecuteWorkflowParams): params is ExecuteInlineWorkflowParams =>
  typeof (params as ExecuteInlineWorkflowParams).yaml === 'string';

export const executeWorkflow = async (
  params: ExecuteWorkflowParams
): Promise<WorkflowExecutionResult> => {
  const {
    workflowParams,
    request,
    spaceId,
    workflowApi,
    waitForCompletion = true,
    completionTimeoutSec = DEFAULT_COMPLETION_TIMEOUT_SEC,
    metadata,
  } = params;

  const spanLabel = params.workflowId ?? 'ephemeral';

  return withActiveInferenceSpan(
    `invoke_workflow ${spanLabel}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        [ElasticGenAIAttributes.InferenceSpanKind]: 'CHAIN',
        [GenAISemanticConventions.GenAIOperationName]: 'invoke_workflow',
        ...(params.workflowId ? { 'elastic.workflow.id': params.workflowId } : {}),
      },
    },
    async (span) => {
      try {
        const apiArgs = isInlineParams(params)
          ? {
              yaml: params.yaml,
              workflowId: params.workflowId,
              name: params.name,
              inputs: workflowParams,
              request,
              spaceId,
              waitForCompletion,
              completionTimeoutSec,
              metadata,
            }
          : {
              workflowId: params.workflowId,
              inputs: workflowParams,
              request,
              spaceId,
              waitForCompletion,
              completionTimeoutSec,
              metadata,
            };

        const executeResult = await workflowApi.executeWorkflow(apiArgs);

        span?.setAttribute('elastic.workflow.execution_id', executeResult.workflowExecutionId);

        if (executeResult.execution) {
          const workflowName = executeResult.execution.workflowDefinition.name;
          span?.setAttribute(GenAISemanticConventions.GenAIWorkflowName, workflowName);
          span?.updateName(`invoke_workflow ${workflowName}`);
          const result: WorkflowExecutionResult = {
            success: true,
            execution: toWorkflowExecutionState(executeResult.execution),
          };
          return result;
        }

        const idLabel = params.workflowId ?? 'ephemeral';
        const result: WorkflowExecutionResult = {
          success: false,
          error: `Workflow '${idLabel}' executed but execution not found after ${completionTimeoutSec}s.`,
        };
        return result;
      } catch (e) {
        const result: WorkflowExecutionResult = {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
        return result;
      }
    }
  );
};
