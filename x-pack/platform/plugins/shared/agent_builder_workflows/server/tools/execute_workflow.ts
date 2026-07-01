/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { cleanPrompt } from '@kbn/agent-builder-genai-utils/prompts';
import { errorResult, otherResult } from '@kbn/agent-builder-genai-utils/tools/utils/results';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import { workflowIdSchema } from '@kbn/workflows-management-plugin/common/lib/workflow_id_schema';
import { WORKFLOW_YAML_ATTACHMENT_TYPE } from '@kbn/workflows/common/constants';
import { executeWorkflow } from '@kbn/agent-builder-tools-base/workflows';

const executeWorkflowSchema = z.object({
  workflowId: workflowIdSchema.optional().describe('ID of a persisted workflow to execute.'),
  yaml: z.string().optional().describe('Inline workflow YAML definition to execute.'),
  attachmentId: z.string().optional().describe('ID of a workflow attachment to execute.'),
  inputs: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Workflow inputs object. Must conform to the inputs schema declared by the workflow. When uncertain, inspect the workflow YAML before calling.'
    ),
  waitForCompletion: z
    .boolean()
    .optional()
    .describe(
      '(Optional, default true) When true, wait for the execution to complete synchronously. When false, return immediately with an executionId (fire and forget)'
    ),
});

export const executeWorkflowTool = ({
  workflowsManagement,
}: {
  workflowsManagement: WorkflowsServerPluginSetup;
}): BuiltinToolDefinition<typeof executeWorkflowSchema> => {
  const { management: workflowApi } = workflowsManagement;

  return {
    id: platformCoreTools.executeWorkflow,
    type: ToolType.builtin,
    description: cleanPrompt(`Execute an Elastic workflow.

Use this tool when:
— The user asks to run, trigger or execute a workflow.
— You need to run a workflow you just generated (e.g. via \`generate_workflow\`).

## Source — exactly one must be provided

- \`workflowId\`: a persisted workflow id (the workflow must be saved and enabled).
- \`yaml\`: an inline YAML workflow definition; runs ephemerally (no persistence).
- \`attachmentId\`: the id of a workflow YAML attachment already in this conversation (as returned by \`generate_workflow\`).

Providing zero or more than one will return an error.

## Inputs

Pass workflow inputs in \`inputs\`. Make sure the keys/types match the workflow's declared inputs schema.
If the workflow has no inputs, omit \`inputs\` or pass \`{}\`.

## Wait behaviour

\`waitForCompletion\` defaults to \`true\` (up to 120s).
If set to false, or if the workflow does not complete within the timeout, the tool returns the in-flight execution and you can poll via \`${platformCoreTools.getWorkflowExecutionStatus}\`.

## Follow-ups

- If the returned execution status is \`waiting_for_input\`, the workflow is paused; resume it with \`${platformCoreTools.resumeWorkflowExecution}\`.
- If the status is not terminal (still running), call \`${platformCoreTools.getWorkflowExecutionStatus}\` later to get the final outcome.
`),
    schema: executeWorkflowSchema,
    handler: async ({ workflowId, yaml, attachmentId, inputs, waitForCompletion }, toolContext) => {
      const providedModes = [workflowId, yaml, attachmentId].filter((v) => v !== undefined).length;
      if (providedModes !== 1) {
        return {
          results: [
            errorResult('Exactly one of `workflowId`, `yaml`, or `attachmentId` must be provided.'),
          ],
        };
      }

      let resolvedYaml: string | undefined = yaml;
      let resolvedWorkflowId: string | undefined = workflowId;
      let resolvedName: string | undefined;

      if (attachmentId) {
        const attachment = toolContext.attachments.get(attachmentId);
        if (!attachment) {
          return {
            results: [errorResult(`Attachment with ID '${attachmentId}' not found.`)],
          };
        }
        if (attachment.type !== WORKFLOW_YAML_ATTACHMENT_TYPE) {
          return {
            results: [
              errorResult(`Attachment with ID '${attachmentId}' is not a workflow attachment.`),
            ],
          };
        }
        const data = attachment.data.data as
          | { yaml?: string; workflowId?: string; name?: string }
          | undefined;
        if (!data?.yaml) {
          return {
            results: [
              errorResult(`Attachment with ID '${attachmentId}' does not contain a YAML payload.`),
            ],
          };
        }
        resolvedYaml = data.yaml;
        resolvedWorkflowId = data.workflowId;
        resolvedName = data.name;
      }

      const { request, spaceId } = toolContext;
      const workflowParams = inputs ?? {};
      const wait = waitForCompletion ?? true;

      const result = resolvedYaml
        ? await executeWorkflow({
            yaml: resolvedYaml,
            workflowId: resolvedWorkflowId,
            name: resolvedName,
            workflowParams,
            request,
            spaceId,
            workflowApi,
            waitForCompletion: wait,
          })
        : await executeWorkflow({
            workflowId: resolvedWorkflowId as string,
            workflowParams,
            request,
            spaceId,
            workflowApi,
            waitForCompletion: wait,
          });

      if (result.success) {
        return {
          results: [otherResult({ execution: result.execution })],
        };
      }

      return {
        results: [errorResult(result.error)],
      };
    },
    tags: [],
  };
};
