/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Conversation,
  ConversationRound,
  RoundCompleteEvent,
  RoundModelUsageStats,
} from '@kbn/agent-builder-common';
import {
  CONVERSATION_SCHEMA_VERSION,
  ChatEventType,
  ConversationRoundStatus,
} from '@kbn/agent-builder-common';
import { AgentPromptType } from '@kbn/agent-builder-common/agents/prompts';
import { mergeModelUsage } from '../../conversation/client/merge_rounds';
import { buildExecutionTelemetry, reportRoundTelemetry } from './report_round_telemetry';

const usage = (input: number, output = 1, llmCalls = 1): RoundModelUsageStats => ({
  connector_id: 'c1',
  llm_calls: llmCalls,
  input_tokens: input,
  output_tokens: output,
});

const round = (parts: Partial<ConversationRound> = {}): ConversationRound => ({
  id: 'r1',
  status: ConversationRoundStatus.completed,
  input: { message: 'do it' },
  response: { message: 'done' },
  steps: [],
  started_at: '2026-01-01T00:00:00.000Z',
  time_to_first_token: 1,
  time_to_last_token: 2,
  model_usage: usage(6),
  ...parts,
});

const conversation = (parts: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c1',
    agent_id: 'agent-1',
    title: 'T',
    user: { id: 'u1', username: 'u1' },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    rounds: [],
    ...parts,
  } as Conversation);

const completeEvent = (data: Partial<RoundCompleteEvent['data']>): RoundCompleteEvent =>
  ({ type: ChatEventType.roundComplete, data: { round: round(), ...data } } as RoundCompleteEvent);

/** The stored terminal of execution `index`, which the next resume measures its latency against. */
const terminatedEvent = (index: number, createdAt: string) =>
  ({
    id: index === 0 ? 'r1::execution_terminated' : `r1::execution::${index}::execution_terminated`,
    type: 'execution_terminated',
    created_at: createdAt,
    execution_id: index === 0 ? 'r1::execution' : `r1::execution::${index}`,
    actor: { type: 'agent', id: 'agent-1' },
    data: {},
  } as unknown as NonNullable<Conversation['events']>[number]);

const pauseTerminatedEvent = (createdAt: string) => terminatedEvent(0, createdAt);

