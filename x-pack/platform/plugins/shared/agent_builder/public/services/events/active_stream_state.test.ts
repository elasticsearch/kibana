/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ChatEventType, type ChatEvent } from '@kbn/agent-builder-common';
import { AgentPromptType } from '@kbn/agent-builder-common/agents';
import { ConversationRoundStepType } from '@kbn/agent-builder-common';
import { activeStreamReducer, initialActiveStreamState } from './active_stream_state';

// --------------- minimal event factories ---------------

const reasoningEvent = (reasoning: string, transient?: boolean): ChatEvent =>
  ({
    type: ChatEventType.reasoning,
    data: { reasoning, transient },
  } as ChatEvent);

const messageChunkEvent = (text_chunk: string): ChatEvent =>
  ({
    type: ChatEventType.messageChunk,
    data: { message_id: 'm1', text_chunk },
  } as ChatEvent);

const messageCompleteEvent = (message_content: string): ChatEvent =>
  ({
    type: ChatEventType.messageComplete,
    data: { message_id: 'm1', message_content },
  } as ChatEvent);

const thinkingCompleteEvent = (time_to_first_token: number): ChatEvent =>
  ({
    type: ChatEventType.thinkingComplete,
    data: { time_to_first_token },
  } as ChatEvent);

const toolCallEvent = (tool_call_id: string, tool_id: string): ChatEvent =>
  ({
    type: ChatEventType.toolCall,
    data: { tool_call_id, tool_id, params: {} },
  } as ChatEvent);

const toolProgressEvent = (tool_call_id: string, message: string): ChatEvent =>
  ({
    type: ChatEventType.toolProgress,
    data: { tool_call_id, message },
  } as ChatEvent);

const toolResultEvent = (tool_call_id: string, results: any[]): ChatEvent =>
  ({
    type: ChatEventType.toolResult,
    data: { tool_call_id, tool_id: 'some_tool', results },
  } as ChatEvent);

const promptRequestEvent = (): ChatEvent =>
  ({
    type: ChatEventType.promptRequest,
    data: {
      prompt: { type: AgentPromptType.confirmation, id: 'p1' },
      source: { type: 'tool_call', tool_call_id: 'tc1' },
    },
  } as ChatEvent);

const compactionStartedEvent = (token_count_before: number): ChatEvent =>
  ({
    type: ChatEventType.compactionStarted,
    data: { token_count_before },
  } as ChatEvent);

const compactionCompletedEvent = (
  token_count_after: number,
  summarized_round_count: number
): ChatEvent =>
  ({
    type: ChatEventType.compactionCompleted,
    data: { token_count_after, summarized_round_count },
  } as ChatEvent);

const todosUpdatedEvent = (todos: any[]): ChatEvent =>
  ({
    type: ChatEventType.toolUi,
    data: {
      tool_id: 'todos',
      tool_call_id: 'tc-todos',
      custom_event: 'todos_updated',
      data: { todos },
    },
  } as ChatEvent);

const roundCompleteEvent = (round_id: string): ChatEvent =>
  ({
    type: ChatEventType.roundComplete,
    data: { round: { id: round_id, steps: [], status: 'completed' } },
  } as unknown as ChatEvent);

const unknownEvent = (): ChatEvent =>
  ({
    type: 'unknown_event_type_xyz',
    data: {},
  } as any as ChatEvent);

// -------------------------------------------------------

