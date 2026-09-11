/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Conversation,
  ConversationRound,
  ConversationRoundAuthor,
  EventActor,
  ExecutionOutcome,
  ExecutionRunSummary,
  RoundInput,
  TimelineEvent,
} from '@kbn/agent-builder-common';
import {
  ConversationRoundStatus,
  EventActorType,
  TimelineEventType,
  TimelineTriggerType,
} from '@kbn/agent-builder-common';
import type { PromptResponse } from '@kbn/agent-builder-common/agents/prompts';

/**
 * Suffixes used to build the ids of every round-derived timeline event.
 */
export const ROUND_DERIVED_EVENT_ID_SUFFIXES = {
  userMessage: '::user_message',
  executionStarted: '::execution_started',
  executionTerminated: '::execution_terminated',
  execution: '::execution',
  stepPrefix: '::step::',
  promptResponse: '::prompt_response',
} as const;

const ROUND_DERIVED_EVENT_ID_SUFFIX_VALUES: readonly string[] = [
  ROUND_DERIVED_EVENT_ID_SUFFIXES.userMessage,
  ROUND_DERIVED_EVENT_ID_SUFFIXES.executionStarted,
  ROUND_DERIVED_EVENT_ID_SUFFIXES.executionTerminated,
  ROUND_DERIVED_EVENT_ID_SUFFIXES.execution,
];

const STEP_EVENT_ID_PATTERN = /::step::\d+$/;
// A resume writes a `prompt_response` event `${roundId}::prompt_response::${k}`. It is round-derived
// (regenerated/preserved with its round), so it must not be treated as an additive event.
const PROMPT_RESPONSE_EVENT_ID_PATTERN = /::prompt_response::\d+$/;

/** True when `id` was produced by {@link roundToEvents} or the resume append path. */
export const isRoundDerivedEventId = (id: string): boolean =>
  ROUND_DERIVED_EVENT_ID_SUFFIX_VALUES.some((suffix) => id.endsWith(suffix)) ||
  STEP_EVENT_ID_PATTERN.test(id) ||
  PROMPT_RESPONSE_EVENT_ID_PATTERN.test(id);

/** Round-derived event ids for a given round, keyed for readability. */
const roundDerivedEventIds = (roundId: string) => ({
  userMessage: `${roundId}${ROUND_DERIVED_EVENT_ID_SUFFIXES.userMessage}`,
  executionStarted: `${roundId}${ROUND_DERIVED_EVENT_ID_SUFFIXES.executionStarted}`,
  executionTerminated: `${roundId}${ROUND_DERIVED_EVENT_ID_SUFFIXES.executionTerminated}`,
  execution: `${roundId}${ROUND_DERIVED_EVENT_ID_SUFFIXES.execution}`,
});

/** ID for a step event. */
export const roundStepEventId = (roundId: string, sequence: number): string =>
  `${roundId}${ROUND_DERIVED_EVENT_ID_SUFFIXES.stepPrefix}${sequence}`;

/** The fields of a round needed to build its `user_message` start event. */
type RoundStart = Pick<ConversationRound, 'id' | 'input' | 'started_at' | 'author' | 'origin'>;

export const userMessageEvent = (round: RoundStart, conversation: Conversation): TimelineEvent => ({
  id: `${round.id}${ROUND_DERIVED_EVENT_ID_SUFFIXES.userMessage}`,
  type: TimelineEventType.userMessage,
  created_at: round.started_at,
  actor: userMessageActor(conversation, round),
  data: round.input,
});

export const executionStartedEvent = (
  round: Pick<ConversationRound, 'id' | 'started_at'>,
  conversation: Conversation
): TimelineEvent => {
  const ids = roundDerivedEventIds(round.id);
  return {
    id: ids.executionStarted,
    type: TimelineEventType.executionStarted,
    created_at: round.started_at,
    actor: agentActor(conversation),
    execution_id: ids.execution,
    trigger_event_id: ids.userMessage,
    data: { trigger_type: TimelineTriggerType.userMessage },
  };
};

export const roundStartEvents = (
  round: RoundStart,
  conversation: Conversation
): TimelineEvent[] => [
  userMessageEvent(round, conversation),
  executionStartedEvent(round, conversation),
];