describe('buildExecutionTelemetry', () => {
  it('describes the round itself for a first execution', () => {
    const telemetry = buildExecutionTelemetry({
      event: completeEvent({ round: round({ model_usage: usage(6) }) }),
      conversation: conversation(),
    });

    expect(telemetry).toEqual(
      expect.objectContaining({
        roundId: 'r1',
        executionIndex: 0,
        isResume: false,
        isRoundTerminal: true,
        roundCount: 1,
      })
    );
    expect(telemetry.executionRound.model_usage.input_tokens).toBe(6);
  });

  it('uses the unmerged follow-up round on a resume, not the folded one', () => {
    const telemetry = buildExecutionTelemetry({
      event: completeEvent({
        round: round({ model_usage: usage(10, 2, 2) }),
        resumed: true,
        resume_execution: { follow_up_round: round({ id: 'throwaway', model_usage: usage(4) }) },
      }),
      conversation: conversation({
        schema_version: CONVERSATION_SCHEMA_VERSION,
        rounds: [round()],
        events: [pauseTerminatedEvent('2026-01-01T00:00:00.000Z')],
      }),
    });

    expect(telemetry.executionRound.model_usage.input_tokens).toBe(4);
    expect(telemetry.roundTotals.model_usage.input_tokens).toBe(10);
    expect(telemetry.isResume).toBe(true);
    expect(telemetry.executionIndex).toBe(1);
  });

  it('takes round_id from the folded round, never from the follow-up round', () => {
    // `resumeRound` mints a throwaway uuid for the follow-up round; using it would orphan the row.
    const telemetry = buildExecutionTelemetry({
      event: completeEvent({
        round: round({ id: 'the-real-round' }),
        resumed: true,
        resume_execution: { follow_up_round: round({ id: 'b8d1-throwaway-uuid' }) },
      }),
      conversation: conversation({ rounds: [round()] }),
    });

    expect(telemetry.roundId).toBe('the-real-round');
  });

  it('reports a pause as non-terminal and carries the prompt types', () => {
    const telemetry = buildExecutionTelemetry({
      event: completeEvent({
        round: round({
          status: ConversationRoundStatus.awaitingPrompt,
          response: { message: '' },
          pending_prompts: [
            { id: 'p1', type: AgentPromptType.confirmation },
            { id: 'p2', type: AgentPromptType.ask_user_question, questions: [] },
          ] as ConversationRound['pending_prompts'],
        }),
      }),
      conversation: conversation(),
    });

    expect(telemetry.isRoundTerminal).toBe(false);
    expect(telemetry.pendingPromptTypes).toEqual(['confirmation', 'ask_user_question']);
  });

  it.each([
    [{ type: AgentPromptType.confirmation, allow: true }, 'accepted'],
    [{ type: AgentPromptType.confirmation, allow: false }, 'declined'],
    [{ type: AgentPromptType.authorization, authorized: true }, 'authorized'],
    [{ type: AgentPromptType.authorization, authorized: false }, 'authorization_declined'],
    [{ type: AgentPromptType.ask_user_question, answers: [{ choice: [0] }] }, 'answered'],
    [{ type: AgentPromptType.ask_user_question, answers: [{ skipped: true }] }, 'skipped'],
  ])('classifies %j as %s', (response, expected) => {
    const telemetry = buildExecutionTelemetry({
      event: completeEvent({
        resumed: true,
        resume_execution: { follow_up_round: round() },
      }),
      conversation: conversation({ rounds: [round()] }),
      nextInput: { prompts: { p1: response } } as never,
    });

    expect(telemetry.promptResponseOutcomes).toEqual([expected]);
    // the type is recovered from the response shape, since PromptResponse has no discriminator
    expect(telemetry.promptResponseTypes).toEqual([response.type]);
  });

  it('measures human latency from the pause terminal to this execution start', () => {
    const telemetry = buildExecutionTelemetry({
      event: completeEvent({
        resumed: true,
        resume_execution: {
          follow_up_round: round({ started_at: '2026-01-01T00:00:30.000Z' }),
        },
      }),
      conversation: conversation({
        schema_version: CONVERSATION_SCHEMA_VERSION,
        rounds: [round()],
        events: [pauseTerminatedEvent('2026-01-01T00:00:00.000Z')],
      }),
    });

    expect(telemetry.humanLatencyMs).toBe(30_000);
  });

  it('omits human latency for a legacy conversation, whose timeline timestamps are derived', () => {
    const telemetry = buildExecutionTelemetry({
      event: completeEvent({
        resumed: true,
        resume_execution: {
          follow_up_round: round({ started_at: '2026-01-01T00:00:30.000Z' }),
        },
      }),
      // no schema_version: events are synthesized from the folded round on read
      conversation: conversation({
        rounds: [round()],
        events: [pauseTerminatedEvent('2026-01-01T00:00:00.000Z')],
      }),
    });

    expect(telemetry.humanLatencyMs).toBeUndefined();
  });

  it('falls back to the folded round when resume_execution was stripped, without throwing', () => {
    const logger = { debug: jest.fn() };

    const telemetry = buildExecutionTelemetry({
      event: completeEvent({ round: round({ model_usage: usage(10) }), resumed: true }),
      conversation: conversation({ rounds: [round()] }),
      logger: logger as never,
    });

    expect(telemetry.executionRound.model_usage.input_tokens).toBe(10);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('resume_execution'));
  });

  it('sums to the folded totals across a pause and two resumes', () => {
    // The invariant the whole change exists to protect: per-execution reports must partition the
    // round, never overlap it. `mergeModelUsage` is the oracle so this tracks the fold logic.
    const e0 = usage(6, 1, 1);
    const e1 = usage(4, 2, 1);
    const e2 = usage(5, 3, 2);
    const foldedAfterE1 = mergeModelUsage(e0, e1);
    const foldedAfterE2 = mergeModelUsage(foldedAfterE1, e2);

    const paused = (model_usage: RoundModelUsageStats) =>
      round({
        status: ConversationRoundStatus.awaitingPrompt,
        response: { message: '' },
        model_usage,
      });

    // The conversation as each execution sees it: one stored terminal per execution already run.
    const convAfter = (executions: number) =>
      conversation({
        schema_version: CONVERSATION_SCHEMA_VERSION,
        rounds: [round()],
        events: Array.from({ length: executions }, (_, index) =>
          terminatedEvent(index, '2026-01-01T00:00:00.000Z')
        ),
      });

    const reports = [
      // exec_0 pauses
      buildExecutionTelemetry({
        event: completeEvent({ round: paused(e0) }),
        conversation: conversation(),
      }),
      // exec_1 resumes and pauses again
      buildExecutionTelemetry({
        event: completeEvent({
          round: paused(foldedAfterE1),
          resumed: true,
          resume_execution: { follow_up_round: paused(e1) },
        }),
        conversation: convAfter(1),
      }),
      // exec_2 resumes and answers
      buildExecutionTelemetry({
        event: completeEvent({
          round: round({ model_usage: foldedAfterE2 }),
          resumed: true,
          resume_execution: { follow_up_round: round({ model_usage: e2 }) },
        }),
        conversation: convAfter(2),
      }),
    ];

    expect(reports.map((report) => report.executionIndex)).toEqual([0, 1, 2]);

    const summed = reports
      .map((report) => report.executionRound.model_usage)
      .reduce((a, b) => mergeModelUsage(a, b));

    expect(summed.input_tokens).toBe(foldedAfterE2.input_tokens);
    expect(summed.output_tokens).toBe(foldedAfterE2.output_tokens);
    expect(summed.llm_calls).toBe(foldedAfterE2.llm_calls);

    // the round event fires exactly once, on the terminal execution
    expect(reports.filter((report) => report.isRoundTerminal)).toHaveLength(1);
    expect(reports[2].isRoundTerminal).toBe(true);
  });
});

