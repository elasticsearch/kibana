/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Subject } from 'rxjs';
import type { ChatEvent, ConversationRound } from '@kbn/agent-builder-common';
import { ChatEventType, ConversationRoundStatus } from '@kbn/agent-builder-common';
import type { VersionedAttachment } from '@kbn/agent-builder-common/attachments';
import type { ConversationActions } from '../conversation/use_conversation_actions';
import { subscribeToChatEvents } from './use_subscribe_to_chat_events';

const buildActionsMock = (): jest.Mocked<ConversationActions> =>
  ({
    invalidateConversation: jest.fn(),
    addOptimisticRound: jest.fn(),
    removeOptimisticRound: jest.fn(),
    clearLastRoundResponse: jest.fn(),
    addReasoningStep: jest.fn(),
    addToolCall: jest.fn(),
    setToolCallProgress: jest.fn(),
    setToolCallResult: jest.fn(),
    setAssistantMessage: jest.fn(),
    addAssistantMessageChunk: jest.fn(),
    setTimeToFirstToken: jest.fn(),
    addPendingPrompt: jest.fn(),
    clearPendingPrompts: jest.fn(),
    setAskUserQuestionAnswers: jest.fn(),
    onConversationCreated: jest.fn(),
    addBackgroundExecutionCompleteStep: jest.fn(),
    addOrUpdateTodosStep: jest.fn(),
    setAttachments: jest.fn(),
    addCompactionStep: jest.fn(),
    setCompactionStepComplete: jest.fn(),
    deleteConversation: jest.fn(),
    renameConversation: jest.fn(),
  } as unknown as jest.Mocked<ConversationActions>);

const buildRound = (): ConversationRound => ({
  id: 'round-1',
  status: ConversationRoundStatus.completed,
  input: { message: 'hi' },
  response: { message: 'done' },
  steps: [],
  started_at: '2024-01-01T00:00:00.000Z',
  time_to_first_token: 1,
  time_to_last_token: 2,
  model_usage: {
    connector_id: 'c',
    input_tokens: 0,
    output_tokens: 0,
    llm_calls: 0,
  },
});

const attachmentFixture: VersionedAttachment[] = [
  {
    id: 'att-1',
    type: 'dashboard',
    current_version: 2,
    versions: [
      {
        version: 1,
        data: { revision: 1 },
        created_at: '2024-01-01T00:00:00.000Z',
        content_hash: 'h1',
      },
      {
        version: 2,
        data: { revision: 2 },
        created_at: '2024-01-02T00:00:00.000Z',
        content_hash: 'h2',
      },
    ],
  },
];

describe('subscribeToChatEvents — roundComplete', () => {
  it('forwards canonical attachments to conversationActions.setAttachments', async () => {
    const events$ = new Subject<ChatEvent>();
    const conversationActions = buildActionsMock();

    const done = subscribeToChatEvents({
      events$,
      conversationActions,
      isAborted: () => false,
    });

    events$.next({
      type: ChatEventType.roundComplete,
      data: {
        round: buildRound(),
        attachments: attachmentFixture,
      },
    });
    events$.complete();

    await done;

    expect(conversationActions.setAttachments).toHaveBeenCalledTimes(1);
    expect(conversationActions.setAttachments).toHaveBeenCalledWith({
      attachments: attachmentFixture,
    });
  });

  it('does not call setAttachments when the event omits the attachments field', async () => {
    const events$ = new Subject<ChatEvent>();
    const conversationActions = buildActionsMock();

    const done = subscribeToChatEvents({
      events$,
      conversationActions,
      isAborted: () => false,
    });

    events$.next({
      type: ChatEventType.roundComplete,
      data: { round: buildRound() },
    });
    events$.complete();

    await done;

    expect(conversationActions.setAttachments).not.toHaveBeenCalled();
  });
});
