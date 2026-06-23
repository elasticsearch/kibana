/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { BaseMessageLike } from '@langchain/core/messages';
import type { InferenceChatModel } from '@kbn/inference-langchain';
import type {
  CompactionSummary,
  CompactionStructuredData,
  CompactionToolCallSummary,
} from '@kbn/agent-builder-common';
import { ChatEventType, isToolCallStep } from '@kbn/agent-builder-common';
import type { AgentEventEmitterFn } from '@kbn/agent-builder-server';
import { estimateTokens } from '@kbn/agent-builder-genai-utils/tools/utils/token_count';
import type { ProcessedConversation, ProcessedConversationRound } from './prepare_conversation';
import type { ContextBudget } from './context_budget';
import { shouldTriggerCompaction } from './context_budget';
import { convertPreviousRounds } from './to_langchain_messages';
import { serializeCompactionSummary } from './compaction_serialize';
import { llmCompactionSchema, COMPACTION_SYSTEM_PROMPT } from './compaction_schema';
import type { LlmCompactionOutput } from './compaction_schema';

/**
 * Number of most-recent rounds to always preserve verbatim (never compact).
 * These rounds give the LLM immediate context about the latest interaction.
 */
const PRESERVED_RECENT_ROUNDS = 2;

/** Max characters for a tool params summary before truncation */
const PARAMS_SUMMARY_MAX_LENGTH = 120;

export interface CompactConversationOptions {
  processedConversation: ProcessedConversation;
  chatModel: InferenceChatModel;
  contextBudget: ContextBudget;
  /**
   * Per-round token counts for `processedConversation.previousRounds`, index-aligned.
   * Computed once upstream so the trigger, before/after reporting, and hard truncation
   * all share the same summarization-aware estimate.
   */
  perRoundTokenCounts: number[];
  existingSummary?: CompactionSummary;
  logger: Logger;
  abortSignal?: AbortSignal;
  eventEmitter?: AgentEventEmitterFn;
}

export interface CompactedConversation {
  processedConversation: ProcessedConversation;
  summary?: CompactionSummary;
  compactionTriggered: boolean;
  /** Token count before compaction (only set when compactionTriggered is true) */
  tokensBefore?: number;
  /** Token count after compaction (only set when compactionTriggered is true) */
  tokensAfter?: number;
  /** Number of rounds that were summarized or removed */
  summarizedRoundCount?: number;
}

// ---------------------------------------------------------------------------
// Programmatic extraction helpers
// ---------------------------------------------------------------------------

/**
 * Summarises a tool call's params object into a short human-readable string.
 * Keeps it under PARAMS_SUMMARY_MAX_LENGTH so the serialized summary stays compact.
 */
const summarizeParams = (params: Record<string, unknown>): string => {
  const raw = Object.entries(params)
    .map(([key, value]) => {
      if (typeof value === 'string') {
        return `${key}=${value}`;
      }
      if (Array.isArray(value)) {
        return `${key}=[${value.join(', ')}]`;
      }
      return `${key}=${JSON.stringify(value)}`;
    })
    .join(', ');

  if (raw.length <= PARAMS_SUMMARY_MAX_LENGTH) {
    return raw;
  }
  return `${raw.slice(0, PARAMS_SUMMARY_MAX_LENGTH)}…`;
};

/**
 * Walks conversation rounds and extracts deterministic summary fields:
 * - tool_calls_summary: list of tool calls with their params
 * - agent_actions: human-readable description of each tool call
 *
 * Entity extraction (e.g. index names) is delegated to the LLM via
 * structured output so new entity types can be added without code changes.
 */
export const extractProgrammaticSummary = (
  rounds: ProcessedConversationRound[]
): {
  tool_calls_summary: CompactionToolCallSummary[];
  agent_actions: string[];
} => {
  const toolCalls: CompactionToolCallSummary[] = [];
  const agentActions: string[] = [];

  for (const round of rounds) {
    for (const step of round.steps) {
      if (!isToolCallStep(step)) {
        continue;
      }

      const paramsSummary = summarizeParams(step.params);
      toolCalls.push({ tool_id: step.tool_id, params_summary: paramsSummary });
      agentActions.push(`Called ${step.tool_id}(${paramsSummary})`);
    }
  }

  return {
    tool_calls_summary: toolCalls,
    agent_actions: agentActions,
  };
};

// ---------------------------------------------------------------------------
// Main compaction pipeline
// ---------------------------------------------------------------------------

/**
 * Compaction pipeline with hybrid extraction:
 *
 * 1. Check whether compaction is needed (token threshold)
 * 2. Reuse an existing summary if it still fits
 * 3. Extract deterministic fields programmatically (tool calls, actions)
 * 4. Call the LLM for semantic fields (summary, intent, entities, outcomes, etc.)
 * 5. Merge both into CompactionStructuredData and persist
 * 6. Fall back to hard truncation if the result still exceeds the budget
 */
