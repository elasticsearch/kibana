/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ConversationRoundStepType,
  createReasoningStep,
  createToolCallStep,
} from '@kbn/agent-builder-common/chat/conversation';
import type {
  AskUserQuestionStep,
  BackgroundAgentCompleteStep,
  CompactionStep,
  TodosStep,
  ToolCallStep,
} from '@kbn/agent-builder-common/chat/conversation';
import { groupSteps } from './group_steps';
import { ExecutionStatus } from '@kbn/agent-builder-common';

const toolStep = (id: string, groupId?: string): ToolCallStep =>
  createToolCallStep({
    tool_call_id: id,
    tool_id: `tool-${id}`,
    params: {},
    results: [],
    ...(groupId !== undefined ? { tool_call_group_id: groupId } : {}),
  });

const reasoningStep = (text = 'thinking…') => createReasoningStep({ reasoning: text });

const transientReasoningStep = () =>
  createReasoningStep({ reasoning: 'streaming…', transient: true });

const compactionStep = (): CompactionStep => ({
  type: ConversationRoundStepType.compaction,
  summarized_round_count: 2,
  token_count_before: 4000,
  token_count_after: 1200,
});

const backgroundAgentStep = (): BackgroundAgentCompleteStep => ({
  type: ConversationRoundStepType.backgroundAgentComplete,
  execution_id: 'exec-1',
  status: ExecutionStatus.completed,
});

