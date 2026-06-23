/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ZodObject } from '@kbn/zod/v4';
import type { ToolResult, ToolType } from '@kbn/agent-builder-common';
import { isExcludedFromFilestore } from '@kbn/agent-builder-common/tools';
import {
  createBadRequestError,
  HookLifecycle,
  ToolResultType,
  AgentExecutionMode,
} from '@kbn/agent-builder-common';
import { withExecuteToolSpan } from '@kbn/inference-tracing';
import type {
  AfterToolCallHookContext,
  BeforeToolCallHookContext,
  RunToolReturn,
  ToolHandlerContext,
  ToolHandlerReturn,
} from '@kbn/agent-builder-server';
import { getAgentFromRunContext } from '@kbn/agent-builder-server';
import type {
  ScopedRunnerRunToolsParams,
  ScopedRunnerRunInternalToolParams,
} from '@kbn/agent-builder-server/runner';
import { generateFakeToolCallId } from '@kbn/agent-builder-genai-utils/langchain';
import { createErrorResult } from '@kbn/agent-builder-server';
import type {
  InternalToolDefinition,
  ToolHandlerCallContext,
} from '@kbn/agent-builder-server/tools';
import { isToolHandlerStandardReturn } from '@kbn/agent-builder-server/tools';
import { getToolResultId } from '@kbn/agent-builder-server/tools';
import { ConfirmationStatus } from '@kbn/agent-builder-common/agents';
import { getCurrentSpaceId } from '../../../utils/spaces';
import { ToolCallSource } from '../../../telemetry';
import {
  forkContextForToolRun,
  createToolEventEmitter,
  createToolProvider,
  createSkillsService,
} from './utils';
import { toolConfirmationId, createToolConfirmationPrompt } from './utils/prompts';
import type { RunnerManager } from './runner';

export const runTool = async <TParams = Record<string, unknown>>({
  toolExecutionParams,
  parentManager,
}: {
  toolExecutionParams: ScopedRunnerRunToolsParams<TParams>;
  parentManager: RunnerManager;
}): Promise<RunToolReturn> => {
  const { trackingService, toolsService, request } = parentManager.deps;
  const { toolId, ...scopedParams } = toolExecutionParams;

  const toolRegistry = await toolsService.getRegistry({ request });
  const tool = (await toolRegistry.get(toolId)) as InternalToolDefinition<
    ToolType,
    any,
    ZodObject<any>
  >;

  if (trackingService) {
    try {
      trackingService.trackToolCall(toolId, ToolCallSource.API);
    } catch (error) {
      /* empty */
    }
  }

  return runInternalTool({ toolExecutionParams: { ...scopedParams, tool }, parentManager });
};

