/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UserIdAndName } from '@kbn/agent-builder-common';
import { ConversationAccessControlMode } from '@kbn/agent-builder-common';
import type { ConversationProperties } from '../client/storage';

export type ConversationAccess = 'converse' | 'owner';

export const isConversationOwner = ({
  conversation,
  user,
}: {
  conversation: Pick<ConversationProperties, 'user_id' | 'user_name'>;
  user: UserIdAndName;
}): boolean => {
  if (conversation.user_id !== undefined && user.id !== undefined) {
    return conversation.user_id === user.id;
  }

  return conversation.user_name === user.username;
};

const isPublicConversation = ({
  conversation,
}: {
  conversation: Pick<ConversationProperties, 'access_control'>;
}): boolean => {
  return conversation.access_control?.access_mode === ConversationAccessControlMode.Public;
};

export const hasConversationConverseAccess = ({
  conversation,
  user,
}: {
  conversation: Pick<ConversationProperties, 'user_id' | 'user_name' | 'access_control'>;
  user: UserIdAndName;
}): boolean => {
  if (isConversationOwner({ conversation, user })) {
    return true;
  }

  return isPublicConversation({ conversation });
};

export const hasConversationOwnerAccess = ({
  conversation,
  user,
}: {
  conversation: Pick<ConversationProperties, 'user_id' | 'user_name' | 'access_control'>;
  user: UserIdAndName;
}): boolean => isConversationOwner({ conversation, user });
