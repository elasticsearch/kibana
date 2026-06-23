/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { filter, finalize, from, merge, ReplaySubject, shareReplay } from 'rxjs';
import { Command } from '@langchain/langgraph';
import {
  isStreamEvent,
  reverseMap,
  type ToolIdMapping,
} from '@kbn/agent-builder-genai-utils/langchain';
import type { BrowserApiToolMetadata, ChatAgentEvent, RoundInput } from '@kbn/agent-builder-common';
import { ToolOrigin } from '@kbn/agent-builder-common';
import {
  ConversationRoundStatus,
  AgentExecutionMode,
  isToolCallStep,
} from '@kbn/agent-builder-common';
import type { AgentEventEmitterFn, AgentHandlerContext } from '@kbn/agent-builder-server';
import { HookLifecycle } from '@kbn/agent-builder-server';
import type { ConversationInternalState, CompactionSummary } from '@kbn/agent-builder-common/chat';
import type { ToolManager, TodoStateManager } from '@kbn/agent-builder-server/runner';
import { ToolManagerToolType, type PromptManager } from '@kbn/agent-builder-server/runner';
import type { ProcessedConversation } from './utils/prepare_conversation';
import { createResultTransformer } from './utils/create_result_transformer';
import {
  addRoundCompleteEvent,
  extractRound,
  prepareConversation,
  selectSkills,
  selectTools,
  getPendingRound,
  evictInternalEvents,
  estimatePerRoundTokens,
} from './utils';
import { registerInternalTools } from './tools/register_internal_tools';
import { resolveCapabilities } from './utils/capabilities';
import { resolveConfiguration } from './utils/configuration';
import { ensureValidInput } from './utils/preflight_checks';
import { buildPendingRoundActions } from './utils/build_pending_round_actions';
import { computeContextBudget } from './utils/context_budget';
import { compactConversation } from './utils/conversation_compactor';
import { createAgentGraph } from './graph';
import { convertGraphEvents } from './convert_graph_events';
import type { RunAgentParams, RunAgentResponse } from './run_agent';
import { steps } from './constants';
import { createPromptFactory } from './prompts';
import { BackgroundExecutionService } from './background_execution_service';
import type { StateType } from './state';

const chatAgentGraphName = 'default-agent-builder-agent';

export type RunChatAgentParams = Omit<RunAgentParams, 'mode'> & {
  browserApiTools?: BrowserApiToolMetadata[];
  startTime?: Date;
};

export type RunChatAgentFn = (
  params: RunChatAgentParams,
  context: AgentHandlerContext
) => Promise<RunAgentResponse>;

/*
 * Max number of agent cycles allowed before forcing an answer.
 */
const CYCLE_LIMIT = 30;

/**
 * Create the handler function for the default agentBuilder agent.
 */
