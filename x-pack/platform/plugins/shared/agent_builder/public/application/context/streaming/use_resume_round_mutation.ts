/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation, useQueryClient } from '@kbn/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { toToolMetadata } from '@kbn/agent-builder-browser/tools/browser_api_tool';
import type { BrowserApiToolDefinition } from '@kbn/agent-builder-browser/tools/browser_api_tool';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { Conversation, ConversationRoundStep } from '@kbn/agent-builder-common';
import type { PromptResponse } from '@kbn/agent-builder-common/agents';
import { useAgentBuilderServices } from '../../hooks/use_agent_builder_service';
import { mutationKeys } from '../../mutation_keys';
import { queryKeys } from '../../query_keys';
import { subscribeToChatEvents } from './use_subscribe_to_chat_events';
import { BrowserToolExecutor } from '../../services/browser_tool_executor';
import { createConversationActions } from '../conversation/use_conversation_actions';

export interface ResumeRoundVars {
  prompts: Record<string, PromptResponse>;
  conversationId: string;
  agentId: string;
  connectorId?: string;
  browserApiTools?: Array<BrowserApiToolDefinition<any>>;
}

export interface ResumeRoundMutationBindings {
  setError: (conversationId: string, error: unknown, errorSteps: ConversationRoundStep[]) => void;
  clearActiveStream: (conversationId: string) => void;
}

type UseResumeRoundMutationProps = ResumeRoundMutationBindings;

/**
 * Resume mutation, used after a HITL pause when the user clicks Approve / Cancel on a
 * `ConfirmationPrompt`. Same single-scope `mutationFn` shape as the send mutation.
 */
export const useResumeRoundMutation = ({
  setError,
  clearActiveStream,
}: UseResumeRoundMutationProps) => {
  const { chatService, conversationsService } = useAgentBuilderServices();
  const { services } = useKibana();
  const queryClient = useQueryClient();
  // One controller + executionId per in-flight conversation. Concurrent streams need
  // independent cancel; the executionId is what the abort endpoint uses to stop server-side.
  // `useResumeRoundMutation` is called exactly once — by the `StreamingProvider`.
  const controllersRef = useRef<Map<string, { controller: AbortController; executionId: string }>>(
    new Map()
  );

  const browserToolExecutor = useMemo(() => {
    return new BrowserToolExecutor(services.notifications?.toasts);
  }, [services.notifications?.toasts]);

  const { mutate, isLoading } = useMutation({
    mutationKey: mutationKeys.resumeRound,
    mutationFn: async (vars: ResumeRoundVars) => {
      const streamActions = createConversationActions({
        conversationId: vars.conversationId,
        queryClient,
        conversationsService,
      });

      const previous = controllersRef.current.get(vars.conversationId);
      if (previous) {
        chatService.abort(previous.executionId).catch(() => {});
        previous.controller.abort();
      }
      const controller = new AbortController();
      const executionId = uuidv4();
      controllersRef.current.set(vars.conversationId, { controller, executionId });

      // Optimistically populate ask_user_question step answers before clearing the prompt —
      // pending_prompts is needed to reconstruct the step, so this must come first.
      streamActions.setAskUserQuestionAnswers(vars.prompts);
      // Drop pending prompts from the round — the user has answered, the round is back in progress.
      streamActions.clearPendingPrompts();

      let succeeded = false;
      try {
        const browserApiToolsMetadata = vars.browserApiTools?.map(toToolMetadata);

        const events$ = chatService.resume({
          signal: controller.signal,
          executionId,
          prompts: vars.prompts,
          conversationId: vars.conversationId,
          agentId: vars.agentId,
          connectorId: vars.connectorId,
          browserApiTools: browserApiToolsMetadata,
        });

        await subscribeToChatEvents({
          events$,
          conversationActions: streamActions,
          browserApiTools: vars.browserApiTools,
          browserToolExecutor,
          isAborted: () => controller.signal.aborted,
        });
        succeeded = true;
      } catch (err) {
        // Snapshot the failing round's accumulated steps from the cache so the
        // error panel shows the steps that actually ran during this round.
        const cached = queryClient.getQueryData<Conversation>(
          queryKeys.conversations.byId(vars.conversationId)
        );
        const inProgressSteps = cached?.rounds?.at(-1)?.steps ?? [];
        setError(vars.conversationId, err, inProgressSteps);
        throw err;
      } finally {
        // Only invalidate on success — see use_send_message_mutation.ts for rationale.
        if (succeeded) {
          streamActions.invalidateConversation();
        }
        clearActiveStream(vars.conversationId);
        if (controllersRef.current.get(vars.conversationId)?.controller === controller) {
          controllersRef.current.delete(vars.conversationId);
        }
      }
    },
  });

  const cancel = useCallback(
    (conversationId: string) => {
      const entry = controllersRef.current.get(conversationId);
      if (entry) {
        chatService.abort(entry.executionId).catch(() => {});
        entry.controller.abort();
      }
    },
    [chatService]
  );

  const cancelAll = useCallback(() => {
    for (const { controller, executionId } of controllersRef.current.values()) {
      chatService.abort(executionId).catch(() => {});
      controller.abort();
    }
  }, [chatService]);

  return {
    mutate,
    isLoading,
    cancel,
    cancelAll,
  };
};
