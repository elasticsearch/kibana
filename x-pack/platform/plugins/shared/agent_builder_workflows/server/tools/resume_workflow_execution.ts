/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { cleanPrompt } from '@kbn/agent-builder-genai-utils/prompts';
import { getExecutionState } from '@kbn/agent-builder-tools-base/workflows';
import { errorResult, otherResult } from '@kbn/agent-builder-genai-utils/tools/utils/results';

const resumeWorkflowExecutionSchema = z.object({
  executionId: z
    .string()
    .describe(
      'The executionId of the workflow execution that is waiting for input. Use the executionId value returned by the status tool.'
    ),
  input: z
    .record(z.string(), z.unknown())
    .describe(
      'Key-value input to provide to the paused workflow step. Must conform to the schema described in the waiting_input.schema field returned when the workflow paused.'
    ),
});

export const resumeWorkflowExecutionTool = ({
  workflowsManagement,
}: {
  workflowsManagement: WorkflowsServerPluginSetup;
}): BuiltinToolDefinition<typeof resumeWorkflowExecutionSchema> => {
  const { management: workflowApi } = workflowsManagement;

  return {
    id: platformCoreTools.resumeWorkflowExecution,
    type: ToolType.builtin,
    description:
      cleanPrompt(`Resume a workflow execution that is paused and waiting for human input.

    Use this tool when a workflow execution returned with status "waiting_for_input".
    The execution's "waiting_input" field describes what input is expected (message and optional schema).
    Provide the executionId and the required input object to resume the workflow.

    **Important - read after resume:** a successful call means resume was **accepted and scheduled** in the engine.
    The execution record can **lag**: you may still briefly see the same "waiting_for_input" and the same form right after this tool returns. **Do not** tell the user there is another HITL step, a loop or a second approval round unless you have **confirmed** a genuinely new pause (clear evidence such as a new step, changed context, or repeated status checks that rule out a stale snapshot).

    **What you should do:** call ${platformCoreTools.getWorkflowExecutionStatus} on the same executionId. Compare **waiting_input.step_execution_id** between polls: if it **changes** while still waiting_for_input, that is evidence of a **new** HITL step; if it is the **same** id immediately after resume, treat it as likely stale until status moves on. Stop once the status clearly updates (e.g. completed, failed, running) or after **up to ~5 status polls** without any change.

    **If status has not changed after those polls:** tell the user their resume was **submitted**, but you **could not confirm** the new execution state from Kibana yet - do **not** invent a second approval workflow.
    `),
    schema: resumeWorkflowExecutionSchema,
    handler: async ({ executionId, input }, { spaceId, request }) => {
      try {
        await workflowApi.resumeWorkflowExecution(executionId, spaceId, input, request, {
          channel: 'agent_builder',
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          results: [errorResult(`Failed to resume workflow execution: ${message}`)],
        };
      }

      // Failure here is non-fatal & the resume already happened so the LLM must not retry it
      let execution: Awaited<ReturnType<typeof getExecutionState>>;
      try {
        execution = await getExecutionState({ executionId, spaceId, workflowApi });
      } catch {
        execution = null;
      }

      return {
        results: [
          otherResult({
            resumed: true,
            execution: execution ?? { execution_id: executionId, status: 'unknown' },
          }),
        ],
      };
    },
    tags: [],
  };
};
