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
import type {
  BrowserApiToolMetadata,
  ChatAgentEvent,
  ConversationRound,
  MetadataFieldValue,
  RoundInput,
} from '@kbn/agent-builder-common';
import { ToolOrigin } from '@kbn/agent-builder-common';
import {
  ChatEventType,
  AgentExecutionMode,
  isToolCallStep,
  isRelevantSkillsStep,
} from '@kbn/agent-builder-common';
import type { AgentEventEmitterFn, AgentHandlerContext } from '@kbn/agent-builder-server';
import { HookLifecycle } from '@kbn/agent-builder-server';
import type { ConversationInternalState, CompactionSummary } from '@kbn/agent-builder-common/chat';
import type { ToolManager, TodoStateManager } from '@kbn/agent-builder-server/runner';
import { ToolManagerToolType, type PromptManager } from '@kbn/agent-builder-server/runner';
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
import {
  selectRelevantSkills,
  buildRecentContext,
  type RelevantSkillSelection,
} from './utils/relevant_skills/select_relevant_skills';
import { resolveConfiguration } from './utils/configuration';
import { ensureValidInput } from './utils/preflight_checks';
import { buildPendingRoundActions } from './utils/build_pending_round_actions';
import { computeContextBudget } from './utils/context_budget';
import { DEFAULT_MAX_TOOL_RESULT_TOKENS } from './utils/tool_result_guardrail';
import { compactConversation } from './utils/conversation_compactor';
import { createAgentGraph } from './graph';
import { convertGraphEvents } from './convert_graph_events';
import type { RunAgentParams, RunAgentResponse } from './run_agent';
import { steps } from './constants';
import { createPromptFactory } from './prompts';
import { createImageResolver } from './utils/image_resolver';
import { BackgroundExecutionService } from './background_execution_service';
import { SubagentTracker } from './subagent_tracker';
import type { StateType } from './state';
import { eventsForContext, groupTimelineRounds, roundResponse } from './utils/context_timeline';

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
    origin,
    author,
    agentConfiguration,
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
    roundId: providedRoundId,
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
    renderers,
    conversationClient,
  } = context;

  // The context is built from the normalized event timeline (legacy conversations serialized
  // through roundsToEvents) so preflight, pending-round detection and message building read one
  // source. Regenerate replaces the last round, so a paused one is never resumed.
  const timeline = conversation ? eventsForContext(conversation) : [];

  ensureValidInput({ input: nextInput, timeline, action });

  const pendingRound = action === 'regenerate' ? undefined : getPendingRound(timeline);
  // Capture todos before the round runs so they can be carried over if the agent doesn't write new todos
  const initialTodos = todoStateManager.get();
  const conversationTimestamp = pendingRound?.started_at ?? startTime.toISOString();

  // Only clear access tracking for a brand new round; keep it when resuming (HITL).
  if (!pendingRound) {
    context.attachmentStateManager.clearAccessTracking();
  }

  const roundId = providedRoundId ?? uuidv4();

  // Create background execution service from conversation state
  const backgroundExecutionService = new BackgroundExecutionService({
    subAgentExecutor: context.subAgentExecutor,
    initialState: conversation?.state?.background_executions,
  });

  const subagentTracker = new SubagentTracker(conversation?.state?.subagents);

  const model = await modelProvider.getDefaultModel();
  const resolvedConfiguration = await resolveConfiguration(agentConfiguration, {
    aiIndicesEnabled: experimentalFeatures.aiIndices,
    request,
    resolver: context.aiIndexResolver,
    logger,
  });

  // Context-aware skill filtering is active only when its flag is on AND a dedicated fast model is
  // configured. Without a fast model, `selectModel({ effortLevel: 'low' })` falls back to the default
  // (expensive) model, which defeats the feature — so we treat it as off (original full-list behavior).
  const relevantSkillsEnabled =
    experimentalFeatures.relevantSkills && (await modelProvider.hasFastModel());

  const pluginSkillIds = await context.plugins.resolveSkillIds(agentConfiguration.plugin_ids ?? []);
  const skillIdsOverride = configurationOverrides?.skill_ids;
  const filteredPluginSkillIds =
    skillIdsOverride !== undefined
      ? pluginSkillIds.filter((id) => skillIdsOverride.includes(id))
      : pluginSkillIds;
  const filteredSkills = await selectSkills({
    skills,
    skillsStore,
    agentConfiguration,
    additionalSkillIds: filteredPluginSkillIds,
  });

  logger.debug(`Running chat agent with connector: ${model.connector.name}, runId: ${runId}`);

  // ReplaySubject so events emitted before subscription (e.g. compaction) are
  // replayed to late subscribers when the merged stream is subscribed to.
  const manualEvents$ = new ReplaySubject<ChatAgentEvent>();
  const eventEmitter: AgentEventEmitterFn = (event) => {
    manualEvents$.next(event);
  };
  toolManager.setEventEmitter(eventEmitter);
  toolManager.setMaxToolResultTokens(DEFAULT_MAX_TOOL_RESULT_TOKENS);

  // Pass action so regenerate uses the last round's original input instead of request input
  let processedConversation = await prepareConversation({
    nextInput,
    timeline,
    nextInputAuthor: pendingRound?.author ?? author,
    context,
    action,
    metadata: conversation?.metadata,
    templateId: conversation?.template_id,
  });

  const beforeHookResult = await context.hooks.run(HookLifecycle.beforeAgent, {
    request,
    abortSignal,
    nextInput: processedConversation.nextInput,
    agentId,
    conversationId: conversation?.id,
  });
  processedConversation.nextInput = beforeHookResult.nextInput ?? processedConversation.nextInput;

  const relevantSkillsSelectionPromise: Promise<RelevantSkillSelection> | undefined =
    relevantSkillsEnabled && !pendingRound
      ? selectRelevantSkills({
          skills: filteredSkills,
          context: {
            userMessage: processedConversation.nextInput.message,
            recentContext: buildRecentContext(
              groupTimelineRounds(processedConversation.timeline).map((round) => ({
                input: round.userMessage.data,
                response: roundResponse(round),
              }))
            ),
          },
          modelProvider,
          logger,
          abortSignal,
        })
      : undefined;

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

  const conversationId = conversation?.id;
  const updateConversationMetadata =
    conversationId && conversation?.template_id
      ? (updates: Record<string, MetadataFieldValue>) =>
          conversationClient.patchMetadata(conversationId, updates)
      : undefined;

  const conversationTemplate = conversation?.template_id
    ? await context.conversationTemplates.get(conversation.template_id)
    : undefined;

  await registerInternalTools({
    context,
    agentId,
    executionId,
    abortSignal,
    backgroundExecutionService,
    updateConversationMetadata,
    conversationTemplate,
    filteredSkills,
    relevantSkillsEnabled,
    parentConversationId: conversation?.id,
    subagentTracker,
    conversationExists: (id: string) => conversationClient.exists(id),
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

  const perRoundTokenCounts = await estimatePerRoundTokens(processedConversation.timeline, {
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

  // Reassign to the (possibly compacted) conversation for prompt construction.
  // Re-propagate conversation-level fields that compaction does not touch.
  processedConversation = {
    ...compactionResult.processedConversation,
    metadata: conversation?.metadata,
    template_id: conversation?.template_id,
  };
  processedConversation.subagentRosterFallback = subagentTracker.snapshot();

  let relevantSkillsSelection: RelevantSkillSelection | undefined;
  if (relevantSkillsEnabled) {
    if (pendingRound) {
      const persisted = pendingRound.steps.find(isRelevantSkillsStep);
      relevantSkillsSelection = persisted ? { skills: persisted.skills } : undefined;
    } else if (relevantSkillsSelectionPromise) {
      relevantSkillsSelection = await relevantSkillsSelectionPromise;
    }
  }

  const imageResolver = createImageResolver({
    attachmentStateManager: context.attachmentStateManager,
    attachments,
    request,
    spaceId: context.spaceId,
    logger,
  });

  const promptFactory = createPromptFactory({
    configuration: resolvedConfiguration,
    spaceId: context.spaceId,
    skills: filteredSkills,
    processedConversation,
    toolManager,
    resultTransformer,
    outputSchema,
    conversationTimestamp,
    experimentalFeatures,
    relevantSkillsEnabled,
    relevantSkills: relevantSkillsSelection,
    renderers: renderers?.getRegisteredRenderers() ?? [],
    imageResolver,
    conversationTemplates: context.conversationTemplates,
  });

  const agentGraph = createAgentGraph({
    logger,
    events: { emit: eventEmitter },
    chatModel: model.chatModel,
    toolManager,
    configuration: resolvedConfiguration,
    structuredOutput,
    outputSchema,
    processedConversation,
    promptFactory,
    backgroundExecutionService,
    subagentTracker,
    roundId,
    sessionId: conversation?.id ?? executionId,
    cacheControl: { type: 'ephemeral', ttl: '5m' },
  });

  logger.debug(`Running chat agent with graph: ${chatAgentGraphName}, runId: ${runId}`);

  const eventStream = agentGraph.streamEvents(
    createInitializerCommand({
      pendingRound,
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
    attachments: [], // legacy attachments are always stripped in `prepare_conversation` and replaced with refs
    attachment_refs: processedConversation.nextInput.attachment_refs,
  };

  manualEvents$.next({
    type: ChatEventType.roundStarted,
    data: {
      round_id: roundId,
      input: processedInput,
      started_at: startTime.toISOString(),
      ...(author ? { author } : {}),
      ...(origin ? { origin: { type: origin.type } } : {}),
      ...(pendingRound ? { resumed: true } : {}),
    },
  });

  const effectiveOverrides = configurationOverrides ?? pendingRound?.configuration_overrides;

  const events$ = merge(graphEvents$, manualEvents$).pipe(
    addRoundCompleteEvent({
      userInput: processedInput,
      origin,
      author,
      getConversationState: () =>
        getConversationState({
          promptManager,
          toolManager,
          compactionSummary: compactionResult.summary,
          backgroundExecutionService,
          todoStateManager,
          subagents: subagentTracker.snapshot(),
        }),
      pendingRound,
      startTime,
      modelProvider,
      mainConnectorId: model.connector.connectorId,
      stateManager,
      attachmentStateManager: context.attachmentStateManager,
      configurationOverrides: effectiveOverrides,
      compactionResult,
      roundId,
      initialTodos,
      relevantSkillsSelection,
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

  // Fire post-round hooks (nonBlocking — round is already streamed, hooks run fire-and-forget).
  // The try/catch is defensive; nonBlocking hooks should never throw to the runner.
  try {
    await context.hooks.run(HookLifecycle.afterExecution, {
      request,
      abortSignal,
      agentId,
      round,
      conversationId: conversation?.id,
      agentConfiguration,
    });
  } catch (err) {
    logger.error(`After-round hooks failed: ${err instanceof Error ? err.message : String(err)}`);
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
  subagents,
}: {
  promptManager: PromptManager;
  toolManager: ToolManager;
  backgroundExecutionService: BackgroundExecutionService;
  compactionSummary?: CompactionSummary;
  todoStateManager: TodoStateManager;
  subagents?: Record<string, string>;
}): ConversationInternalState => {
  const bgState = backgroundExecutionService.getPendingState();
  const todos = todoStateManager.get();
  return {
    prompt: promptManager.dump(),
    dynamic_tool_ids: toolManager.getDynamicToolIds(),
    ...(compactionSummary ? { compaction_summary: compactionSummary } : {}),
    ...(Object.keys(bgState).length > 0 ? { background_executions: bgState } : {}),
    ...(todos !== undefined ? { todos } : {}),
    ...(subagents && Object.keys(subagents).length > 0 ? { subagents } : {}),
  };
};

const createInitializerCommand = ({
  pendingRound,
  cycleLimit,
  agentBuilderToLangchainIdMap,
  promptManager,
  eventEmitter,
}: {
  pendingRound?: ConversationRound;
  cycleLimit: number;
  agentBuilderToLangchainIdMap: ToolIdMapping;
  promptManager: PromptManager;
  eventEmitter: AgentEventEmitterFn;
}): Command => {
  const initialState: Partial<StateType> = { cycleLimit };
  let startAt = steps.init;

  if (pendingRound) {
    const { actions, consumedPromptIds } = buildPendingRoundActions({
      round: pendingRound,
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
    const hasPendingToolCall = pendingRound.steps.some(
      (step) => isToolCallStep(step) && step.results.length === 0
    );
    startAt = hasPendingToolCall ? steps.executeTool : steps.researchAgent;
  }

  if (pendingRound?.state) {
    initialState.currentCycle = pendingRound.state.agent.current_cycle;
    initialState.errorCount = pendingRound.state.agent.error_count;
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
