/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { QueryClient } from '@kbn/react-query';
import type { Conversation } from '@kbn/agent-builder-common';
import {
  isAskUserQuestionStep,
  createAskUserQuestionStep,
} from '@kbn/agent-builder-common/chat/conversation';
import type { VersionedAttachment } from '@kbn/agent-builder-common/attachments';
import { AgentPromptType } from '@kbn/agent-builder-common/agents';
import type { AskUserQuestionPrompt } from '@kbn/agent-builder-common/agents';
import type { ConversationsService } from '../../../services/conversations';
import { queryKeys } from '../../query_keys';
import { createNewConversation, createNewRound } from '../../utils/new_conversation';
import { createConversationActions } from './use_conversation_actions';

const conversationId = 'conv-1';

const buildActions = () => {
  const queryClient = new QueryClient();
  const conversationsService = {} as unknown as ConversationsService;
  const actions = createConversationActions({
    conversationId,
    queryClient,
    conversationsService,
  });
  return { queryClient, actions };
};

const attachmentFixture = (current: number): VersionedAttachment[] => [
  {
    id: 'att-1',
    type: 'dashboard',
    current_version: current,
    versions: Array.from({ length: current }, (_, i) => ({
      version: i + 1,
      data: { revision: i + 1 },
      created_at: `2024-01-0${i + 1}T00:00:00.000Z`,
      content_hash: `hash-${i + 1}`,
    })),
  },
];

const promptId = 'prompt-1';
const questions = [
  { question: 'Choose one:', options: [{ label: 'A' }, { label: 'B' }], multi_select: false },
];
const answers = [{ choice: [0] }];
const askUserQuestionResponse = { answers };

const pendingPrompt: AskUserQuestionPrompt = {
  type: AgentPromptType.ask_user_question,
  id: promptId,
  questions,
};

describe('createConversationActions.setAskUserQuestionAnswers', () => {
  it('back-fills answers onto an existing AskUserQuestionStep (update-existing)', () => {
    const { queryClient, actions } = buildActions();
    const queryKey = queryKeys.conversations.byId(conversationId);
    const conversation = createNewConversation({ id: conversationId, agentId: 'agent-1' });
    conversation.rounds.push(
      createNewRound({
        userMessage: 'hello',
        steps: [createAskUserQuestionStep({ prompt_id: promptId, questions })],
      })
    );
    queryClient.setQueryData<Conversation>(queryKey, conversation);

    actions.setAskUserQuestionAnswers({ [promptId]: askUserQuestionResponse });

    const result = queryClient.getQueryData<Conversation>(queryKey);
    const step = result?.rounds.at(-1)?.steps.find(isAskUserQuestionStep);
    expect(step?.answers).toEqual(answers);
    expect(step?.prompt_id).toBe(promptId);
    expect(result?.rounds.at(-1)?.steps).toHaveLength(1);
  });

  it('reconstructs an AskUserQuestionStep from pending_prompts when no step exists (reconstruct-from-pending)', () => {
    const { queryClient, actions } = buildActions();
    const queryKey = queryKeys.conversations.byId(conversationId);
    const conversation = createNewConversation({ id: conversationId, agentId: 'agent-1' });
    conversation.rounds.push(createNewRound({ userMessage: 'hello' }));
    queryClient.setQueryData<Conversation>(queryKey, conversation);
    actions.addPendingPrompt({ prompt: pendingPrompt });

    actions.setAskUserQuestionAnswers({ [promptId]: askUserQuestionResponse });

    const result = queryClient.getQueryData<Conversation>(queryKey);
    const step = result?.rounds.at(-1)?.steps.find(isAskUserQuestionStep);
    expect(step).toBeDefined();
    expect(step?.prompt_id).toBe(promptId);
    expect(step?.answers).toEqual(answers);
  });

  it('silently drops answers when pending_prompts are cleared before setAskUserQuestionAnswers (ordering invariant)', () => {
    const { queryClient, actions } = buildActions();
    const queryKey = queryKeys.conversations.byId(conversationId);
    const conversation = createNewConversation({ id: conversationId, agentId: 'agent-1' });
    conversation.rounds.push(createNewRound({ userMessage: 'hello' }));
    queryClient.setQueryData<Conversation>(queryKey, conversation);
    actions.addPendingPrompt({ prompt: pendingPrompt });

    // Wrong order: clear before setting answers — the reconstruct branch cannot find the prompt
    actions.clearPendingPrompts();
    actions.setAskUserQuestionAnswers({ [promptId]: askUserQuestionResponse });

    const result = queryClient.getQueryData<Conversation>(queryKey);
    const step = result?.rounds.at(-1)?.steps.find(isAskUserQuestionStep);
    expect(step).toBeUndefined();
  });
});

describe('createConversationActions.setAttachments', () => {
  it('writes the attachments array onto the cached conversation', () => {
    const { queryClient, actions } = buildActions();
    const queryKey = queryKeys.conversations.byId(conversationId);
    queryClient.setQueryData<Conversation>(
      queryKey,
      createNewConversation({ id: conversationId, agentId: 'agent-1' })
    );

    const fresh = attachmentFixture(2);
    actions.setAttachments({ attachments: fresh });

    const conversation = queryClient.getQueryData<Conversation>(queryKey);
    expect(conversation?.attachments).toEqual(fresh);
  });

  it('replaces a previous attachments array (does not merge)', () => {
    const { queryClient, actions } = buildActions();
    const queryKey = queryKeys.conversations.byId(conversationId);
    queryClient.setQueryData<Conversation>(queryKey, {
      ...createNewConversation({ id: conversationId, agentId: 'agent-1' }),
      attachments: attachmentFixture(1),
    });

    const fresh = attachmentFixture(2);
    actions.setAttachments({ attachments: fresh });

    const conversation = queryClient.getQueryData<Conversation>(queryKey);
    expect(conversation?.attachments).toEqual(fresh);
    expect(conversation?.attachments?.[0].current_version).toBe(2);
  });

  it('no-ops when the conversation is not yet in the cache', () => {
    const { queryClient, actions } = buildActions();
    const queryKey = queryKeys.conversations.byId(conversationId);

    actions.setAttachments({ attachments: attachmentFixture(2) });

    expect(queryClient.getQueryData<Conversation>(queryKey)).toBeUndefined();
  });
});