export const compactConversation = async ({
  processedConversation,
  chatModel,
  contextBudget,
  perRoundTokenCounts,
  existingSummary,
  logger,
  abortSignal,
  eventEmitter,
}: CompactConversationOptions): Promise<CompactedConversation> => {
  // Under threshold: apply existing summary if present (so the LLM sees
  // the compacted view) but don't report a new compaction event.
  if (!shouldTriggerCompaction(perRoundTokenCounts, contextBudget, existingSummary)) {
    if (existingSummary) {
      const compacted = applyExistingSummary(processedConversation, existingSummary);
      return {
        processedConversation: compacted,
        summary: existingSummary,
        compactionTriggered: false,
      };
    }
    return { processedConversation, compactionTriggered: false };
  }

  const rawTokens = sumTokens(perRoundTokenCounts);
  const effectiveTokens = existingSummary
    ? existingSummary.token_count +
      sumTokens(perRoundTokenCounts.slice(existingSummary.summarized_round_count))
    : rawTokens;
  logger.info(
    `Compaction triggered: ${effectiveTokens} effective tokens (${rawTokens} raw) exceeds threshold of ${contextBudget.triggerThreshold}`
  );

  // Emit compactionStarted before the LLM summarization call
  eventEmitter?.({
    type: ChatEventType.compactionStarted,
    data: { token_count_before: rawTokens },
  });

  // Generate a new summary covering all older rounds via LLM + programmatic extraction
  const summarizationResult = await summarizeOlderRounds(
    processedConversation,
    chatModel,
    contextBudget,
    logger,
    existingSummary,
    abortSignal
  );

  if (summarizationResult.summary) {
    // Remaining rounds are the suffix after the summarized prefix, so their counts
    // are perRoundTokenCounts sliced at summarized_round_count.
    const afterTokens =
      sumTokens(perRoundTokenCounts.slice(summarizationResult.summary.summarized_round_count)) +
      summarizationResult.summary.token_count;
    if (afterTokens <= contextBudget.historyBudget) {
      logger.debug(
        `Summarization sufficient: ${afterTokens} tokens (budget: ${contextBudget.historyBudget})`
      );

      eventEmitter?.({
        type: ChatEventType.compactionCompleted,
        data: {
          token_count_after: afterTokens,
          summarized_round_count: summarizationResult.summary.summarized_round_count,
        },
      });

      return {
        ...summarizationResult,
        compactionTriggered: true,
        tokensBefore: rawTokens,
        tokensAfter: afterTokens,
        summarizedRoundCount: summarizationResult.summary.summarized_round_count,
      };
    }
  }

  // Hard truncation fallback. When summarization produced a summary only the recent
  // (suffix) rounds remain, so truncate over their counts; otherwise the full set.
  const postSummaryCounts = summarizationResult.summary
    ? perRoundTokenCounts.slice(summarizationResult.summary.summarized_round_count)
    : perRoundTokenCounts;
  const truncation = applyHardTruncation(
    summarizationResult.processedConversation,
    postSummaryCounts,
    contextBudget
  );
  // Account for the summary tokens (if present) so the reported total is accurate.
  const truncatedTokens = truncation.tokens + (summarizationResult.summary?.token_count ?? 0);
  logger.debug('Applied hard truncation fallback');

  eventEmitter?.({
    type: ChatEventType.compactionCompleted,
    data: {
      token_count_after: truncatedTokens,
      summarized_round_count: summarizationResult.summary?.summarized_round_count ?? 0,
    },
  });

  return {
    processedConversation: truncation.conversation,
    summary: summarizationResult.summary,
    compactionTriggered: true,
    tokensBefore: rawTokens,
    tokensAfter: truncatedTokens,
    summarizedRoundCount: summarizationResult.summary?.summarized_round_count ?? 0,
  };
};

const sumTokens = (counts: number[]): number => counts.reduce((total, count) => total + count, 0);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const applyExistingSummary = (
  conversation: ProcessedConversation,
  summary: CompactionSummary
): ProcessedConversation => {
  return {
    ...conversation,
    previousRounds: conversation.previousRounds.slice(summary.summarized_round_count),
    compactionSummary: summary,
  };
};

/**
 * Hybrid summarization: extracts deterministic fields programmatically,
 * calls the LLM for semantic fields, then merges both.
 *
 * When an existing summary is provided, programmatic extraction still covers
 * all rounds being summarized (deterministic and cheap), but the LLM call only
 * processes rounds beyond the existing summary's coverage, injecting the prior
 * summary as context. This prevents re-processing already-summarized rounds and
 * avoids overflowing the summarizer's own context window.
 */
