/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { of } from 'rxjs';
import useObservable from 'react-use/lib/useObservable';
import type { UserMessageEvent } from '@kbn/agent-builder-common/chat/timeline_events';
import { TimelineEventType, EventActorType } from '@kbn/agent-builder-common/chat/timeline_events';
import { useConversation } from '../../../hooks/use_conversation';
import { useAgentBuilderServices } from '../../../hooks/use_agent_builder_service';
import { useStreamRecord } from '../../../context/streaming/streaming_context';
import { initialActiveStreamState } from '../../../../services/events/active_stream_state';
import { Timeline } from './timeline';

const PENDING_USER_MESSAGE_ID = 'pending::user_message';

/**
 * @todo: errors not handled yet. Probably should read the streaming context error state here
 */
export const TimelineConnector: React.FC = () => {
  const { conversation } = useConversation();
  const { eventsService } = useAgentBuilderServices();
  const conversationId = conversation?.id;

  const activeStream$ = useMemo(
    () =>
      conversationId
        ? eventsService.getActiveStream$(conversationId)
        : of(initialActiveStreamState),
    [eventsService, conversationId]
  );
  const { activeExecution, sealed } = useObservable(activeStream$, initialActiveStreamState);

  const { pendingMessage } = useStreamRecord(conversationId);
  const pendingUserMessage = useMemo<UserMessageEvent | null>(
    () =>
      pendingMessage
        ? {
            id: PENDING_USER_MESSAGE_ID,
            type: TimelineEventType.userMessage,
            created_at: new Date().toISOString(),
            actor: { type: EventActorType.user, id: '' },
            data: { message: pendingMessage },
          }
        : null,
    [pendingMessage]
  );

  const persistedEvents = conversation?.events;
  const sealedExecutions = useMemo(() => {
    const persistedIds = new Set((persistedEvents ?? []).map((event) => event.id));
    return sealed.filter((event) => !persistedIds.has(event.id));
  }, [persistedEvents, sealed]);

  return (
    <Timeline
      events={persistedEvents ?? []}
      pendingUserMessage={pendingUserMessage}
      sealedExecutions={sealedExecutions}
      activeExecution={activeExecution}
    />
  );
};
