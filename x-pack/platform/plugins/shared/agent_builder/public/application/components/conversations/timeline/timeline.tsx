/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import type { ConversationRoundOrigin } from '@kbn/agent-builder-common';
import type {
  TimelineEvent,
  UserMessageEvent,
  ExecutionTerminatedEvent,
} from '@kbn/agent-builder-common/chat/timeline_events';
import { TimelineEventType } from '@kbn/agent-builder-common/chat/timeline_events';
import type { ActiveExecutionDraft } from '../../../../services/events/active_stream_state';
import { UserTurn } from './items/user_turn';
import { PromptResponse } from './items/prompt_response';
import { ExecutionStarted } from './items/execution_started';
import { ExecutionTerminated } from './items/execution_terminated';
import { ExecutionFailed } from './items/execution_failed';
import { ExecutionAborted } from './items/execution_aborted';
import { ActiveExecution } from './active_execution';
import { AgentTurn } from './agent_turn';

const TimelineEventItem: React.FC<{ event: TimelineEvent; origin?: ConversationRoundOrigin }> = ({
  event,
  origin,
}) => {
  switch (event.type) {
    case TimelineEventType.userMessage:
      return <UserTurn event={event} />;
    case TimelineEventType.promptResponse:
      return <PromptResponse event={event} />;
    case TimelineEventType.executionStarted:
      return <ExecutionStarted event={event} />;
    case TimelineEventType.executionTerminated:
      return (
        <AgentTurn startedAt={event.created_at} origin={origin}>
          <ExecutionTerminated event={event} />
        </AgentTurn>
      );
    case TimelineEventType.executionFailed:
      return (
        <AgentTurn startedAt={event.created_at} origin={origin}>
          <ExecutionFailed event={event} />
        </AgentTurn>
      );
    case TimelineEventType.executionAborted:
      return (
        <AgentTurn startedAt={event.created_at} origin={origin}>
          <ExecutionAborted event={event} />
        </AgentTurn>
      );
    default:
      return null;
  }
};

interface TimelineProps {
  events: TimelineEvent[];
  /** The just-sent user message, shown before it is persisted and returned by the conversation GET. */
  pendingUserMessage?: UserMessageEvent | null;
  /** Executions sealed locally this session but not yet in `events`; rendered after the pending user message. */
  sealedExecutions?: ExecutionTerminatedEvent[];
  activeExecution?: ActiveExecutionDraft | null;
}

export const Timeline: React.FC<TimelineProps> = ({
  events,
  pendingUserMessage,
  sealedExecutions,
  activeExecution,
}) => {
  // In flight but no output yet: show a loading avatar. Dropped once `sealed` grows on round_complete.
  const isAgentStarting =
    Boolean(pendingUserMessage) && !activeExecution && !sealedExecutions?.length;

  // Agent events have no origin of their own; inherit it from the triggering user message.
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const resolveOrigin = (event: TimelineEvent): ConversationRoundOrigin | undefined =>
    event.trigger_event_id ? eventsById.get(event.trigger_event_id)?.actor.origin : undefined;

  return (
    <EuiFlexGroup direction="column" gutterSize="none">
      {events.map((event) => (
        <EuiFlexItem key={event.id}>
          <TimelineEventItem event={event} origin={resolveOrigin(event)} />
        </EuiFlexItem>
      ))}
      {pendingUserMessage && (
        <EuiFlexItem>
          <UserTurn event={pendingUserMessage} isPending />
        </EuiFlexItem>
      )}
      {isAgentStarting && (
        <EuiFlexItem>
          <AgentTurn isLoading />
        </EuiFlexItem>
      )}
      {sealedExecutions?.map((event) => (
        <EuiFlexItem key={event.id}>
          <TimelineEventItem event={event} origin={resolveOrigin(event)} />
        </EuiFlexItem>
      ))}
      {activeExecution && (
        <EuiFlexItem>
          <AgentTurn isLoading>
            <ActiveExecution activeExecution={activeExecution} />
          </AgentTurn>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