export const roundStepEvents = (
  round: Pick<ConversationRound, 'id' | 'started_at' | 'steps'>,
  conversation: Conversation
): TimelineEvent[] => {
  const ids = roundDerivedEventIds(round.id);
  return (round.steps ?? []).map((step, index) => ({
    id: roundStepEventId(round.id, index),
    type: TimelineEventType.executionStep,
    created_at: round.started_at,
    actor: agentActor(conversation),
    execution_id: ids.execution,
    trigger_event_id: ids.userMessage,
    data: { step, sequence: index },
  }));
};

export const roundTerminatedEvent = (
  round: ConversationRound,
  conversation: Conversation
): TimelineEvent | undefined => {
  const ids = roundDerivedEventIds(round.id);
  const endedAt = new Date(
    new Date(round.started_at).getTime() + round.time_to_last_token
  ).toISOString();

  const outcome = outcomeForRound(round);
  if (!outcome) {
    return undefined;
  }
  return {
    id: ids.executionTerminated,
    type: TimelineEventType.executionTerminated,
    created_at: endedAt,
    actor: agentActor(conversation),
    execution_id: ids.execution,
    trigger_event_id: ids.userMessage,
    data: { ...executionRunSummary(round), outcome },
  };
};

/** The terminal outcome for a round, or `undefined` for a still-in-progress round (no terminal). */
const outcomeForRound = (round: ConversationRound): ExecutionOutcome | undefined => {
  if (round.status === ConversationRoundStatus.completed) {
    return { type: 'responded', response: round.response };
  }
  if (round.status === ConversationRoundStatus.awaitingPrompt) {
    return { type: 'prompt_requested', prompts: round.pending_prompts ?? [] };
  }
  return undefined;
};

export const roundToEvents = (
  round: ConversationRound,
  conversation: Conversation
): TimelineEvent[] => {
  const terminated = roundTerminatedEvent(round, conversation);
  return [
    ...roundStartEvents(round, conversation),
    ...roundStepEvents(round, conversation),
    ...(terminated ? [terminated] : []),
  ];
};

/**
 * Converts a rounds-based conversation into a timeline, on read. Maps each round with
 * {@link roundToEvents}, in round order.
 */
export const roundsToEvents = (conversation: Conversation): TimelineEvent[] =>
  conversation.rounds.flatMap((round) => roundToEvents(round, conversation));

const executionRunSummary = (round: ConversationRound): ExecutionRunSummary => ({
  model_usage: round.model_usage,
  time_to_first_token: round.time_to_first_token,
  time_to_last_token: round.time_to_last_token,
  ...(round.trace_id ? { trace_id: round.trace_id } : {}),
  ...(round.state ? { state: round.state } : {}),
  ...(round.configuration_overrides
    ? { configuration_overrides: round.configuration_overrides }
    : {}),
});

/** Actor for a round's `user_message`: the round author (external or user), else the owner. */
export const userMessageActor = (
  conversation: Conversation,
  round: Pick<ConversationRound, 'author' | 'origin'>
): EventActor => {
  if (round.author) {
    return {
      type: round.origin ? EventActorType.external : EventActorType.user,
      id: round.author.id,
      ...(round.author.username ? { username: round.author.username } : {}),
      ...(round.author.full_name ? { full_name: round.author.full_name } : {}),
      ...(round.origin ? { origin: round.origin } : {}),
    };
  }

  return {
    type: round.origin ? EventActorType.external : EventActorType.user,
    id: conversation.user.id ?? conversation.user.username,
    ...(conversation.user.username ? { username: conversation.user.username } : {}),
    ...(round.origin ? { origin: round.origin } : {}),
  };
};

/** Actor for a run's lifecycle events. */
export const agentActor = (conversation: Pick<Conversation, 'agent_id'>): EventActor => ({
  type: EventActorType.agent,
  id: conversation.agent_id,
});

/** Builds an execution id for a resume appended to a round without rewriting its initial run. */
export const resumeExecutionId = (roundId: string, executionIndex: number): string =>
  `${roundId}${ROUND_DERIVED_EVENT_ID_SUFFIXES.execution}::${executionIndex}`;

/** Parses initial and resume execution ids, returning undefined for unrelated ids. */
export const parseExecutionId = (id: string): { roundId: string; index: number } | undefined => {
  const match = id.match(/^(.*)::execution(?:::(\d+))?$/);
  if (!match) {
    return undefined;
  }
  return { roundId: match[1], index: Number(match[2] ?? 0) };
};

