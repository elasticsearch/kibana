/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GetResponse } from '@elastic/elasticsearch/lib/api/types';
import type {
  Conversation,
  ConversationRound,
  ConversationRoundStep,
  ConversationWithoutRounds,
  ToolResult,
  UserIdAndName,
} from '@kbn/agent-builder-common';
import type { AttachmentVersionRef } from '@kbn/agent-builder-common/attachments';
import type { RoundState } from '@kbn/agent-builder-common/chat/round_state';
import {
  ConversationRoundStatus,
  ConversationRoundStepType,
  ToolOrigin,
  ToolResultType,
  getDefaultConversationAccessControl,
} from '@kbn/agent-builder-common';
import { isInternalTool } from '@kbn/agent-builder-common/tools';
import { getToolResultId } from '@kbn/agent-builder-server';
import type {
  ConversationCreateRequest,
  ConversationUpdateRequest,
  LegacyAgentStateFields,
  PersistentConversationRound,
  PersistentConversationRoundStep,
} from './types';
import type { ConversationProperties } from './storage';
import {
  createAttachmentRefs,
  migrateRoundAttachments,
  needsMigration,
  applyAttachmentRefsToRounds,
} from './migrate_attachments';

export type Document = Pick<
  GetResponse<ConversationProperties>,
  '_source' | '_id' | '_seq_no' | '_primary_term'
>;

const convertBaseFromEs = (document: Document) => {
  if (!document._source) {
    throw new Error('No source found on get conversation response');
  }

  return {
    id: document._id,
    agent_id: document._source.agent_id,
    user: {
      id: document._source.user_id,
      username: document._source.user_name,
    },
    title: document._source.title,
    created_at: document._source.created_at,
    updated_at: document._source.updated_at,
    status: document._source.status,
    read: document._source.read,
    access_control: document._source.access_control ?? getDefaultConversationAccessControl(),
    ...(document._source.workspace_id ? { workspace_id: document._source.workspace_id } : {}),
  };
};

function serializeStepResults(rounds: ConversationRound[]): PersistentConversationRound[] {
  return rounds.map<PersistentConversationRound>((round) => ({
    ...round,
    steps: round.steps.map<PersistentConversationRoundStep>((step) => {
      if (step.type === ConversationRoundStepType.toolCall) {
        return {
          ...step,
          results: JSON.stringify(step.results),
        };
      } else {
        return step;
      }
    }),
  }));
}

/**
 * Migrates legacy tool result types to their current names.
 * This handles backward compatibility when tool result types are renamed.
 */
const migrateToolResultType = (result: ToolResult): ToolResult => {
  // Migration: 'tabular_data' was renamed to 'esql_results'
  if (result.type === 'tabular_data') {
    return {
      ...result,
      type: ToolResultType.esqlResults,
    };
  }
  return result;
};

function deserializeStepResults(rounds: PersistentConversationRound[]): ConversationRound[] {
  return rounds.map<ConversationRound>((round) => {
    // Migration: pending_prompt (singular) -> pending_prompts (array)
    const { pending_prompt: legacyPendingPrompt, ...roundWithoutLegacy } = round;
    const pendingPrompts =
      round.pending_prompts ?? (legacyPendingPrompt ? [legacyPendingPrompt] : undefined);

    return {
      ...roundWithoutLegacy,
      pending_prompts: pendingPrompts,
      state: round.state ? migrateRoundState(round.state) : undefined,
      status: round.status ?? ConversationRoundStatus.completed,
      started_at: round.started_at ?? new Date(0).toISOString(),
      time_to_first_token: round.time_to_first_token ?? 0,
      time_to_last_token: round.time_to_last_token ?? 0,
      model_usage: round.model_usage ?? {
        llm_calls: 0,
        input_tokens: 0,
        output_tokens: 0,
      },
      steps: round.steps.map<ConversationRoundStep>((step) => {
        if (step.type === ConversationRoundStepType.toolCall) {
          return {
            ...step,
            results: (JSON.parse(step.results) as ToolResult[]).map((result) => {
              return migrateToolResultType({
                ...result,
                tool_result_id: result.tool_result_id ?? getToolResultId(),
              });
            }),
            progression: step.progression ?? [],
            tool_origin: step.tool_origin ?? inferToolOrigin(step.tool_id),
          };
        } else {
          return step;
        }
      }),
    };
  });
}

/**
 * Migrates legacy RoundState format.
 * v1 stored a single `node`; current format uses `nodes` (array).
 */
