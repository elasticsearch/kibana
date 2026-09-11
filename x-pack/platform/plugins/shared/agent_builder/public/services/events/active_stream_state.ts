/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ChatEvent,
  ConversationRoundStep,
  CompactionStep,
  BackgroundAgentCompleteStep,
  TodosStep,
} from '@kbn/agent-builder-common';
import {
  isMessageChunkEvent,
  isMessageCompleteEvent,
  isReasoningEvent,
  isRoundCompleteEvent,
  isThinkingCompleteEvent,
  isToolCallEvent,
  isToolResultEvent,
  isToolProgressEvent,
  isPromptRequestEvent,
  isCompactionStartedEvent,
  isCompactionCompletedEvent,
  isBackgroundAgentCompleteEvent,
  isTodosUpdatedEvent,
  isToolCallStep,
  isCompactionStep,
  findTodosStep,
  ConversationRoundStepType,
} from '@kbn/agent-builder-common';
import {
  createReasoningStep,
  createToolCallStep,
} from '@kbn/agent-builder-common/chat/conversation';
import type { ExecutionTerminatedEvent } from '@kbn/agent-builder-common';
import { EventActorType, TimelineEventType } from '@kbn/agent-builder-common';
import type { PromptRequest } from '@kbn/agent-builder-common/agents';

/** The in-flight half of an execution, before it has a server-assigned id and becomes a real event. */
export interface ActiveExecutionDraft {
  status: 'running' | 'awaiting_prompt';
  steps: ConversationRoundStep[];
  /** Accumulated assistant message text. */
  message: string;
  /** Reasoning marked `transient` - shown live, never persisted as a step. */
  transientReasoning?: string;
  timeToFirstToken?: number;
  pendingPrompts?: PromptRequest[];
}

/** The active execution draft plus executions sealed locally this session, before refetch catches up. */
export interface ActiveStreamState {
  activeExecution: ActiveExecutionDraft | null;
  /** POC: events sealed locally on `round_complete`; in production these come from the server instead. */
  sealed: ExecutionTerminatedEvent[];
}

export const initialActiveStreamState: ActiveStreamState = {
  activeExecution: null,
  sealed: [],
};

const emptyActiveExecution = (): ActiveExecutionDraft => ({
  status: 'running',
  steps: [],
  message: '',
});

/**
 * Folds one SSE chat event into the active-stream state. Pure, so it drives an rxjs `scan` in `EventsService`.
 *
 * @todo `browser_tool_call` is a side effect, handled elsewhere, not here.
 */
