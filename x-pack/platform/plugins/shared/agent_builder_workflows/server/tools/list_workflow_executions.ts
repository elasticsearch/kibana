/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { type ExecutionStatus, ExecutionStatusValues } from '@kbn/workflows';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { SecurityPluginStart } from '@kbn/security-plugin-types-server';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { cleanPrompt } from '@kbn/agent-builder-genai-utils/prompts';
import { errorResult, otherResult } from '@kbn/agent-builder-genai-utils/tools/utils/results';
import { hasWorkflowExecutionReadPrivilege } from './utils/check_execution_read_privilege';

const executionStatusSchema = z.enum(ExecutionStatusValues as [string, ...string[]]);

const listWorkflowExecutionsSchema = z.object({
  workflowId: z
    .string()
    .optional()
    .describe('Optional workflow ID to filter executions to a specific workflow.'),
  statuses: z
    .array(executionStatusSchema)
    .optional()
    .describe(
      'Optional list of statuses to filter by, e.g. ["failed", "running"]. Omit for all statuses.'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum number of executions to return. Defaults to 10, maximum 50.'),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Page number for pagination, starting at 1. Defaults to 1.'),
});

export const listWorkflowExecutionsTool = ({
  workflowsManagement,
  getSecurity,
}: {
  workflowsManagement: WorkflowsServerPluginSetup;
  getSecurity: () => SecurityPluginStart | undefined;
}): BuiltinToolDefinition<typeof listWorkflowExecutionsSchema> => {
  const { management: workflowApi } = workflowsManagement;

  return {
    id: platformCoreTools.listWorkflowExecutions,
    type: ToolType.builtin,
    description: cleanPrompt(`List recent workflow executions in the current space.

    Use this tool when you need to find an execution but do not have an execution ID.
    Results are sorted most-recent first.
    Once you have an executionId from the results, call ${platformCoreTools.getWorkflowExecutionStatus}
    to retrieve the full execution details and output.
    Note: date range, trigger type filtering, and cursor-based pagination are not yet supported.
    `),
    schema: listWorkflowExecutionsSchema,
    handler: async ({ workflowId, statuses, limit, page }, { spaceId, request }) => {
      try {
        const authorized = await hasWorkflowExecutionReadPrivilege({
          getSecurity,
          request,
          spaceId,
        });
        if (!authorized) {
          return {
            results: [
              otherResult({ executions: [], total: 0, page: page ?? 1, size: limit ?? 10 }),
            ],
          };
        }

        const result = await workflowApi.getWorkflowExecutions(
          {
            workflowId,
            statuses: statuses as ExecutionStatus[] | undefined,
            page: page ?? 1,
            size: limit ?? 10,
            omitStepRuns: true,
          },
          spaceId
        );

        const executions = result.results.map((e) => ({
          executionId: e.id,
          workflowId: e.workflowId,
          status: e.status,
          startedAt: e.startedAt,
          finishedAt: e.finishedAt,
          duration: e.duration,
          triggeredBy: e.triggeredBy,
          executedBy: e.executedBy,
        }));

        return {
          results: [
            otherResult({ executions, total: result.total, page: result.page, size: result.size }),
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          results: [errorResult(`Failed to list workflow executions: ${message}`)],
        };
      }
    },
    tags: [],
  };
};
