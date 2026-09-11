/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { UserMessageEvent } from '@kbn/agent-builder-common/chat/timeline_events';
import type { ConversationRoundAuthor } from '@kbn/agent-builder-common';
import { useConversation } from '../../../../hooks/use_conversation';
import { RoundInput } from '../../conversation_rounds/round_input';

interface UserTurnProps {
  event: UserMessageEvent;
  /** Just sent and not persisted yet, so it has no author attribution - resolved via `isPendingCurrentRound`. */
  isPending?: boolean;
}

const toRoundAuthor = (actor: UserMessageEvent['actor']): ConversationRoundAuthor => ({
  id: actor.id,
  username: actor.username,
  full_name: actor.full_name,
});

export const UserTurn: React.FC<UserTurnProps> = ({ event, isPending = false }) => {
  const { conversation } = useConversation();

  return (
    <RoundInput
      input={event.data.message}
      startedAt={event.created_at}
      author={isPending ? undefined : toRoundAuthor(event.actor)}
      origin={event.actor.origin}
      isPendingCurrentRound={isPending}
      attachmentRefs={event.data.attachment_refs}
      fallbackAttachments={event.data.attachments}
      conversationAttachments={conversation?.attachments}
    />
  );
};
