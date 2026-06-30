/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import type { QueryClient } from '@kbn/react-query';
import produce, { type Draft } from 'immer';
import type {
  ConversationRound,
  ReasoningStep,
  ToolCallProgress,
  ToolCallStep,
  Conversation,
  CompactionStep,
  BackgroundAgentCompleteStep,
  TodosStep,
} from '@kbn/agent-builder-common';
import {
  isToolCallStep,
  isCompactionStep,
  findTodosStep,
  ConversationRoundStatus,
  ConversationRoundStepType,
  carriedOverTodos,
} from '@kbn/agent-builder-common';
import type { TodoItem } from '@kbn/agent-builder-common/chat/conversation';
import {
  createAskUserQuestionStep,
  isAskUserQuestionStep,
} from '@kbn/agent-builder-common/chat/conversation';
import type { PromptRequest, PromptResponse } from '@kbn/agent-builder-common/agents';
import {
  isAskUserQuestionPrompt,
  isAskUserQuestionPromptResponse,
} from '@kbn/agent-builder-common/agents';
import type { ToolResult } from '@kbn/agent-builder-common/tools/tool_result';
import type { AttachmentInput, VersionedAttachment } from '@kbn/agent-builder-common/attachments';
import type { ConversationsService } from '../../../services/conversations';
import { queryKeys } from '../../query_keys';
import { buildOptimisticAttachments } from '../../utils/build_optimistic_attachments';
import { patchConversationList } from '../../utils/conversation_sidebar_list_cache';
import { createNewConversation, createNewRound } from '../../utils/new_conversation';

export interface ConversationActions {
  invalidateConversation: () => void;
  addOptimisticRound: ({
    userMessage,
    attachments,
    agentId,
  }: {
    userMessage: string;
    attachments?: AttachmentInput[];
    agentId: string;
  }) => Promise<void>;
  removeOptimisticRound: () => void;
  clearLastRoundResponse: () => void;
  addReasoningStep: ({ step }: { step: ReasoningStep }) => void;
  addToolCall: ({ step }: { step: ToolCallStep }) => void;
  setToolCallProgress: ({
    progress,
    toolCallId,
  }: {
    progress: ToolCallProgress;
    toolCallId: string;
  }) => void;
  setToolCallResult: ({
    results,
    toolCallId,
  }: {
    results: ToolResult[];
    toolCallId: string;
  }) => void;
  setAssistantMessage: ({ assistantMessage }: { assistantMessage: string }) => void;
  addAssistantMessageChunk: ({ messageChunk }: { messageChunk: string }) => void;
  clearAssistantMessage: () => void;
  setTimeToFirstToken: ({ timeToFirstToken }: { timeToFirstToken: number }) => void;
  addPendingPrompt: ({ prompt }: { prompt: PromptRequest }) => void;
  clearPendingPrompts: () => void;
  setAskUserQuestionAnswers: (prompts: Record<string, PromptResponse>) => void;
  onConversationCreated: ({ title }: { title: string }) => void;
  addBackgroundExecutionCompleteStep: ({ step }: { step: BackgroundAgentCompleteStep }) => void;
  addOrUpdateTodosStep: ({ todos }: { todos: TodoItem[] }) => void;
  setAttachments: ({ attachments }: { attachments: VersionedAttachment[] }) => void;
  addCompactionStep: ({ tokenCountBefore }: { tokenCountBefore: number }) => void;
  setCompactionStepComplete: ({
    tokenCountAfter,
    summarizedRoundCount,
  }: {
    tokenCountAfter: number;
    summarizedRoundCount: number;
  }) => void;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  onRoundComplete: (conversationRound: ConversationRound) => void;
}

interface UseConversationActionsParams {
  conversationId?: string;
  queryClient: QueryClient;
  conversationsService: ConversationsService;
  onDeleteConversation?: (params: { id: string; isCurrentConversation: boolean }) => void;
}