describe('activeStreamReducer', () => {
  it('creates an active execution from empty on first event', () => {
    const state = activeStreamReducer(initialActiveStreamState, messageChunkEvent('hello'));
    expect(state.activeExecution).not.toBeNull();
    expect(state.activeExecution?.status).toBe('running');
    expect(state.activeExecution?.message).toBe('hello');
  });

  it('reasoning transient=true sets transientReasoning, adds NO step', () => {
    const state = activeStreamReducer(
      initialActiveStreamState,
      reasoningEvent('thinking...', true)
    );
    expect(state.activeExecution?.transientReasoning).toBe('thinking...');
    expect(state.activeExecution?.steps).toHaveLength(0);
  });

  it('reasoning non-transient appends a reasoning step, resets message and clears transientReasoning', () => {
    const s1 = activeStreamReducer(initialActiveStreamState, messageChunkEvent('prior'));
    const s2 = activeStreamReducer(s1, reasoningEvent('thinking...', true));
    const s3 = activeStreamReducer(s2, reasoningEvent('real reasoning'));

    expect(s3.activeExecution?.steps).toHaveLength(1);
    expect(s3.activeExecution?.steps[0].type).toBe(ConversationRoundStepType.reasoning);
    expect(s3.activeExecution?.message).toBe('');
    expect(s3.activeExecution?.transientReasoning).toBeUndefined();
  });

  it('message_chunk appends text_chunk to message and clears transientReasoning; two chunks concatenate', () => {
    const s1 = activeStreamReducer(initialActiveStreamState, reasoningEvent('tr', true));
    const s2 = activeStreamReducer(s1, messageChunkEvent('Hello '));
    const s3 = activeStreamReducer(s2, messageChunkEvent('world'));

    expect(s2.activeExecution?.transientReasoning).toBeUndefined();
    expect(s3.activeExecution?.message).toBe('Hello world');
  });

  it('message_complete replaces message with message_content', () => {
    const s1 = activeStreamReducer(initialActiveStreamState, messageChunkEvent('partial'));
    const s2 = activeStreamReducer(s1, messageCompleteEvent('full message'));
    expect(s2.activeExecution?.message).toBe('full message');
  });

  it('thinking_complete sets timeToFirstToken', () => {
    const state = activeStreamReducer(initialActiveStreamState, thinkingCompleteEvent(420));
    expect(state.activeExecution?.timeToFirstToken).toBe(420);
  });

  it('tool_call appends a tool call step with correct tool_call_id and tool_id', () => {
    const state = activeStreamReducer(initialActiveStreamState, toolCallEvent('tc-1', 'my_tool'));
    const steps = state.activeExecution?.steps ?? [];
    expect(steps).toHaveLength(1);
    expect(steps[0].type).toBe(ConversationRoundStepType.toolCall);
    expect((steps[0] as any).tool_call_id).toBe('tc-1');
    expect((steps[0] as any).tool_id).toBe('my_tool');
  });

  it('tool_progress appends to matching tool-call step progression; unmatched id is a no-op', () => {
    const s1 = activeStreamReducer(initialActiveStreamState, toolCallEvent('tc-1', 'my_tool'));
    const s2 = activeStreamReducer(s1, toolProgressEvent('tc-1', 'step 1'));
    const s3 = activeStreamReducer(s2, toolProgressEvent('tc-99', 'orphan'));

    const step = s2.activeExecution?.steps[0] as any;
    expect(step.progression).toHaveLength(1);
    expect(step.progression[0].message).toBe('step 1');

    // unmatched progress - steps unchanged
    expect(s3.activeExecution?.steps[0]).toEqual(s2.activeExecution?.steps[0]);
  });

  it('tool_result sets results on the matching tool-call step', () => {
    const s1 = activeStreamReducer(initialActiveStreamState, toolCallEvent('tc-1', 'my_tool'));
    const s2 = activeStreamReducer(s1, toolResultEvent('tc-1', [{ content: 'ok' }]));

    const step = s2.activeExecution?.steps[0] as any;
    expect(step.results).toEqual([{ content: 'ok' }]);
  });

  it('prompt_request sets status to awaiting_prompt and appends to pendingPrompts', () => {
    const state = activeStreamReducer(initialActiveStreamState, promptRequestEvent());
    expect(state.activeExecution?.status).toBe('awaiting_prompt');
    expect(state.activeExecution?.pendingPrompts).toHaveLength(1);
    expect((state.activeExecution?.pendingPrompts?.[0] as any).id).toBe('p1');
  });

  it('compaction_started then compaction_completed creates one compaction step patched with token_count_after and summarized_round_count', () => {
    const s1 = activeStreamReducer(initialActiveStreamState, compactionStartedEvent(1000));
    expect(s1.activeExecution?.steps).toHaveLength(1);
    expect(s1.activeExecution?.steps[0].type).toBe(ConversationRoundStepType.compaction);
    expect((s1.activeExecution?.steps[0] as any).token_count_before).toBe(1000);
    expect((s1.activeExecution?.steps[0] as any).token_count_after).toBe(0);

    const s2 = activeStreamReducer(s1, compactionCompletedEvent(500, 3));
    expect(s2.activeExecution?.steps).toHaveLength(1);
    expect((s2.activeExecution?.steps[0] as any).token_count_after).toBe(500);
    expect((s2.activeExecution?.steps[0] as any).summarized_round_count).toBe(3);
  });

  it('todos_updated adds a todos step first time; patches same step on second call (not a second step)', () => {
    const todos1 = [{ id: 't1', text: 'first', completed: false }];
    const todos2 = [{ id: 't2', text: 'second', completed: false }];

    const s1 = activeStreamReducer(initialActiveStreamState, todosUpdatedEvent(todos1));
    expect(s1.activeExecution?.steps).toHaveLength(1);
    expect(s1.activeExecution?.steps[0].type).toBe(ConversationRoundStepType.updateTodos);

    const s2 = activeStreamReducer(s1, todosUpdatedEvent(todos2));
    expect(s2.activeExecution?.steps).toHaveLength(1);
    expect((s2.activeExecution?.steps[0] as any).todos).toEqual(todos2);
  });

  it('round_complete seals: activeExecution becomes null, sealed gets one ExecutionTerminatedEvent with deterministic ids and outcome responded', () => {
    const s1 = activeStreamReducer(initialActiveStreamState, messageChunkEvent('hello'));
    const s2 = activeStreamReducer(s1, messageCompleteEvent('hello world'));
    const s3 = activeStreamReducer(s2, roundCompleteEvent('round-42'));

    expect(s3.activeExecution).toBeNull();
    expect(s3.sealed).toHaveLength(1);

    const sealed = s3.sealed[0];
    expect(sealed.id).toBe('round-42::execution_terminated');
    expect(sealed.execution_id).toBe('round-42::execution');
    expect(sealed.trigger_event_id).toBe('round-42::user_message');
    expect(typeof sealed.created_at).toBe('string');
    expect(sealed.data.outcome.type).toBe('responded');
    expect((sealed.data.outcome as any).response.message).toBe('hello world');
  });

  it('round_complete while status awaiting_prompt produces outcome prompt_requested with pending prompts', () => {
    const s1 = activeStreamReducer(initialActiveStreamState, promptRequestEvent());
    const s2 = activeStreamReducer(s1, roundCompleteEvent('round-99'));

    expect(s2.sealed).toHaveLength(1);
    const outcome = s2.sealed[0].data.outcome;
    expect(outcome.type).toBe('prompt_requested');
    expect((outcome as any).prompts).toHaveLength(1);
  });

  it('unhandled/unknown event after round_complete (activeExecution=null) returns state unchanged', () => {
    const s1 = activeStreamReducer(initialActiveStreamState, roundCompleteEvent('round-1'));
    expect(s1.activeExecution).toBeNull();

    const s2 = activeStreamReducer(s1, unknownEvent());
    expect(s2).toBe(s1); // same reference - no mutation
    expect(s2.activeExecution).toBeNull();
  });

  it('happy-path sequence: reasoning → tool_call → tool_result → message_chunk → message_complete → round_complete accumulates correctly and ends sealed', () => {
    let state = initialActiveStreamState;

    state = activeStreamReducer(state, reasoningEvent('thinking'));
    state = activeStreamReducer(state, toolCallEvent('tc-1', 'search'));
    state = activeStreamReducer(state, toolResultEvent('tc-1', [{ content: 'results' }]));
    state = activeStreamReducer(state, messageChunkEvent('answer '));
    state = activeStreamReducer(state, messageChunkEvent('here'));
    state = activeStreamReducer(state, messageCompleteEvent('answer here'));
    state = activeStreamReducer(state, roundCompleteEvent('round-final'));

    expect(state.activeExecution).toBeNull();
    expect(state.sealed).toHaveLength(1);

    const sealed = state.sealed[0];
    expect(sealed.id).toBe('round-final::execution_terminated');
    expect(sealed.data.outcome.type).toBe('responded');
    expect((sealed.data.outcome as any).response.message).toBe('answer here');
    const sealedSteps = sealed.data.steps ?? [];
    expect(sealedSteps).toHaveLength(2); // reasoning step + tool_call step
    expect(sealedSteps[0].type).toBe(ConversationRoundStepType.reasoning);
    expect(sealedSteps[1].type).toBe(ConversationRoundStepType.toolCall);
    expect((sealedSteps[1] as any).results).toEqual([{ content: 'results' }]);
  });
});
