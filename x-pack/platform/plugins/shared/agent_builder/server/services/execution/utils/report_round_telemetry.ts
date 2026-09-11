/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { ModelProvider } from '@kbn/inference-common';
import type {
  Conversation,
  ConversationAction,
  ConversationRound,
  ConverseInput,
  RoundCompleteEvent,
} from '@kbn/agent-builder-common';
import { ConversationRoundStatus, isEventsNativeVersion } from '@kbn/agent-builder-common';
import type { PromptResponse } from '@kbn/agent-builder-common/agents/prompts';
import {
  AgentPromptType,
  isAskUserQuestionPromptResponse,
  isAuthorizationPromptResponse,
  isConfirmationPromptResponse,
} from '@kbn/agent-builder-common/agents/prompts';
import type { AnalyticsService } from '../../../telemetry';
import type { TrackingService } from '../../../telemetry/tracking_service';
import type { MeteringService } from '../../metering';
import {
  executionTerminatedEventId,
  roundExecutionCount,
} from '../../conversation/client/rounds_to_events';

/** How a human resolved one prompt, as reported to telemetry. */
export type PromptResponseOutcome =
  | 'accepted'
  | 'declined'
  | 'authorized'
  | 'authorization_declined'
  | 'answered'
  | 'skipped';

/**
 * One execution of a round, as telemetry sees it. A round with a HITL pause has several of these:
 * `exec_0` ending in a pause, then one per resume.
 */
export interface ExecutionTelemetry {
  /**
   * The owning round. Always taken from the folded round, never from `follow_up_round.id`, which
   * is a throwaway uuid minted by `createRound` for the resume.
   */
  roundId: string;
  /** Position of the round in the conversation, 1-based. */
  roundCount: number;
  /** 0 for the initial run, k for the k-th resume. */
  executionIndex: number;
  /** This execution's own round: its usage, timings and steps, unmerged. */
  executionRound: ConversationRound;
  /** The folded round, carrying correct totals for every execution so far. */
  roundTotals: ConversationRound;
  /** True when this execution ended the round rather than pausing it. */
  isRoundTerminal: boolean;
  /** False for the first execution of a round. */
  isResume: boolean;
  /** Prompt types this execution paused on, when it paused. */
  pendingPromptTypes: string[];
  /** Prompt types this execution was resumed with, when it is a resume. */
  promptResponseTypes: string[];
  /** How each of those prompts was resolved, index-aligned with `promptResponseTypes`. */
  promptResponseOutcomes: PromptResponseOutcome[];
  /** Time the human took to answer, when it can be measured. */
  humanLatencyMs?: number;
}

/** `PromptResponse` carries no discriminator, so the type is recovered from its shape. */
const typeOf = (response: PromptResponse): AgentPromptType => {
  if (isConfirmationPromptResponse(response)) {
    return AgentPromptType.confirmation;
  }
  if (isAuthorizationPromptResponse(response)) {
    return AgentPromptType.authorization;
  }
  return AgentPromptType.ask_user_question;
};

const outcomeOf = (response: PromptResponse): PromptResponseOutcome => {
  if (isConfirmationPromptResponse(response)) {
    return response.allow ? 'accepted' : 'declined';
  }
  if (isAuthorizationPromptResponse(response)) {
    return response.authorized ? 'authorized' : 'authorization_declined';
  }
  if (isAskUserQuestionPromptResponse(response)) {
    return response.answers.every((answer) => answer.skipped === true) ? 'skipped' : 'answered';
  }
  return 'answered';
};

/**
 * Time between the pause and this resume. Only meaningful for an events-native conversation: a
 * legacy one has its timeline synthesized from the already-folded round, so the pause timestamp is
 * derived arithmetic rather than a measurement.
 */
const humanLatencyMs = ({
  conversation,
  roundId,
  executionIndex,
  executionRound,
}: {
  conversation: Conversation;
  roundId: string;
  executionIndex: number;
  executionRound: ConversationRound;
}): number | undefined => {
  if (!isEventsNativeVersion(conversation.schema_version) || executionIndex < 1) {
    return undefined;
  }
  const pausedAt = conversation.events?.find(
    (event) => event.id === executionTerminatedEventId(roundId, executionIndex - 1)
  )?.created_at;
  if (!pausedAt) {
    return undefined;
  }
  const latency = new Date(executionRound.started_at).getTime() - new Date(pausedAt).getTime();
  return latency >= 0 ? latency : undefined;
};

/**
 * Describes the single execution a `round_complete` event actually covers.
 *
 * The event fires once per execution, but on a resume `data.round` is the *folded* round, whose
 * usage, timings and steps are the sum across every execution so far. Reporting that on each
 * emission counts the earlier executions again, compounding with each pause. `resume_execution`
 * carries the unmerged execution, so prefer it.
 */