describe('groupSteps', () => {
  it('returns [] for an empty array', () => {
    expect(groupSteps([])).toEqual([]);
  });

  it('wraps a single tool call in a group', () => {
    const tool = toolStep('a');
    const result = groupSteps([tool]);

    expect(result).toEqual([{ kind: 'group', steps: [tool] }]);
  });

  it('wraps all consecutive tool calls in one group', () => {
    const a = toolStep('a');
    const b = toolStep('b');
    const c = toolStep('c');
    const result = groupSteps([a, b, c]);

    expect(result).toEqual([{ kind: 'group', steps: [a, b, c] }]);
  });

  it('passes a lone reasoning step through as a single step', () => {
    const r = reasoningStep();
    const result = groupSteps([r]);

    expect(result).toEqual([{ kind: 'step', step: r, index: 0 }]);
  });

  it('handles the canonical example from requirements', () => {
    // ReasoningStep → ToolA → ToolB → ReasoningStep → ToolC
    // expected: step | group(A,B) | step | group(C)
    const r1 = reasoningStep('first thought');
    const a = toolStep('a');
    const b = toolStep('b');
    const r2 = reasoningStep('second thought');
    const c = toolStep('c');

    const result = groupSteps([r1, a, b, r2, c]);

    expect(result).toEqual([
      { kind: 'step', step: r1, index: 0 },
      { kind: 'group', steps: [a, b] },
      { kind: 'step', step: r2, index: 3 },
      { kind: 'group', steps: [c] },
    ]);
  });

  it('handles leading tool calls (no preceding reasoning)', () => {
    const a = toolStep('a');
    const b = toolStep('b');
    const r = reasoningStep();

    const result = groupSteps([a, b, r]);

    expect(result).toEqual([
      { kind: 'group', steps: [a, b] },
      { kind: 'step', step: r, index: 2 },
    ]);
  });

  it('handles trailing tool calls (no following reasoning)', () => {
    const r = reasoningStep();
    const a = toolStep('a');
    const b = toolStep('b');

    const result = groupSteps([r, a, b]);

    expect(result).toEqual([
      { kind: 'step', step: r, index: 0 },
      { kind: 'group', steps: [a, b] },
    ]);
  });

  it('groups tool calls between multiple reasoning steps', () => {
    const r1 = reasoningStep('r1');
    const a = toolStep('a');
    const r2 = reasoningStep('r2');
    const b = toolStep('b');
    const c = toolStep('c');
    const r3 = reasoningStep('r3');

    const result = groupSteps([r1, a, r2, b, c, r3]);

    expect(result).toEqual([
      { kind: 'step', step: r1, index: 0 },
      { kind: 'group', steps: [a] },
      { kind: 'step', step: r2, index: 2 },
      { kind: 'group', steps: [b, c] },
      { kind: 'step', step: r3, index: 5 },
    ]);
  });

  it('preserves original array index on step segments for stable keys', () => {
    // The reasoning step is at index 2 in the original array
    const a = toolStep('a');
    const b = toolStep('b');
    const r = reasoningStep();
    const c = toolStep('c');

    const result = groupSteps([a, b, r, c]);

    const stepSegment = result.find((seg) => seg.kind === 'step');
    expect(stepSegment).toEqual({ kind: 'step', step: r, index: 2 });
  });

  it('treats consecutive reasoning steps as separate single segments', () => {
    const r1 = reasoningStep('r1');
    const r2 = reasoningStep('r2');

    const result = groupSteps([r1, r2]);

    expect(result).toEqual([
      { kind: 'step', step: r1, index: 0 },
      { kind: 'step', step: r2, index: 1 },
    ]);
  });

  it('CompactionStep flushes the current tool group and is emitted as a step', () => {
    const a = toolStep('a');
    const compact = compactionStep();
    const b = toolStep('b');

    const result = groupSteps([a, compact, b]);

    expect(result).toEqual([
      { kind: 'group', steps: [a] },
      { kind: 'step', step: compact, index: 1 },
      { kind: 'group', steps: [b] },
    ]);
  });

  it('BackgroundAgentCompleteStep flushes the current tool group and is emitted as a step', () => {
    const a = toolStep('a');
    const bg = backgroundAgentStep();
    const b = toolStep('b');

    const result = groupSteps([a, bg, b]);

    expect(result).toEqual([
      { kind: 'group', steps: [a] },
      { kind: 'step', step: bg, index: 1 },
      { kind: 'group', steps: [b] },
    ]);
  });

  it('transient ReasoningStep also flushes the tool group', () => {
    const a = toolStep('a');
    const transient = transientReasoningStep();
    const b = toolStep('b');

    const result = groupSteps([a, transient, b]);

    expect(result).toEqual([
      { kind: 'group', steps: [a] },
      { kind: 'step', step: transient, index: 1 },
      { kind: 'group', steps: [b] },
    ]);
  });

  it('handles a steps array with no tool calls', () => {
    const r1 = reasoningStep('r1');
    const compact = compactionStep();
    const r2 = reasoningStep('r2');

    const result = groupSteps([r1, compact, r2]);

    expect(result).toEqual([
      { kind: 'step', step: r1, index: 0 },
      { kind: 'step', step: compact, index: 1 },
      { kind: 'step', step: r2, index: 2 },
    ]);
  });

  it('merges consecutive parallel batches with different group IDs into one group when no reasoning step separates them', () => {
    const a = toolStep('a', 'grp-1');
    const b = toolStep('b', 'grp-1');
    const c = toolStep('c', 'grp-2');
    const d = toolStep('d', 'grp-2');

    const result = groupSteps([a, b, c, d]);

    expect(result).toEqual([{ kind: 'group', steps: [a, b, c, d] }]);
  });

  it('merges a solo tool call between two parallel batches into a single group', () => {
    const a = toolStep('a', 'grp-1');
    const solo = toolStep('solo');
    const c = toolStep('c', 'grp-2');

    const result = groupSteps([a, solo, c]);

    expect(result).toEqual([{ kind: 'group', steps: [a, solo, c] }]);
  });

  it('does not flush the tool buffer when a TodosStep arrives mid-stream between tool calls', () => {
    const todos: TodosStep = {
      type: ConversationRoundStepType.updateTodos,
      todos: [{ content: 'do thing', status: 'in_progress' }],
    };
    const a = toolStep('a');
    const b = toolStep('b');
    const c = toolStep('c');
    const result = groupSteps([a, b, todos, c]);

    expect(result).toEqual([{ kind: 'group', steps: [a, b, c] }]);
  });

  it('keeps a TodosStep between two reasoning steps from affecting grouping', () => {
    const todos: TodosStep = {
      type: ConversationRoundStepType.updateTodos,
      todos: [],
    };
    const r1 = reasoningStep('r1');
    const a = toolStep('a');
    const r2 = reasoningStep('r2');

    const result = groupSteps([r1, todos, a, todos, r2]);

    expect(result).toEqual([
      { kind: 'step', step: r1, index: 0 },
      { kind: 'group', steps: [a] },
      { kind: 'step', step: r2, index: 4 },
    ]);
  });

  it('does not flush the tool buffer when an AskUserQuestionStep arrives mid-stream between tool calls', () => {
    const askUserQuestion: AskUserQuestionStep = {
      type: ConversationRoundStepType.askUserQuestion,
      prompt_id: 'prompt-1',
      questions: [{ question: 'Do you want to proceed?', options: [], multi_select: false }],
    };
    const a = toolStep('a');
    const b = toolStep('b');
    const c = toolStep('c');

    const result = groupSteps([a, b, askUserQuestion, c]);

    expect(result).toEqual([{ kind: 'group', steps: [a, b, c] }]);
  });
});
