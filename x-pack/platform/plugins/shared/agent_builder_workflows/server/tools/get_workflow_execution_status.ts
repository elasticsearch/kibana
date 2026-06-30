/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { SecurityPluginStart } from '@kbn/security-plugin-types-server';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { cleanPrompt } from '@kbn/agent-builder-genai-utils/prompts';
import { getExecutionState } from '@kbn/agent-builder-tools-base/workflows';
import { errorResult, otherResult } from '@kbn/agent-builder-genai-utils/tools/utils/results';
import { hasWorkflowExecutionReadPrivilege } from './utils/check_execution_read_privilege';

const getWorkflowExecutionStatusSchema = z.object({
  executionId: z
    .string()
    .describe(`ID of the workflow execution (execution_id) to retrieve the status for.`),
});

export const getWorkflowExecutionStatusTool = ({
  workflowsManagement,
  getSecurity,
}: {
  workflowsManagement: WorkflowsServerPluginSetup;
  getSecurity: () => SecurityPluginStart | undefined;
}): BuiltinToolDefinition<typeof getWorkflowExecutionStatusSchema> => {
  const { management: workflowApi } = workflowsManagement;

  return {
    id: platformCoreTools.getWorkflowExecutionStatus,
    type: ToolType.builtin,
    description: cleanPrompt(`Retrieve the status of a workflow execution.

    If the workflow execution has completed, the final output will be returned. Otherwise, the execution status will be returned.

    **important**: do **NOT** call this tool directly after calling a workflow tool.
    Instead, if the workflow didn't complete, tell the user they can ask you to check the execution.
    `),
    schema: getWorkflowExecutionStatusSchema,
    handler: async ({ executionId }, { spaceId, request }) => {
      try {
        const authorized = await hasWorkflowExecutionReadPrivilege({
          getSecurity,
          request,
          spaceId,
        });
        if (!authorized) {
          return {
            results: [errorResult(`Workflow execution with ID '${executionId}' not found.`)],
          };
        }

        const execution = await getExecutionState({
          executionId,
          spaceId,
          workflowApi,
        });

        if (execution) {
          return {
            results: [otherResult({ execution })],
          };
        } else {
          return {
            results: [errorResult(`Workflow execution with ID '${executionId}' not found.`)],
          };
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          results: [errorResult(`Failed to retrieve workflow execution status: ${message}`)],
        };
      }
    },
    tags: [],
  };
};
