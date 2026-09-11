/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { AgentBuilderStorybookProvider } from '../../../../__storybook__/agent_builder_storybook_provider';
import { ExecutionFailed } from './execution_failed';
import { createExecutionFailedEvent } from './execution_failed.factory';

const meta: Meta<typeof ExecutionFailed> = {
  title: 'Conversations/Timeline/Execution Failed',
  component: ExecutionFailed,
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

type Story = StoryObj<typeof ExecutionFailed>;

export const Default: Story = {
  args: {
    event: createExecutionFailedEvent(),
  },
};