const summarizeOlderRounds = async (
  conversation: ProcessedConversation,
  chatModel: InferenceChatModel,
  budget: ContextBudget,
  logger: Logger,
  existingSummary?: CompactionSummary,
  abortSignal?: AbortSignal
): Promise<{ processedConversation: ProcessedConversation; summary?: CompactionSummary }> => {
  const { previousRounds } = conversation;
  const preserveCount = Math.min(PRESERVED_RECENT_ROUNDS, previousRounds.length);

  if (previousRounds.length <= preserveCount) {
    return { processedConversation: conversation };
  }

  const roundsToSummarize = previousRounds.slice(0, previousRounds.length - preserveCount);
  const recentRounds = previousRounds.slice(previousRounds.length - preserveCount);

  // Phase 1: programmatic extraction from all older rounds (deterministic, not expensive)
  const programmatic = extractProgrammaticSummary(roundsToSummarize);

  try {
    // Phase 2: LLM call for semantic fields and entity extraction.
    // Pass the existing summary so the LLM builds on it rather than re-processing
    // rounds it has already seen, and to avoid overflowing the summarizer's context.
    const llmOutput = await generateLlmSummary(
      conversation,
      roundsToSummarize,
      programmatic,
      chatModel,
      existingSummary,
      abortSignal
    );

    // Phase 3: merge into CompactionStructuredData
    const structuredData: CompactionStructuredData = {
      ...llmOutput,
      ...programmatic,
    };

    const summaryText = serializeCompactionSummary(structuredData);
    const summaryTokenCount = estimateTokens(summaryText);

    const summary: CompactionSummary = {
      summarized_round_count: roundsToSummarize.length,
      created_at: new Date().toISOString(),
      token_count: summaryTokenCount,
      structured_data: structuredData,
    };

    return {
      processedConversation: {
        ...conversation,
        previousRounds: recentRounds,
        compactionSummary: summary,
      },
      summary,
    };
  } catch (error) {
    logger.error(`Compaction summarization failed, falling through to truncation: ${error}`);
    return { processedConversation: conversation };
  }
};

/**
 * Calls the LLM with a focused schema containing only semantic fields.
 * The programmatic tool call list is injected into the prompt as context
 * so the LLM can reference it without needing to reproduce it.
 *
 * When an existing summary is provided, only the rounds beyond its coverage
 * are sent as raw history. The existing summary is injected as a prior context
 * block via convertPreviousRounds so the LLM can build on it without
 * re-processing already-summarized rounds.
 */
const generateLlmSummary = async (
  conversation: ProcessedConversation,
  roundsToSummarize: ProcessedConversationRound[],
  programmatic: {
    tool_calls_summary: CompactionToolCallSummary[];
    agent_actions: string[];
  },
  chatModel: InferenceChatModel,
  existingSummary?: CompactionSummary,
  abortSignal?: AbortSignal
): Promise<LlmCompactionOutput> => {
  // Only send rounds not already covered by the existing summary as raw history.
  // This avoids re-processing stale rounds and prevents the summarizer call
  // from overflowing the context window on second+ compactions.
  const alreadySummarizedCount = existingSummary?.summarized_round_count ?? 0;
  const newRounds = roundsToSummarize.slice(alreadySummarizedCount);

  const tempConversation: ProcessedConversation = {
    ...conversation,
    previousRounds: newRounds,
  };

  const historyMessages = await convertPreviousRounds({
    conversation: tempConversation,
    compactionSummary: existingSummary,
  });

  // Build a context block with the programmatically extracted tool calls
  const toolLines = programmatic.tool_calls_summary
    .map((tc) => `- ${tc.tool_id}(${tc.params_summary})`)
    .join('\n');
  const toolContext =
    programmatic.tool_calls_summary.length > 0
      ? `\n\nFor reference, here are the tool calls that were made (already captured separately):\n${toolLines}`
      : '';

  const messages: BaseMessageLike[] = [
    ['system', COMPACTION_SYSTEM_PROMPT],
    ...historyMessages,
    ['user', `Please generate a structured summary of this conversation history.${toolContext}`],
  ];

  const structuredModel = chatModel.withStructuredOutput(llmCompactionSchema, {
    name: 'compact_conversation',
  });

  return await structuredModel.invoke(messages, { signal: abortSignal });
};

/**
 * Drop oldest rounds one by one until the conversation fits within the history
 * budget, always preserving at least the most recent rounds. `perRoundCounts`
 * is index-aligned with `conversation.previousRounds`; truncation is O(n) via a
 * rolling total and a start index (no per-step re-estimation or array shifting).
 */
const applyHardTruncation = (
  conversation: ProcessedConversation,
  perRoundCounts: number[],
  budget: ContextBudget
): { conversation: ProcessedConversation; tokens: number } => {
  const { previousRounds } = conversation;
  let currentTokens = sumTokens(perRoundCounts);

  if (currentTokens <= budget.historyBudget) {
    return { conversation, tokens: currentTokens };
  }

  const minStart = previousRounds.length - PRESERVED_RECENT_ROUNDS;
  let start = 0;

  while (start < minStart && currentTokens > budget.historyBudget) {
    currentTokens -= perRoundCounts[start];
    start++;
  }

  return {
    conversation: { ...conversation, previousRounds: previousRounds.slice(start) },
    tokens: currentTokens,
  };
};