export const buildExecutionTelemetry = ({
  event,
  conversation,
  nextInput,
  action,
  logger,
}: {
  event: RoundCompleteEvent;
  conversation: Conversation;
  nextInput?: ConverseInput;
  action?: ConversationAction;
  logger?: Logger;
}): ExecutionTelemetry => {
  const roundTotals = event.data.round;
  const isResume = event.data.resumed === true;
  const followUpRound = event.data.resume_execution?.follow_up_round;

  if (isResume && !followUpRound) {
    // Should not happen; `stripResumeExecution` must stay below the telemetry tap. Degrade to the
    // folded round rather than dropping the report entirely.
    logger?.debug(
      `Resumed round ${roundTotals.id} reported without a resume_execution payload; execution telemetry will over-report`
    );
  }

  const executionRound = followUpRound ?? roundTotals;
  const roundId = roundTotals.id;
  const executionIndex = isResume ? roundExecutionCount(conversation.events ?? [], roundId) : 0;

  const isReplacingRound = action === 'regenerate' || isResume;
  const roundCount = isReplacingRound
    ? conversation.rounds.length
    : (conversation.rounds?.length ?? 0) + 1;

  const promptResponses = isResume ? Object.values(nextInput?.prompts ?? {}) : [];

  return {
    roundId,
    roundCount,
    executionIndex,
    executionRound,
    roundTotals,
    isRoundTerminal: executionRound.status !== ConversationRoundStatus.awaitingPrompt,
    isResume,
    pendingPromptTypes: (executionRound.pending_prompts ?? []).map((prompt) => prompt.type),
    promptResponseTypes: promptResponses.map(typeOf),
    promptResponseOutcomes: promptResponses.map(outcomeOf),
    ...(isResume
      ? {
          humanLatencyMs: humanLatencyMs({ conversation, roundId, executionIndex, executionRound }),
        }
      : {}),
  };
};

/**
 * Fans a `round_complete` out to metering, usage counters and EBT.
 *
 * The three consumers deliberately fire on different gates: metering and the execution event on
 * every execution, the round bucket on the first one (so a round abandoned at a pause is still
 * counted as started), and the round event on the last one (so it reports true round totals once).
 */
export const reportRoundTelemetry = ({
  event,
  conversation,
  nextInput,
  action,
  agentId,
  executionId,
  modelProvider,
  meteringService,
  trackingService,
  analyticsService,
  logger,
}: {
  event: RoundCompleteEvent;
  conversation: Conversation;
  nextInput?: ConverseInput;
  action?: ConversationAction;
  agentId: string;
  executionId: string;
  modelProvider: ModelProvider;
  meteringService: MeteringService;
  trackingService?: TrackingService;
  analyticsService?: AnalyticsService;
  logger: Logger;
}): void => {
  try {
    const telemetry = buildExecutionTelemetry({ event, conversation, nextInput, action, logger });
    const { roundTotals, roundId, roundCount, executionIndex } = telemetry;

    // Billing is per turn, so exactly one record per round, emitted when the turn answers and
    // carrying the turn's totals. A pause is not a billable turn: it has produced no response yet,
    // and if it is never resumed it never becomes one.
    if (telemetry.isRoundTerminal) {
      meteringService
        .reportExecution({
          agentId,
          executionId,
          conversationId: conversation.id,
          modelProvider,
          roundId,
          roundCount,
          executionCount: executionIndex + 1,
          usage: roundTotals.model_usage,
          status: roundTotals.status,
          startedAt: roundTotals.started_at,
          timeToFirstToken: roundTotals.time_to_first_token,
          timeToLastToken: roundTotals.time_to_last_token,
          steps: roundTotals.steps ?? [],
          messageLength: roundTotals.input.message.length,
          responseLength: roundTotals.response.message.length,
        })
        .catch((err) => {
          logger.warn(`Failed to report execution metering: ${err}`);
        });
    }

    analyticsService?.reportExecutionComplete({
      agentId,
      conversationId: conversation.id,
      executionId,
      modelProvider,
      telemetry,
    });

    // Counts rounds started, so a round abandoned at a pause still counts once.
    if (!telemetry.isResume) {
      trackingService?.trackConversationRound(conversation.id, roundCount);
    }

    // Counts rounds completed, with the folded round's true totals.
    if (telemetry.isRoundTerminal) {
      analyticsService?.reportRoundComplete({
        agentId,
        conversationId: conversation.id,
        executionId,
        modelProvider,
        round: roundTotals,
        roundCount,
        conversationAttachments: event.data.attachments ?? conversation.attachments ?? [],
      });
    }
  } catch (error) {
    logger.error(`Failed to report round complete telemetry: ${error}`);
  }
};
