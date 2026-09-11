/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  BeforeAgentHookContext,
  HookHandlerResult,
  HookLifecycle,
} from '@kbn/agent-builder-server';
import {
  createWorkflowAbortedError,
  createWorkflowExecutionError,
} from '@kbn/agent-builder-common';
import { AGENT_BUILDER_PRE_PROMPT_WORKFLOW_IDS } from '@kbn/management-settings-ids';
import { ExecutionStatus, WORKFLOWS_UI_SETTING_ID } from '@kbn/workflows';
import type { Logger } from '@kbn/logging';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { IUiSettingsClient } from '@kbn/core/server';
import { executeWorkflow } from '@kbn/agent-builder-tools-base/workflows';
import type { InternalStartServices } from '../../services/types';
import { getCurrentSpaceId } from '../../utils/spaces';
import type { BeforeAgentWorkflowOutput } from './types';
import type { AgentsServiceStart } from '../../services/agents';
import {
  mergePreExecutionWorkflowIds,
  toStringArray,
} from '../../../common/pre_execution_workflows';

type WorkflowApi = WorkflowsServerPluginSetup['management'];

export interface RunBeforeAgentWorkflowsParams {
  context: BeforeAgentHookContext;
  workflowApi: WorkflowApi;
  getInternalServices: () => InternalStartServices;
  logger: Logger;
}

/**
 * Normalizes workflow output: when the engine returns a single-element array
 * (e.g. from a step inside an if/foreach), returns that element as an object.
 */
function normalizeWorkflowOutput(output: unknown): unknown {
  if (
    Array.isArray(output) &&
    output.length === 1 &&
    typeof output[0] === 'object' &&
    output[0] !== null
  ) {
    return output[0];
  }
  return output;
}

function isBeforeAgentWorkflowOutput(value: unknown): value is BeforeAgentWorkflowOutput {
  return typeof value === 'object' && value !== null;
}

/**
 * Runs the agent's configured before-agent workflows in sequence, updating the
 * round input when a workflow returns `new_prompt`. Throws on workflow failure
 * or when a workflow aborts the agent.
 *
 * @returns Updated nextInput when any workflow returned `new_prompt`, otherwise undefined
 */
export async function runBeforeAgentWorkflows({
  context,
  workflowApi,
  getInternalServices,
  logger,
}: RunBeforeAgentWorkflowsParams): Promise<void | HookHandlerResult<HookLifecycle.beforeAgent>> {
  const { agents, spaces, uiSettings, savedObjects } = getInternalServices();
  const soClient = savedObjects.getScopedClient(context.request);
  const uiSettingsClient = uiSettings.asScopedToClient(soClient);
  const isEnabled = await isPreExecutionWorkflowEnabled(uiSettingsClient);

  if (!isEnabled) {
    return;
  }

  const workflowIds = await getWorkflowIds(uiSettingsClient, context, agents);
  if (!workflowIds.length) {
    return;
  }

  const spaceId = getCurrentSpaceId({ request: context.request, spaces });
  let currentNextInput = context.nextInput;

  for (const workflowId of workflowIds) {
    const result = await executeWorkflow({
      workflowId,
      workflowParams: {
        prompt: currentNextInput.message ?? '',
        ...(context.conversationId ? { conversation_id: context.conversationId } : {}),
      },
      request: context.request,
      spaceId,
      workflowApi,
      waitForCompletion: true,
    });

    if (!result.success) {
      throw createWorkflowExecutionError(result.error, { workflow: workflowId });
    }

    const execution = result.execution;
    if (execution.status === ExecutionStatus.FAILED) {
      const workflowName = execution.workflow_name ?? execution.workflow_id;
      const errorMessage = execution.error_message ?? `Workflow "${workflowName}" failed`;

      throw createWorkflowExecutionError(errorMessage, { workflow: workflowName });
    }

    logger.debug(
      `Workflow execution finished: ${execution.workflow_id} (${execution.execution_id})`
    );

    const rawOutput = normalizeWorkflowOutput(execution.output);
    if (!isBeforeAgentWorkflowOutput(rawOutput)) {
      continue;
    }

    const output: BeforeAgentWorkflowOutput = rawOutput;

    if (output.new_prompt) {
      currentNextInput = { ...currentNextInput, message: output.new_prompt };
    }

    if (output.abort || output.abort_message) {
      const workflow = execution.workflow_name ?? execution.workflow_id;
      throw createWorkflowAbortedError(
        output.abort_message ?? `Workflow "${workflow}" aborted the agent execution.`,
        { workflow }
      );
    }
  }

  if (currentNextInput !== context.nextInput) {
    return { nextInput: currentNextInput };
  }
}

async function isPreExecutionWorkflowEnabled(uiSettingsClient: IUiSettingsClient) {
  return (await uiSettingsClient.get<boolean>(WORKFLOWS_UI_SETTING_ID)) ?? true;
}

async function getWorkflowIds(
  uiSettingsClient: IUiSettingsClient,
  context: BeforeAgentHookContext,
  agents: AgentsServiceStart
) {
  const globalWorkflowIds = toStringArray(
    await uiSettingsClient.get(AGENT_BUILDER_PRE_PROMPT_WORKFLOW_IDS)
  );

  let agentWorkflowIds: string[] = [];
  if (context.agentId) {
    const registry = await agents.getRegistry({ request: context.request });
    const agent = await registry.get(context.agentId);
    const configuration = await agents.resolveAgentConfiguration({
      agent,
      request: context.request,
    });
    agentWorkflowIds = configuration.workflow_ids ?? [];
  }

  return mergePreExecutionWorkflowIds(globalWorkflowIds, agentWorkflowIds);
}
