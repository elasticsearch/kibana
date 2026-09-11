/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useReducer, useState } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPanel } from '@elastic/eui';
import type { Meta, StoryObj } from '@storybook/react';
import type { TimelineEvent } from '@kbn/agent-builder-common/chat/timeline_events';
import type { ChatEvent } from '@kbn/agent-builder-common';
import { AgentBuilderStorybookProvider } from '../../../__storybook__/agent_builder_storybook_provider';
import { Timeline } from './timeline';
import { DevSseEmitter } from './dev_sse_emitter';
import {
  initialActiveStreamState,
  activeStreamReducer,
} from '../../../../services/events/active_stream_state';
import { createUserMessageEvent } from './items/user_message.factory';
import { createExecutionTerminatedEvent } from './items/execution_terminated.factory';

const seedEvents: TimelineEvent[] = [
  createUserMessageEvent({ id: 'seed-1' }),
  createExecutionTerminatedEvent({ id: 'seed-2', trigger_event_id: 'seed-1' }),
  createUserMessageEvent({
    id: 'seed-3',
    data: { message: 'Are there any anomalies in the last hour?' },
  }),
];

const meta: Meta<typeof Timeline> = {
  title: 'Conversations/Timeline/Timeline',
  component: Timeline,
  decorators: [
    (Story) => (
      <AgentBuilderStorybookProvider conversationId="story-conversation-1">
        <div style={{ maxWidth: 600, padding: 24 }}>
          <Story />
        </div>
      </AgentBuilderStorybookProvider>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Timeline>;

export const Default: Story = {
  args: {
    events: [createUserMessageEvent(), createExecutionTerminatedEvent()],
  },
};

export const WithPendingMessage: Story = {
  args: {
    events: [createUserMessageEvent(), createExecutionTerminatedEvent()],
    pendingUserMessage: createUserMessageEvent({
      id: 'pending::user_message',
      data: { message: 'Just sent - not persisted yet' },
    }),
  },
};

// Inner stateful component so `key` remount cleanly resets the reducer.
const InteractiveInner: React.FC<{ onReset: () => void }> = ({ onReset }) => {
  const [{ activeExecution, sealed }, dispatch] = useReducer(
    activeStreamReducer,
    initialActiveStreamState
  );
  const emit = useCallback((event: ChatEvent) => dispatch(event), []);

  const sealedExecutions = useMemo(() => {
    const persistedIds = new Set(seedEvents.map((event) => event.id));
    return sealed.filter((event) => !persistedIds.has(event.id));
  }, [sealed]);

  return (
    <EuiFlexGroup direction="column" gutterSize="l">
      <EuiFlexItem grow={false}>
        <DevSseEmitter emit={emit} reset={onReset} />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiPanel hasBorder paddingSize="l">
          <Timeline
            events={seedEvents}
            sealedExecutions={sealedExecutions}
            activeExecution={activeExecution}
          />
        </EuiPanel>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const InteractiveStory: React.FC = () => {
  const [resetKey, setResetKey] = useState(0);
  const reset = useCallback(() => setResetKey((k) => k + 1), []);
  return <InteractiveInner key={resetKey} onReset={reset} />;
};

export const Interactive: Story = {
  render: () => <InteractiveStory />,
};