export const createConversationActions = ({
  conversationId,
  queryClient,
  conversationsService,
  onDeleteConversation,
}: UseConversationActionsParams): ConversationActions => {
  const queryKey = queryKeys.conversations.byId(conversationId ?? '');
  const setConversation = (updater: (conversation?: Conversation) => Conversation) => {
    queryClient.setQueryData<Conversation>(queryKey, updater);
  };
  const setCurrentRound = (updater: (conversationRound: Draft<ConversationRound>) => void) => {
    setConversation(
      produce((draft) => {
        const round = draft?.rounds?.at(-1);
        if (round) {
          updater(round);
        }
      })
    );
  };

  return {
    invalidateConversation: () => {
      // Only this conversation's byId cache. The streamed chunks are best-effort writes;
      // a server refetch produces canonical state. We deliberately do NOT prefix-invalidate
      // `['conversations']` — that would also refetch the sidebar list, clobbering any
      // concurrent optimistic rows for other in-flight new conversations the server hasn't
      // persisted yet.
      queryClient.invalidateQueries({ queryKey });
    },

    addOptimisticRound: async ({
      userMessage,
      attachments,
      agentId,
    }: {
      userMessage: string;
      attachments?: AttachmentInput[];
      agentId: string;
    }) => {
      if (!conversationId) {
        return;
      }
      // Cancel any in-flight refetch on this conversation's query before mutating
      // the cache. After a previous successful stream, the mutation's finally block
      // calls invalidateConversation() + clearActiveStream(), which opens the
      // useConversation gate and triggers a GET refetch. If that refetch is still
      // in flight when we write the optimistic round, its response will overwrite
      // our write — and the round will then be erroneously popped by
      // removeOptimisticRound() if this stream errors.
      await queryClient.cancelQueries({ queryKey });
      setConversation(
        produce((draft) => {
          const current = queryClient.getQueryData<Conversation>(queryKey);
          const { fallbackAttachments, attachmentRefs } = buildOptimisticAttachments({
            attachments,
            conversationAttachments: current?.attachments,
          });

          const prevTodosStep = findTodosStep(draft?.rounds?.at(-1)?.steps);
          const carryoverTodos = carriedOverTodos(prevTodosStep?.todos);

          const nextRound = createNewRound({
            userMessage,
            attachments: fallbackAttachments,
            steps: carryoverTodos
              ? [
                  {
                    type: ConversationRoundStepType.updateTodos,
                    todos: carryoverTodos,
                    carried_over: true,
                  },
                ]
              : [],
          });
          if (attachmentRefs.length) {
            nextRound.input.attachment_refs = attachmentRefs;
          }

          if (!draft) {
            const newConversation = createNewConversation({ id: conversationId, agentId });
            newConversation.rounds.push(nextRound);
            return newConversation;
          }

          draft.rounds.push(nextRound);
        })
      );
    },
    removeOptimisticRound: () => {
      setConversation(
        produce((draft) => {
          draft?.rounds?.pop();
        })
      );
    },
    clearLastRoundResponse: () => {
      setCurrentRound((round) => {
        round.response.message = '';
        round.steps = [];
        round.status = ConversationRoundStatus.inProgress;
      });
    },
    addReasoningStep: ({ step }: { step: ReasoningStep }) => {
      setCurrentRound((round) => {
        round.steps.push(step);
      });
    },
    addToolCall: ({ step }: { step: ToolCallStep }) => {
      setCurrentRound((round) => {
        round.steps.push(step);
      });
    },
    setToolCallProgress: ({
      progress,
      toolCallId,
    }: {
      progress: ToolCallProgress;
      toolCallId: string;
    }) => {
      setCurrentRound((round) => {
        const step = round.steps.filter(isToolCallStep).find((s) => s.tool_call_id === toolCallId);
        if (step) {
          if (!step.progression) {
            step.progression = [];
          }
          step.progression.push(progress);
        }
      });
    },
    setToolCallResult: ({ results, toolCallId }: { results: ToolResult[]; toolCallId: string }) => {
      setCurrentRound((round) => {
        const step = round.steps.filter(isToolCallStep).find((s) => s.tool_call_id === toolCallId);
        if (step) {
          step.results = results;
        }
      });
    },
    addBackgroundExecutionCompleteStep: ({ step }: { step: BackgroundAgentCompleteStep }) => {
      setCurrentRound((round) => {
        round.steps.push(step);
      });
    },
    addOrUpdateTodosStep: ({ todos }: { todos: TodoItem[] }) => {
      setCurrentRound((round) => {
        const existing = findTodosStep(round.steps);
        if (existing) {
          existing.todos = todos;
          existing.carried_over = false;
        } else {
          const step: TodosStep = { type: ConversationRoundStepType.updateTodos, todos };
          round.steps.push(step);
        }
      });
    },
    setAttachments: ({ attachments }: { attachments: VersionedAttachment[] }) => {
      setConversation(
        produce((draft) => {
          if (draft) {
            draft.attachments = attachments;
          }
        })
      );
    },
    addCompactionStep: ({ tokenCountBefore }: { tokenCountBefore: number }) => {
      setCurrentRound((round) => {
        const step: CompactionStep = {
          type: ConversationRoundStepType.compaction,
          summarized_round_count: 0,
          token_count_before: tokenCountBefore,
          token_count_after: 0,
        };
        round.steps.push(step);
      });
    },
    setCompactionStepComplete: ({
      tokenCountAfter,
      summarizedRoundCount,
    }: {
      tokenCountAfter: number;
      summarizedRoundCount: number;
    }) => {
      setCurrentRound((round) => {
        const step = round.steps.find(isCompactionStep);
        if (step) {
          step.token_count_after = tokenCountAfter;
          step.summarized_round_count = summarizedRoundCount;
        }
      });
    },
    setAssistantMessage: ({ assistantMessage }: { assistantMessage: string }) => {
      setCurrentRound((round) => {
        round.response.message = assistantMessage;
      });
    },
    addAssistantMessageChunk: ({ messageChunk }: { messageChunk: string }) => {
      setCurrentRound((round) => {
        round.response.message += messageChunk;
      });
    },
    clearAssistantMessage: () => {
      setCurrentRound((round) => {
        round.response.message = '';
      });
    },
    setTimeToFirstToken: ({ timeToFirstToken }: { timeToFirstToken: number }) => {
      setCurrentRound((round) => {
        round.time_to_first_token = timeToFirstToken;
      });
    },
    addPendingPrompt: ({ prompt }: { prompt: PromptRequest }) => {
      setCurrentRound((round) => {
        if (!round.pending_prompts) {
          round.pending_prompts = [];
        }
        round.pending_prompts.push(prompt);
        round.status = ConversationRoundStatus.awaitingPrompt;
      });
    },
    clearPendingPrompts: () => {
      setCurrentRound((round) => {
        round.pending_prompts = undefined;
        round.status = ConversationRoundStatus.inProgress;
      });
    },
    setAskUserQuestionAnswers: (prompts: Record<string, PromptResponse>) => {
      setCurrentRound((round) => {
        for (const [promptId, response] of Object.entries(prompts)) {
          if (!isAskUserQuestionPromptResponse(response)) continue;
          const existing = round.steps.find(
            (s) => isAskUserQuestionStep(s) && s.prompt_id === promptId
          );
          if (existing && isAskUserQuestionStep(existing)) {
            existing.answers = response.answers;
          } else {
            const pendingPrompt = round.pending_prompts?.find(
              (p) => isAskUserQuestionPrompt(p) && p.id === promptId
            );
            if (pendingPrompt && isAskUserQuestionPrompt(pendingPrompt)) {
              round.steps.push(
                createAskUserQuestionStep({
                  prompt_id: promptId,
                  questions: pendingPrompt.questions,
                  answers: response.answers,
                })
              );
            }
          }
        }
      });
    },
    onConversationCreated: ({ title }: { title: string }) => {
      setConversation(
        produce((draft) => {
          if (draft) {
            draft.title = title;
          }
        })
      );
      // Patch the optimistic sidebar list row with the server-generated title (it was
      // inserted with a placeholder by `insertSidebarConversationListRow`).
      if (conversationId) {
        const conversation = queryClient.getQueryData<Conversation>(queryKey);
        if (conversation?.agent_id) {
          patchConversationList({
            queryClient,
            agentId: conversation.agent_id,
            conversationId,
            values: { title },
          });
        }
      }
    },
    deleteConversation: async (id: string) => {
      await conversationsService.delete({ conversationId: id });

      // Check if we're deleting the current conversation
      const isCurrentConversation = conversationId === id;

      queryClient.removeQueries({ queryKey: queryKeys.conversations.byId(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });

      // Call provider-specific callback if provided
      if (onDeleteConversation) {
        onDeleteConversation({ id, isCurrentConversation });
      }
    },
    onRoundComplete: (round: ConversationRound) => {
      const conversation = queryClient.getQueryData<Conversation>(queryKey);
      if (conversation?.agent_id) {
        patchConversationList({
          queryClient,
          agentId: conversation.agent_id,
          conversationId: conversation.id,
          values: { status: round.status, read: false, updated_at: new Date().toISOString() },
        });
      }
    },
    renameConversation: async (id: string, title: string) => {
      await conversationsService.rename({ conversationId: id, title });

      // Update the conversation in cache if it exists
      const conversationQueryKey = queryKeys.conversations.byId(id);
      const currentConversation = queryClient.getQueryData<Conversation>(conversationQueryKey);
      if (currentConversation) {
        queryClient.setQueryData<Conversation>(
          conversationQueryKey,
          produce(currentConversation, (draft) => {
            draft.title = title;
          })
        );
      }

      // Invalidate conversation list to get updated data from server
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
  };
};

export const useConversationActions = ({
  conversationId,
  queryClient,
  conversationsService,
  onDeleteConversation,
}: UseConversationActionsParams): ConversationActions => {
  const conversationActions = useMemo(
    () =>
      createConversationActions({
        conversationId,
        queryClient,
        conversationsService,
        onDeleteConversation,
      }),
    [conversationId, queryClient, conversationsService, onDeleteConversation]
  );

  return conversationActions;
};