export const runInternalTool = async <TParams = Record<string, unknown>>({
  toolExecutionParams,
  parentManager,
}: {
  toolExecutionParams: ScopedRunnerRunInternalToolParams<TParams>;
  parentManager: RunnerManager;
}): Promise<RunToolReturn> => {
  const {
    tool,
    toolParams: initialToolParams,
    toolCallId = generateFakeToolCallId(),
    source = 'unknown',
  } = toolExecutionParams;

  const context = forkContextForToolRun({
    parentContext: parentManager.context,
    toolId: tool.id,
    toolCallId,
    source,
  });
  const manager = parentManager.createChild(context);
  const { resultStore, promptManager } = manager.deps;

  let toolParams = initialToolParams as unknown as Record<string, unknown>;
  const hooks = manager.deps.hooks;

  const hookContext: BeforeToolCallHookContext = {
    toolId: tool.id,
    toolCallId,
    toolParams,
    source,
    request: manager.deps.request,
    abortSignal: manager.deps.abortSignal,
  };
  const beforeToolHooksResult = await hooks.run(HookLifecycle.beforeToolCall, hookContext);
  toolParams = beforeToolHooksResult.toolParams;

  const isStandaloneExecution = manager.deps.executionMode === AgentExecutionMode.standalone;

  // only perform pre-call confirmation prompt when the agent is calling the tool
  if (tool.confirmation && source === 'agent') {
    if (tool.confirmation.askUser === 'once' || tool.confirmation.askUser === 'always') {
      // In sub-agent mode, HITL is not available — auto-decline
      if (isStandaloneExecution) {
        return {
          results: [
            createErrorResult(
              'Agent running in non-interactive mode, user input not available - execution was declined'
            ),
          ],
        };
      }

      const confirmationId = toolConfirmationId({
        toolId: tool.id,
        toolCallId,
        policyMode: tool.confirmation.askUser,
      });
      const { status: confirmStatus } = promptManager.getConfirmationStatus(confirmationId);

      if (confirmStatus === ConfirmationStatus.rejected) {
        return {
          results: [createErrorResult('The user chose not to proceed with this action.')],
        };
      }

      if (confirmStatus === ConfirmationStatus.unprompted) {
        const definition = tool.confirmation.getConfirmation
          ? await tool.confirmation.getConfirmation({ toolParams })
          : undefined;
        return {
          prompt: createToolConfirmationPrompt({ confirmationId, tool, definition }),
        };
      }
    }
  }

  const startTime = Date.now();
  const toolHandlerContext = await createToolHandlerContext<TParams>({
    toolExecutionParams: {
      toolId: tool.id,
      toolCallId,
      source,
      toolParams: toolParams as TParams,
      onEvent: toolExecutionParams.onEvent ?? (() => undefined),
    },
    manager,
  });

  const toolReturn = await withExecuteToolSpan(
    tool.id,
    { tool: { input: toolParams, toolCallId, description: tool.description } },
    async (): Promise<ToolHandlerReturn> => {
      const schema = await tool.getSchema();
      const validation = schema.safeParse(toolParams);
      if (validation.error) {
        throw createBadRequestError(
          `Tool ${tool.id} was called with invalid parameters: ${validation.error.message}`
        );
      }

      try {
        const toolHandler = await tool.getHandler();
        const result = await toolHandler(
          validation.data as Record<string, unknown>,
          toolHandlerContext
        );
        return result;
      } catch (err) {
        return {
          results: [createErrorResult(err.message)],
        };
      }
    }
  );

  const duration = Date.now() - startTime;

  let runToolReturn: RunToolReturn;
  if (isToolHandlerStandardReturn(toolReturn)) {
    const resultsWithIds = toolReturn.results.map<ToolResult>(
      (result) =>
        ({
          ...result,
          tool_result_id: result.tool_result_id ?? getToolResultId(),
        } as ToolResult)
    );
    runToolReturn = { results: resultsWithIds };

    reportToolCallTelemetry({
      parentManager,
      toolId: tool.id,
      toolType: tool.type,
      toolCallId,
      source,
      results: resultsWithIds,
      duration,
    });
  } else {
    // On-demand HITL prompt from tool handler
    if (isStandaloneExecution) {
      runToolReturn = {
        results: [
          createErrorResult(
            'Agent running in non-interactive mode, user input not available - execution was declined'
          ),
        ],
      };
    } else {
      runToolReturn = { prompt: toolReturn.prompt };
    }
  }

  const postContext: AfterToolCallHookContext = {
    toolId: tool.id,
    toolCallId,
    toolParams,
    source,
    request: manager.deps.request,
    toolReturn: runToolReturn,
    abortSignal: manager.deps.abortSignal,
    toolHandlerContext,
  };
  const afterToolHooksResult = await hooks.run(HookLifecycle.afterToolCall, postContext);
  runToolReturn = afterToolHooksResult.toolReturn;

  if (runToolReturn.results && !isExcludedFromFilestore(tool.id)) {
    runToolReturn.results.forEach((result) => {
      resultStore.add({
        tool_id: tool.id,
        tool_call_id: toolCallId,
        result,
      });
    });
  }

  return runToolReturn;
};

