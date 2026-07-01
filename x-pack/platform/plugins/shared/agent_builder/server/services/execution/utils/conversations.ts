/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Observable } from 'rxjs';
import { of, forkJoin, switchMap } from 'rxjs';
import type {
  Conversation,
  ConversationAccessControl,
  RoundCompleteEvent,
  ConversationAction,
} from '@kbn/agent-builder-common';
import { getDefaultConversationAccessControl } from '@kbn/agent-builder-common';
import type { ConversationClient } from '../../conversation';
import { createConversationUpdatedEvent, createConversationCreatedEvent } from './events';

/**
 * Persist a new conversation and emit the corresponding event
 */
export const createConversation$ = ({
  conversation,
  conversationClient,
  title$,
  roundCompletedEvents$,
}: {
  conversation: Pick<Conversation, 'id' | 'agent_id' | 'access_control'>;
  conversationClient: ConversationClient;
  title$: Observable<string>;
  roundCompletedEvents$: Observable<RoundCompleteEvent>;
}) => {
  return forkJoin({
    title: title$,
    roundCompletedEvent: roundCompletedEvents$,
  }).pipe(
    switchMap(({ title, roundCompletedEvent }) => {
      return conversationClient.create({
        id: conversation.id,
        title,
        agent_id: conversation.agent_id,
        access_control: conversation.access_control,
        state: roundCompletedEvent.data.conversation_state,
        status: roundCompletedEvent.data.round.status,
        read: false,
        rounds: [roundCompletedEvent.data.round],
        ...(roundCompletedEvent.data.attachments
          ? { attachments: roundCompletedEvent.data.attachments }
          : {}),
        ...(roundCompletedEvent.data.workspace_id
          ? { workspace_id: roundCompletedEvent.data.workspace_id }
          : {}),
      });
    }),
    switchMap((createdConversation) => {
      return of(createConversationCreatedEvent(createdConversation));
    })
  );
};

/**
 * Update an existing conversation and emit the corresponding event
 */
export const updateConversation$ = ({
  conversationClient,
  conversation,
  title$,
  roundCompletedEvents$,
  action,
}: {
  conversation: Conversation;
  title$: Observable<string>;
  roundCompletedEvents$: Observable<RoundCompleteEvent>;
  conversationClient: ConversationClient;
  action?: ConversationAction;
}) => {
  return forkJoin({
    title: title$,
    roundCompletedEvent: roundCompletedEvents$,
  }).pipe(
    switchMap(({ title, roundCompletedEvent }) => {
      const { round, resumed = false, conversation_state } = roundCompletedEvent.data;
      // Replace last round when resumed (HITL flow), regenerate action is requested
      const shouldReplaceLastRound = resumed || action === 'regenerate';
      const updatedRound = shouldReplaceLastRound
        ? [...conversation.rounds.slice(0, -1), round]
        : [...conversation.rounds, round];

      // Only set workspace_id if it's new (once set it should not change).
      const newWorkspaceId =
        roundCompletedEvent.data.workspace_id && !conversation.workspace_id
          ? roundCompletedEvent.data.workspace_id
          : undefined;

      return conversationClient.update(
        {
          id: conversation.id,
          title,
          rounds: updatedRound,
          state: conversation_state,
          status: round.status,
          read: false,
          ...(roundCompletedEvent.data.attachments !== undefined
            ? { attachments: roundCompletedEvent.data.attachments }
            : {}),
          ...(newWorkspaceId ? { workspace_id: newWorkspaceId } : {}),
        },
        { access: 'converse' }
      );
    }),
    switchMap((updatedConversation) => {
      return of(createConversationUpdatedEvent(updatedConversation));
    })
  );
};

/**
 * Check if a conversation exists
 */
export const conversationExists = async ({
  conversationId,
  conversationClient,
}: {
  conversationId: string;
  conversationClient: ConversationClient;
}): Promise<boolean> => {
  return conversationClient.exists(conversationId);
};

export type ConversationOperation = 'CREATE' | 'UPDATE';

export type ConversationWithOperation = Conversation & { operation: ConversationOperation };

/**
 * Get a conversation by ID, or create a placeholder for new conversations.
 * Determines the operation type (CREATE or UPDATE) based on conversationId presence.
 * Note: Validation and manipulation for regenerate is handled in runDefaultAgentMode.
 */
export const getConversation = async ({
  agentId,
  conversationId,
  autoCreateConversationWithId = false,
  conversationClient,
  accessControl,
}: {
  agentId: string;
  conversationId: string | undefined;
  autoCreateConversationWithId?: boolean;
  conversationClient: ConversationClient;
  accessControl?: ConversationAccessControl;
}): Promise<ConversationWithOperation> => {
  // Case 1: No conversation ID - create new with placeholder
  if (!conversationId) {
    return {
      ...placeholderConversation({ agentId, accessControl }),
      operation: 'CREATE',
    };
  }

  // Case 2: Conversation ID specified and autoCreate is false - update existing
  if (!autoCreateConversationWithId) {
    return {
      ...(await conversationClient.get(conversationId)),
      operation: 'UPDATE',
    };
  }

  // Case 3: Conversation ID specified and autoCreate is true - check if exists
  const exists = await conversationExists({ conversationId, conversationClient });
  if (exists) {
    return {
      ...(await conversationClient.get(conversationId)),
      operation: 'UPDATE',
    };
  } else {
    return {
      ...placeholderConversation({ conversationId, agentId, accessControl }),
      operation: 'CREATE',
    };
  }
};

export const placeholderConversation = ({
  agentId,
  conversationId,
  accessControl,
}: {
  agentId: string;
  conversationId?: string;
  accessControl?: ConversationAccessControl;
}): Conversation => {
  return {
    id: conversationId ?? uuidv4(),
    title: 'New conversation',
    agent_id: agentId,
    access_control: accessControl ?? getDefaultConversationAccessControl(),
    rounds: [],
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    user: {
      id: 'unknown',
      username: 'unknown',
    },
  };
};