/**
 * The billed unit, per https://github.com/elastic/search-team/issues/13010: one conversational
 * turn, one unit per 50k input tokens in that turn, and nothing at all if the turn never produced
 * a response. Billing calls the unit an "Agent Execution", but it is a whole round.
 *
 * These cases assert the definition, not current behaviour: a turn paused for human input must
 * still bill exactly once.
 */
describe('billing unit', () => {
  const drive = (
    executions: Array<{ own: RoundModelUsageStats; folded: RoundModelUsageStats; paused?: boolean }>
  ) => {
    const meteringService = { reportExecution: jest.fn().mockResolvedValue(undefined) };
    const conv = (index: number) =>
      conversation({
        schema_version: CONVERSATION_SCHEMA_VERSION,
        rounds: index === 0 ? [] : [round()],
        events: Array.from({ length: index }, (_, i) =>
          terminatedEvent(i, '2026-01-01T00:00:00.000Z')
        ),
      });

    executions.forEach((execution, index) => {
      const shape = execution.paused
        ? { status: ConversationRoundStatus.awaitingPrompt, response: { message: '' } }
        : {};
      reportRoundTelemetry({
        event: completeEvent({
          round: round({ ...shape, model_usage: execution.folded }),
          ...(index > 0
            ? {
                resumed: true,
                resume_execution: {
                  follow_up_round: round({ ...shape, model_usage: execution.own }),
                },
              }
            : {}),
        }),
        conversation: conv(index),
        agentId: 'agent-1',
        executionId: `execution-${index}`,
        modelProvider: 'OpenAI' as never,
        meteringService: meteringService as never,
        logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
      });
    });

    return meteringService.reportExecution.mock.calls.map(([call]) => call.usage.input_tokens);
  };

  it('bills a normal turn once', () => {
    expect(drive([{ own: usage(7_945), folded: usage(7_945) }])).toEqual([7_945]);
  });

  it('bills a paused-then-resumed turn once, on the turn total', () => {
    expect(
      drive([
        { own: usage(10_000), folded: usage(10_000), paused: true },
        { own: usage(10_000), folded: usage(20_000) },
      ])
    ).toEqual([20_000]);
  });

  it('bills a twice-paused turn once', () => {
    expect(
      drive([
        { own: usage(60_000), folded: usage(60_000), paused: true },
        { own: usage(60_000), folded: usage(120_000), paused: true },
        { own: usage(60_000), folded: usage(180_000) },
      ])
    ).toEqual([180_000]);
  });

  it('does not bill a pause that was never resumed', () => {
    expect(drive([{ own: usage(10_000), folded: usage(10_000), paused: true }])).toEqual([]);
  });
});
