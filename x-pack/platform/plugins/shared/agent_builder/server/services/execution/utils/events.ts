/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ConversationCreatedEvent,
  ConversationUpdatedEvent,
  Conversation,
  ConversationIdSetEvent,
} from '@kbn/agent-builder-common';
import { ChatEventType, getDefaultConversationAccessControl } from '@kbn/agent-builder-common';

export const createConversationCreatedEvent = (
  conversation: Conversation
): ConversationCreatedEvent => {
  return {
    type: ChatEventType.conversationCreated,
    data: {
      conversation_id: conversation.id,
      title: conversation.title,
      access_control: conversation.access_control ?? getDefaultConversationAccessControl(),
    },
  };
};

export const createConversationUpdatedEvent = (
  conversation: Conversation
): ConversationUpdatedEvent => {
  return {
    type: ChatEventType.conversationUpdated,
    data: {
      conversation_id: conversation.id,
      title: conversation.title,
      access_control: conversation.access_control ?? getDefaultConversationAccessControl(),
    },
  };
};

export const createConversationIdSetEvent = (conversationId: string): ConversationIdSetEvent => {
  return {
    type: ChatEventType.conversationIdSet,
    data: {
      conversation_id: conversationId,
    },
  };
};
