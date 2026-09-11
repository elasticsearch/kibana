/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { AgentBuilderStorybookProvider } from '../../../../__storybook__/agent_builder_storybook_provider';
import { ExecutionStarted } from './execution_started';
import { createExecutionStartedEvent } from './execution_started.factory';

const meta: Meta<typeof ExecutionStarted> = {
  title: 'Conversations/Timeline/Execution Started',
  component: ExecutionStarted,
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

type Story = StoryObj<typeof ExecutionStarted>;

export const Default: Story = {
  args: {
    event: createExecutionStartedEvent(),
  },
};