function migrateRoundState(state: RoundState & { agent: LegacyAgentStateFields }): RoundState {
  const { agent } = state;
  if (agent.nodes) {
    return state;
  }
  if (agent.node) {
    const { node, ...agentWithoutLegacy } = agent;
    return {
      ...state,
      agent: {
        ...agentWithoutLegacy,
        nodes: [node],
      },
    };
  }
  return state;
}

const inferToolOrigin = (toolId: string): ToolOrigin | undefined => {
  // Legacy rounds do not reliably differentiate registry vs inline tools.
  // Only infer internal tools; leave others undefined for UI-side fallback.
  if (isInternalTool(toolId)) {
    return ToolOrigin.internal;
  }
  return undefined;
};

export const fromEs = (document: Document): Conversation => {
  const base = convertBaseFromEs(document);

  // Migration: prefer legacy 'rounds' field, fallback to new 'conversation_rounds' field
  const rawRounds = document._source!.rounds ?? document._source!.conversation_rounds;
  const deserializedRounds = deserializeStepResults(rawRounds);

  const existingAttachments = document._source!.attachments;
  const hasLegacyRoundAttachments = needsMigration(false, deserializedRounds);
  const attachmentsForRefs =
    existingAttachments && existingAttachments.length > 0
      ? existingAttachments
      : hasLegacyRoundAttachments
      ? migrateRoundAttachments(deserializedRounds)
      : [];

  const refsByRound =
    attachmentsForRefs.length > 0
      ? createAttachmentRefs(deserializedRounds, attachmentsForRefs)
      : new Map<number, AttachmentVersionRef[]>();

  const roundsWithRefs = applyAttachmentRefsToRounds(deserializedRounds, refsByRound);

  if (existingAttachments && existingAttachments.length > 0) {
    return {
      ...base,
      rounds: roundsWithRefs,
      attachments: existingAttachments,
      ...(document._source!.state && { state: document._source!.state }),
    };
  }

  if (hasLegacyRoundAttachments) {
    return {
      ...base,
      rounds: roundsWithRefs,
      ...(attachmentsForRefs.length > 0 && { attachments: attachmentsForRefs }),
      ...(document._source!.state && { state: document._source!.state }),
    };
  }

  return {
    ...base,
    rounds: roundsWithRefs,
    ...(document._source!.state && { state: document._source!.state }),
  };
};

export const fromEsWithoutRounds = (document: Document): ConversationWithoutRounds => {
  return convertBaseFromEs(document);
};

export const toEs = (conversation: Conversation, space: string): ConversationProperties => {
  return {
    agent_id: conversation.agent_id,
    user_id: conversation.user.id,
    user_name: conversation.user.username,
    space,
    title: conversation.title,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
    // Explicitly omit rounds to ensure migration
    rounds: undefined,
    conversation_rounds: serializeStepResults(conversation.rounds),
    attachments: conversation.attachments ?? [],
    state: conversation.state,
    status: conversation.status,
    read: conversation.read,
    access_control: conversation.access_control ?? getDefaultConversationAccessControl(),
    ...(conversation.workspace_id ? { workspace_id: conversation.workspace_id } : {}),
  };
};

export const updateConversation = ({
  conversation,
  update,
  space,
  updateDate,
}: {
  conversation: Conversation;
  update: ConversationUpdateRequest;
  space: string;
  updateDate: Date;
}) => {
  const updated = {
    ...conversation,
    ...update,
    space,
    updated_at: updateDate.toISOString(),
  };

  return updated;
};

export const createRequestToEs = ({
  conversation,
  space,
  currentUser,
  creationDate,
}: {
  conversation: ConversationCreateRequest;
  currentUser: UserIdAndName;
  creationDate: Date;
  space: string;
}): ConversationProperties => {
  return {
    agent_id: conversation.agent_id,
    user_id: currentUser.id,
    user_name: currentUser.username,
    space,
    title: conversation.title,
    created_at: creationDate.toISOString(),
    updated_at: creationDate.toISOString(),
    conversation_rounds: serializeStepResults(conversation.rounds),
    attachments: conversation.attachments ?? [],
    state: conversation.state,
    status: conversation.status,
    read: false,
    access_control: conversation.access_control ?? getDefaultConversationAccessControl(),
    ...(conversation.workspace_id ? { workspace_id: conversation.workspace_id } : {}),
  };
};