/**
 * How many executions a round already has on the timeline, which is also the index the next
 * execution will take. Shared by the resume write path and telemetry so the two cannot drift.
 */
export const roundExecutionCount = (events: TimelineEvent[], roundId: string): number =>
  new Set(
    events
      .map((event) => event.execution_id)
      .filter((id): id is string => id !== undefined && parseExecutionId(id)?.roundId === roundId)
  ).size;

/** The `execution_terminated` event id for an execution index (0 = the initial run). */
export const executionTerminatedEventId = (roundId: string, executionIndex: number): string =>
  executionIndex === 0
    ? `${roundId}${ROUND_DERIVED_EVENT_ID_SUFFIXES.executionTerminated}`
    : `${resumeExecutionId(roundId, executionIndex)}${
        ROUND_DERIVED_EVENT_ID_SUFFIXES.executionTerminated
      }`;

/** The `prompt_response` link event id written for the k-th resume of a round. */
export const promptResponseEventId = (roundId: string, executionIndex: number): string =>
  `${roundId}${ROUND_DERIVED_EVENT_ID_SUFFIXES.promptResponse}::${executionIndex}`;

/** Records a human answering a paused round, resuming a specific run. */
export const promptResponseEvent = ({
  roundId,
  executionIndex,
  promptRequestedEventId,
  responses,
  input,
  conversation,
  author,
  createdAt,
}: {
  roundId: string;
  executionIndex: number;
  promptRequestedEventId: string;
  responses: Record<string, PromptResponse>;
  /** The round input the resume contributed; persisted here since a resume has no user_message. */
  input?: RoundInput;
  conversation: Conversation;
  author?: ConversationRoundAuthor;
  createdAt: string;
}): TimelineEvent => ({
  id: promptResponseEventId(roundId, executionIndex),
  type: TimelineEventType.promptResponse,
  created_at: createdAt,
  actor: userMessageActor(conversation, { author }),
  data: {
    prompt_requested_event_id: promptRequestedEventId,
    responses,
    ...(input ? { input } : {}),
  },
});

/**
 * Builds the events for a resume execution (`exec_k`). Mirrors {@link roundToEvents} but with
 * execution-scoped ids and a `prompt_response` trigger, and without a `user_message` (a resume
 * continues an existing round, it does not start one).
 */
export const resumeExecutionToEvents = ({
  followUpRound,
  roundId,
  executionIndex,
  triggerEventId,
  conversation,
}: {
  followUpRound: ConversationRound;
  roundId: string;
  executionIndex: number;
  /** The `prompt_response` event id that triggered this execution. */
  triggerEventId: string;
  conversation: Conversation;
}): TimelineEvent[] => {
  const executionId = resumeExecutionId(roundId, executionIndex);
  const startedEvent: TimelineEvent = {
    id: `${executionId}${ROUND_DERIVED_EVENT_ID_SUFFIXES.executionStarted}`,
    type: TimelineEventType.executionStarted,
    created_at: followUpRound.started_at,
    actor: agentActor(conversation),
    execution_id: executionId,
    trigger_event_id: triggerEventId,
    data: { trigger_type: TimelineTriggerType.promptResponse },
  };
  const stepEvents: TimelineEvent[] = (followUpRound.steps ?? []).map((step, index) => ({
    id: `${executionId}${ROUND_DERIVED_EVENT_ID_SUFFIXES.stepPrefix}${index}`,
    type: TimelineEventType.executionStep,
    created_at: followUpRound.started_at,
    actor: agentActor(conversation),
    execution_id: executionId,
    trigger_event_id: triggerEventId,
    data: { step, sequence: index },
  }));
  const outcome = outcomeForRound(followUpRound);
  const endedAt = new Date(
    new Date(followUpRound.started_at).getTime() + followUpRound.time_to_last_token
  ).toISOString();
  const terminatedEvents: TimelineEvent[] = outcome
    ? [
        {
          id: executionTerminatedEventId(roundId, executionIndex),
          type: TimelineEventType.executionTerminated,
          created_at: endedAt,
          actor: agentActor(conversation),
          execution_id: executionId,
          trigger_event_id: triggerEventId,
          data: { ...executionRunSummary(followUpRound), outcome },
        },
      ]
    : [];
  return [startedEvent, ...stepEvents, ...terminatedEvents];
};
