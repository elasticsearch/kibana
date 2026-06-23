/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createReasoningStep,
  createToolCallStep,
  ConversationRoundStepType,
} from '@kbn/agent-builder-common/chat/conversation';
import type { CompactionStep } from '@kbn/agent-builder-common/chat/conversation';
import { groupSteps } from './group_steps';

const makeToolCallStep = (toolCallId: string) =>
  createToolCallStep({ tool_call_id: toolCallId, tool_id: 'some_tool', params: {}, results: [] });

const makeReasoningStep = (text: string) => createReasoningStep({ reasoning: text });

const makeCompactionStep = (): CompactionStep => ({
  type: ConversationRoundStepType.compaction,
  summarized_round_count: 2,
  token_count_before: 1000,
  token_count_after: 400,
});

describe('groupSteps — RoundEvents contract', () => {
  it('returns an empty array for an empty steps list', () => {
    expect(groupSteps([])).toEqual([]);
  });

  it('groups all consecutive tool calls into a single group item', () => {
    const a = makeToolCallStep('tc-1');
    const b = makeToolCallStep('tc-2');
    const items = groupSteps([a, b]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'group', steps: [a, b] });
  });

  it('wraps even a single tool call in a group', () => {
    const step = makeToolCallStep('tc-1');
    const items = groupSteps([step]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'group', steps: [step] });
  });

  it('emits a ReasoningStep as an individual step item', () => {
    const step = makeReasoningStep('some thought');
    const items = groupSteps([step]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'step', step, index: 0 });
  });

  it('ReasoningStep breaks consecutive tool calls into two groups', () => {
    const r = makeReasoningStep('thinking…');
    const a = makeToolCallStep('tc-1');
    const b = makeToolCallStep('tc-2');

    // canonical example from requirements: Reasoning → Tool A → Tool B
    const items = groupSteps([r, a, b]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'step', step: r, index: 0 });
    expect(items[1]).toMatchObject({ kind: 'group', steps: [a, b] });
  });

  it('CompactionStep also breaks a tool group', () => {
    const a = makeToolCallStep('tc-1');
    const compact = makeCompactionStep();
    const b = makeToolCallStep('tc-2');

    const items = groupSteps([a, compact, b]);

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ kind: 'group', steps: [a] });
    expect(items[1]).toMatchObject({ kind: 'step', step: compact, index: 1 });
    expect(items[2]).toMatchObject({ kind: 'group', steps: [b] });
  });

  it('ReasoningStep overrides tool_call_group_id — same group_id on both sides still produces two groups', () => {
    const r = makeReasoningStep('thinking…');
    const a = createToolCallStep({
      tool_call_id: 'tc-1',
      tool_id: 'tool',
      params: {},
      results: [],
      tool_call_group_id: 'grp-A',
    });
    const b = createToolCallStep({
      tool_call_id: 'tc-2',
      tool_id: 'tool',
      params: {},
      results: [],
      tool_call_group_id: 'grp-A',
    });

    const items = groupSteps([a, r, b]);

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ kind: 'group', steps: [a] });
    expect(items[1]).toMatchObject({ kind: 'step', step: r });
    expect(items[2]).toMatchObject({ kind: 'group', steps: [b] });
  });
});