export const runDefaultAgentMode: RunChatAgentFn = async (
  {
    nextInput,
    conversation,
    agentConfiguration,
    capabilities,
    runId = uuidv4(),
    agentId,
    abortSignal,
    browserApiTools,
    structuredOutput = false,
    outputSchema,
    startTime = new Date(),
    configurationOverrides,
    action,
    executionId,
  },
  context
) => {
  const {
    logger,
    modelProvider,
    toolProvider,
    toolRegistry,
    attachments,
    request,
    stateManager,
    events,
    promptManager,
    skills,
    skillsStore,
    toolManager,
    experimentalFeatures,
    todoStateManager,
  } = context;

  ensureValidInput({ input: nextInput, conversation, action });

  const pendingRound = getPendingRound(conversation);
  // Capture todos before the round runs so they can be carried over if the agent doesn't write new todos
  const initialTodos = todoStateManager.get();
  const conversationTimestamp = pendingRound?.started_at ?? startTime.toISOString();

  // Only clear access tracking for a brand new round; keep it when resuming (HITL).
  if (!pendingRound) {
    context.attachmentStateManager.clearAccessTracking();
  }

  const roundId = uuidv4();

  // Create background execution service from conversation state
  const backgroundExecutionService = new BackgroundExecutionService({
    subAgentExecutor: context.subAgentExecutor,
    initialState: conversation?.state?.background_executions,
  });

  const model = await modelProvider.getDefaultModel();
  const resolvedCapabilities = resolveCapabilities(capabilities);
  const resolvedConfiguration = resolveConfiguration(agentConfiguration);

  const pluginSkillIds = await context.plugins.resolveSkillIds(agentConfiguration.plugin_ids ?? []);
  const filteredSkills = await selectSkills({
    skills,
    skillsStore,
    agentConfiguration,
    additionalSkillIds: pluginSkillIds,
  });

  logger.debug(`Running chat agent with connector: ${model.connector.name}, runId: ${runId}`);

  // ReplaySubject so events emitted before subscription (e.g. compaction) are
  // replayed to late subscribers when the merged stream is subscribed to.
  const manualEvents$ = new ReplaySubject<ChatAgentEvent>();
  const eventEmitter: AgentEventEmitterFn = (event) => {
    manualEvents$.next(event);
  };
  toolManager.setEventEmitter(eventEmitter);

  // Pass action so regenerate uses the last round's original input instead of request input
  let processedConversation = await prepareConversation({
    nextInput,
    previousRounds: conversation?.rounds ?? [],
    context,
    action,
  });

  const beforeHookResult = await context.hooks.run(HookLifecycle.beforeAgent, {
    request,
    abortSignal,
    nextInput: processedConversation.nextInput,
    agentId,
  });
  processedConversation.nextInput = beforeHookResult.nextInput ?? processedConversation.nextInput;

  const { staticTools, dynamicTools } = await selectTools({
    conversation: processedConversation,
    previousDynamicToolIds: conversation?.state?.dynamic_tool_ids ?? [],
    filteredSkills,
    skills,
    toolProvider,
    agentConfiguration,
    attachmentsService: attachments,
    request,
    spaceId: context.spaceId,
    runner: context.runner,
  });

  // First add static tools
  await Promise.all([
    toolManager.addTools({
      type: ToolManagerToolType.executable,
      tools: staticTools,
      logger,
    }),
    toolManager.addTools({
      type: ToolManagerToolType.browser,
      tools: (browserApiTools ?? []).map((tool) => ({ ...tool, origin: ToolOrigin.internal })),
    }),
  ]);

  await registerInternalTools({
    context,
    agentId,
    executionId,
    capabilities,
    abortSignal,
    backgroundExecutionService,
  });

  // Then add dynamic tools
  await toolManager.addTools(
    {
      type: ToolManagerToolType.executable,
      tools: dynamicTools,
      logger,
    },
    {
      dynamic: true,
    }
  );

  const graphRecursionLimit = getRecursionLimit(CYCLE_LIMIT);

  const perRoundTokenCounts = await estimatePerRoundTokens(processedConversation.previousRounds, {
    toolManager,
    toolRegistry,
  });
  const conversationTokenEstimate = perRoundTokenCounts.reduce((sum, count) => sum + count, 0);

  // Create unified result transformer for tool result optimization
  const resultTransformer = createResultTransformer({
    toolRegistry,
    toolManager,
    resultStore: context.resultStore,
    conversationTokenEstimate,
  });

  // Context-aware compaction: check if conversation history exceeds the
  // model's context window budget and apply hybrid compaction if needed.
  // We pass events.emit directly (not the manualEvents$-based eventEmitter)
  // so compaction events reach the SSE stream immediately during the await,
  // rather than being buffered in the ReplaySubject and replayed after.
  const contextBudget = computeContextBudget(model.connector);
  const compactionResult = await compactConversation({
    processedConversation,
    chatModel: model.chatModel,
    contextBudget,
    perRoundTokenCounts,
    existingSummary: conversation?.state?.compaction_summary,
    logger,
    abortSignal,
    eventEmitter: events.emit,
  });

  // Reassign to the (possibly compacted) conversation for prompt construction
  processedConversation = compactionResult.processedConversation;

  const promptFactory = createPromptFactory({
    configuration: resolvedConfiguration,
    capabilities: resolvedCapabilities,
    skills: filteredSkills,
    processedConversation,
    toolManager,
    resultTransformer,
    outputSchema,
    conversationTimestamp,
    experimentalFeatures,
  });

  const agentGraph = createAgentGraph({
    logger,
    events: { emit: eventEmitter },
    chatModel: model.chatModel,
    toolManager,
    configuration: resolvedConfiguration,
    capabilities: resolvedCapabilities,
    structuredOutput,
    outputSchema,
    processedConversation,
    promptFactory,
    backgroundExecutionService,
    roundId,
  });

  logger.debug(`Running chat agent with graph: ${chatAgentGraphName}, runId: ${runId}`);

  const eventStream = agentGraph.streamEvents(
    createInitializerCommand({
      conversation: processedConversation,
      agentBuilderToLangchainIdMap: reverseMap(toolManager.getToolIdMapping()),
      cycleLimit: CYCLE_LIMIT,
      promptManager,
      eventEmitter,
    }),
    {
      version: 'v2',
      signal: abortSignal,
      runName: chatAgentGraphName,
      metadata: {
        graphName: chatAgentGraphName,
        agentId,
      },
      recursionLimit: graphRecursionLimit,
      callbacks: [],
      // prevent LangGraph from inheriting the parent graph's
      // abort signals via the __pregel_abort_signals configurable key. Without this,
      // the parent graph's cleanup abort cascades to the standalone execution.
      ...(context.executionMode === AgentExecutionMode.standalone
        ? { configurable: { __pregel_abort_signals: undefined } }
        : {}),
    }
  );

  const graphEvents$ = from(eventStream).pipe(
    filter(isStreamEvent),
    convertGraphEvents({
      graphName: chatAgentGraphName,
      toolManager,
      logger,
      startTime,
      pendingRound,
      structuredOutput,
    }),
    finalize(() => manualEvents$.complete())
  );

  const processedInput: RoundInput = {
    message: processedConversation.nextInput.message,
    attachments: processedConversation.nextInput.attachments.map((a) => a.attachment),
  };

  // Use provided overrides, or fall back to pending round's overrides (for HITL resume)
  const effectiveOverrides = configurationOverrides ?? pendingRound?.configuration_overrides;

  const events$ = merge(graphEvents$, manualEvents$).pipe(
    addRoundCompleteEvent({
      userInput: processedInput,
      getConversationState: () =>
        getConversationState({
          promptManager,
          toolManager,
          compactionSummary: compactionResult.summary,
          backgroundExecutionService,
          todoStateManager,
        }),
      pendingRound,
      startTime,
      modelProvider,
      stateManager,
      attachmentStateManager: context.attachmentStateManager,
      configurationOverrides: effectiveOverrides,
      compactionResult,
      roundId,
      initialTodos,
      getWorkspaceId: () => context.bashService?.getWorkspaceId(),
    }),
    evictInternalEvents(),
    shareReplay()
  );

  events$.subscribe({
    next: (event) => events.emit(event),
    error: () => {
      // error will be handled by function return, we just need to trap here
    },
  });

  const round = await extractRound(events$);

  // Persist filesystem state for this round (today: the workspace volume).
  try {
    await context.filesystemService.flush();
  } catch (err) {
    logger.error(`Failed to flush filesystem state after round: ${err.message ?? err}`);
  }
  return {
    round,
  };
};