export const activeStreamReducer = (
  state: ActiveStreamState,
  event: ChatEvent
): ActiveStreamState => {
  const activeExecution = state.activeExecution ?? emptyActiveExecution();

  if (isReasoningEvent(event)) {
    if (event.data.transient) {
      return {
        ...state,
        activeExecution: { ...activeExecution, transientReasoning: event.data.reasoning },
      };
    }
    return {
      ...state,
      activeExecution: {
        ...activeExecution,
        message: '',
        transientReasoning: undefined,
        steps: [
          ...activeExecution.steps,
          createReasoningStep({
            reasoning: event.data.reasoning,
            tool_call_id: event.data.tool_call_id,
            tool_call_group_id: event.data.tool_call_group_id,
          }),
        ],
      },
    };
  }

  if (isMessageChunkEvent(event)) {
    return {
      ...state,
      activeExecution: {
        ...activeExecution,
        transientReasoning: undefined,
        message: activeExecution.message + event.data.text_chunk,
      },
    };
  }

  if (isMessageCompleteEvent(event)) {
    return {
      ...state,
      activeExecution: { ...activeExecution, message: event.data.message_content },
    };
  }

  if (isThinkingCompleteEvent(event)) {
    return {
      ...state,
      activeExecution: { ...activeExecution, timeToFirstToken: event.data.time_to_first_token },
    };
  }

  if (isToolCallEvent(event)) {
    return {
      ...state,
      activeExecution: {
        ...activeExecution,
        steps: [
          ...activeExecution.steps,
          createToolCallStep({
            params: event.data.params,
            results: [],
            tool_call_id: event.data.tool_call_id,
            tool_id: event.data.tool_id,
            tool_call_group_id: event.data.tool_call_group_id,
            tool_origin: event.data.tool_origin,
          }),
        ],
      },
    };
  }

  if (isToolProgressEvent(event)) {
    const { tool_call_id: toolCallId, message, metadata } = event.data;
    return {
      ...state,
      activeExecution: {
        ...activeExecution,
        steps: activeExecution.steps.map((step) =>
          isToolCallStep(step) && step.tool_call_id === toolCallId
            ? {
                ...step,
                progression: [...(step.progression ?? []), { message, metadata: metadata ?? {} }],
              }
            : step
        ),
      },
    };
  }

  if (isToolResultEvent(event)) {
    const { tool_call_id: toolCallId, results } = event.data;
    return {
      ...state,
      activeExecution: {
        ...activeExecution,
        steps: activeExecution.steps.map((step) =>
          isToolCallStep(step) && step.tool_call_id === toolCallId ? { ...step, results } : step
        ),
      },
    };
  }

  if (isPromptRequestEvent(event)) {
    return {
      ...state,
      activeExecution: {
        ...activeExecution,
        status: 'awaiting_prompt',
        pendingPrompts: [...(activeExecution.pendingPrompts ?? []), event.data.prompt],
      },
    };
  }

  if (isCompactionStartedEvent(event)) {
    const step: CompactionStep = {
      type: ConversationRoundStepType.compaction,
      summarized_round_count: 0,
      token_count_before: event.data.token_count_before,
      token_count_after: 0,
    };
    return {
      ...state,
      activeExecution: { ...activeExecution, steps: [...activeExecution.steps, step] },
    };
  }

  if (isCompactionCompletedEvent(event)) {
    const { token_count_after: tokenCountAfter, summarized_round_count: summarizedRoundCount } =
      event.data;
    // Patch the most recent compaction step - the one the matching `compaction_started` just added.
    const steps = [...activeExecution.steps];
    for (let index = steps.length - 1; index >= 0; index--) {
      const step = steps[index];
      if (isCompactionStep(step)) {
        steps[index] = {
          ...step,
          token_count_after: tokenCountAfter,
          summarized_round_count: summarizedRoundCount,
        };
        break;
      }
    }
    return { ...state, activeExecution: { ...activeExecution, steps } };
  }

  if (isBackgroundAgentCompleteEvent(event)) {
    const step: BackgroundAgentCompleteStep = {
      type: ConversationRoundStepType.backgroundAgentComplete,
      ...event.data.execution,
    };
    return {
      ...state,
      activeExecution: { ...activeExecution, steps: [...activeExecution.steps, step] },
    };
  }

  if (isTodosUpdatedEvent(event)) {
    const { todos } = event.data.data;
    const existing = findTodosStep(activeExecution.steps);
    const steps = existing
      ? activeExecution.steps.map((step) =>
          step === existing ? { ...existing, todos, carried_over: false } : step
        )
      : [
          ...activeExecution.steps,
          { type: ConversationRoundStepType.updateTodos, todos } as TodosStep,
        ];
    return { ...state, activeExecution: { ...activeExecution, steps } };
  }

  if (isRoundCompleteEvent(event)) {
    // The round id only arrives here, so seal the draft into a real event and drop it.
    return {
      activeExecution: null,
      sealed: [...state.sealed, sealActiveExecution(activeExecution, event.data.round.id)],
    };
  }

  // Unhandled event: leave the draft untouched, otherwise a trailing event after
  // `round_complete` would resurrect an empty active execution.
  return state;
};

/** Builds the terminal event using the same deterministic ids as `rounds_to_events.ts`, so a later refetch merges by id instead of duplicating. */
const sealActiveExecution = (
  activeExecution: ActiveExecutionDraft,
  roundId: string
): ExecutionTerminatedEvent => ({
  id: `${roundId}::execution_terminated`,
  type: TimelineEventType.executionTerminated,
  created_at: new Date().toISOString(),
  actor: { type: EventActorType.agent, id: 'elastic-ai-agent' },
  execution_id: `${roundId}::execution`,
  trigger_event_id: `${roundId}::user_message`,
  data: {
    steps: activeExecution.steps,
    model_usage: {
      connector_id: '',
      llm_calls: 0,
      input_tokens: 0,
      output_tokens: 0,
      model: '',
    },
    time_to_first_token: activeExecution.timeToFirstToken ?? 0,
    time_to_last_token: 0,
    outcome:
      activeExecution.status === 'awaiting_prompt'
        ? { type: 'prompt_requested', prompts: activeExecution.pendingPrompts ?? [] }
        : { type: 'responded', response: { message: activeExecution.message } },
  },
});