type ToolHandlerExecutionParams<TParams = Record<string, unknown>> = Pick<
  Required<ScopedRunnerRunToolsParams<TParams>>,
  'onEvent' | 'toolId' | 'toolCallId' | 'toolParams' | 'source'
>;

export const createToolHandlerContext = async <TParams = Record<string, unknown>>({
  manager,
  toolExecutionParams,
}: {
  toolExecutionParams: ToolHandlerExecutionParams<TParams>;
  manager: RunnerManager;
}): Promise<ToolHandlerContext> => {
  const { onEvent, toolId, toolCallId, toolParams, source } = toolExecutionParams;
  const {
    request,
    elasticsearch,
    savedObjects,
    spaces,
    modelProvider,
    toolsService,
    resultStore,
    skillsStore,
    attachmentStateManager,
    logger,
    promptManager,
    stateManager,
    skillServiceStart,
    toolManager,
  } = manager.deps;
  const spaceId = getCurrentSpaceId({ request, spaces });

  const callContext: ToolHandlerCallContext = {
    toolId,
    toolCallId,
    callSource: source,
  };

  return {
    callContext,
    request,
    spaceId,
    logger,
    esClient: elasticsearch.client.asScoped(request),
    savedObjectsClient: savedObjects.getScopedClient(request),
    modelProvider,
    runner: manager.getRunner(),
    toolProvider: createToolProvider({
      registry: await toolsService.getRegistry({ request }),
      runner: manager.getRunner(),
      request,
    }),
    stateManager: stateManager.getToolStateManager({ toolId, toolCallId }),
    prompts: promptManager.forTool({
      toolId,
      toolCallId,
      toolParams: toolParams as Record<string, unknown>,
    }),
    resultStore: resultStore.asReadonly(),
    skillsStore: skillsStore.asReadonly(),
    attachments: attachmentStateManager,
    skills: await createSkillsService({
      skillServiceStart,
      toolsServiceStart: toolsService,
      request,
      spaceId,
      runner: manager.getRunner(),
    }),
    toolManager,
    events: createToolEventEmitter({ eventHandler: onEvent, context: manager.context }),
    runContext: manager.context,
    executionMode: manager.deps.executionMode,
    agentConfiguration: manager.deps.agentConfiguration,
  };
};

const getAgentExecutionContext = (manager: RunnerManager) => {
  return getAgentFromRunContext(manager.context);
};

const reportToolCallTelemetry = ({
  parentManager,
  toolId,
  toolType,
  toolCallId,
  source,
  results,
  duration,
}: {
  parentManager: RunnerManager;
  toolId: string;
  toolType: ToolType;
  toolCallId: string;
  source: string;
  results: ToolResult[];
  duration: number;
}): void => {
  const { analyticsService } = parentManager.deps;
  if (!analyticsService) {
    return;
  }

  try {
    const agentContext = getAgentExecutionContext(parentManager);
    const allErrors = results.length > 0 && results.every((r) => r.type === ToolResultType.error);

    if (allErrors) {
      const firstError = results[0];
      const errorMessage =
        firstError.type === ToolResultType.error
          ? (firstError.data as { message: string }).message
          : 'Unknown error';
      analyticsService.reportToolCallError({
        agentId: agentContext?.agentId,
        conversationId: agentContext?.conversationId,
        executionId: agentContext?.executionId,
        toolId,
        toolType,
        toolCallId,
        source,
        errorType: 'tool_error',
        errorMessage,
        duration,
      });
    } else {
      analyticsService.reportToolCallSuccess({
        agentId: agentContext?.agentId,
        conversationId: agentContext?.conversationId,
        executionId: agentContext?.executionId,
        toolId,
        toolType,
        toolCallId,
        source,
        resultTypes: results.map((r) => r.type),
        duration,
      });
    }
  } catch (e) {
    parentManager.deps.logger.warn(`Failed to report tool call telemetry: ${e}`);
  }
};