const getConversationState = ({
  promptManager,
  toolManager,
  backgroundExecutionService,
  compactionSummary,
  todoStateManager,
}: {
  promptManager: PromptManager;
  toolManager: ToolManager;
  backgroundExecutionService: BackgroundExecutionService;
  compactionSummary?: CompactionSummary;
  todoStateManager: TodoStateManager;
}): ConversationInternalState => {
  const bgState = backgroundExecutionService.getPendingState();
  const todos = todoStateManager.get();
  return {
    prompt: promptManager.dump(),
    dynamic_tool_ids: toolManager.getDynamicToolIds(),
    ...(compactionSummary ? { compaction_summary: compactionSummary } : {}),
    ...(Object.keys(bgState).length > 0 ? { background_executions: bgState } : {}),
    ...(todos !== undefined ? { todos } : {}),
  };
};

const createInitializerCommand = ({
  conversation,
  cycleLimit,
  agentBuilderToLangchainIdMap,
  promptManager,
  eventEmitter,
}: {
  conversation: ProcessedConversation;
  cycleLimit: number;
  agentBuilderToLangchainIdMap: ToolIdMapping;
  promptManager: PromptManager;
  eventEmitter: AgentEventEmitterFn;
}): Command => {
  const initialState: Partial<StateType> = { cycleLimit };
  let startAt = steps.init;

  const lastRound = conversation.previousRounds.length
    ? conversation.previousRounds[conversation.previousRounds.length - 1]
    : undefined;

  if (lastRound?.status === ConversationRoundStatus.awaitingPrompt) {
    const { actions, consumedPromptIds } = buildPendingRoundActions({
      round: lastRound,
      promptState: promptManager.dump(),
      toolIdMapping: agentBuilderToLangchainIdMap,
      eventEmitter,
    });
    initialState.mainActions = actions;
    // on-resume cleanup: ask_user_question responses are consumed once per round.
    for (const id of consumedPromptIds) {
      promptManager.delete(id);
    }
    // If any tool-call step is still pending (empty results), executeTool must run it.
    // Otherwise the only thing that was paused was ask_user_question - so we go straight to the agent loop
    const hasPendingToolCall = lastRound.steps.some(
      (step) => isToolCallStep(step) && step.results.length === 0
    );
    startAt = hasPendingToolCall ? steps.executeTool : steps.researchAgent;
  }

  if (lastRound?.state) {
    initialState.currentCycle = lastRound.state.agent.current_cycle;
    initialState.errorCount = lastRound.state.agent.error_count;
  }

  return new Command({
    update: initialState,
    goto: startAt,
  });
};

const getRecursionLimit = (cycleLimit: number): number => {
  // langchain's recursionLimit is basically the number of nodes we can traverse before hitting a recursion limit error
  // in practice we have three steps per cycle (agent node + tool call node + background work), and then a few other steps (prepare + answering), and some extra buffer
  return Math.ceil(cycleLimit * 3.5 + 20);
};
