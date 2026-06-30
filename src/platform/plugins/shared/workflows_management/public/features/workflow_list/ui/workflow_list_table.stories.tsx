/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Decorator, Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { WorkflowListItemDto } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import type { WorkflowListTableProps } from './workflow_list_table';
import { WorkflowListTable } from './workflow_list_table';
import { kibanaReactDecorator } from '../../../../.storybook/decorators';

const routerDecorator: Decorator = (story) => <MemoryRouter>{story()}</MemoryRouter>;

const now = new Date();
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

const mockItems: WorkflowListItemDto[] = [
  {
    id: 'wf-1',
    name: 'Open PRs Report for Team One Workflow',
    description:
      'Daily report of open PRs from elastic/kibana filtered by a configurable GitHub label (defaults to Team:One)',
    enabled: true,
    valid: true,
    createdAt: hoursAgo(48),
    tags: ['github', 'reports', 'daily'],
    history: [
      {
        id: 'exec-1',
        status: ExecutionStatus.COMPLETED,
        startedAt: hoursAgo(1),
        finishedAt: hoursAgo(0.9),
        duration: 360000,
      },
    ],
    definition: {
      version: '1',
      name: 'Open PRs Report for Team One Workflow',
      enabled: true,
      tags: ['github', 'reports', 'daily'],
      steps: [
        { name: 'fetch_prs', type: 'http' },
        { name: 'filter_results', type: 'data.set' },
        { name: 'notify_channel', type: 'slack_api' },
      ],
      triggers: [{ type: 'manual' }],
    },
  },
  {
    id: 'wf-2',
    name: 'Trigger workflow from Slack message',
    description: 'a Slack message with button that triggers a workflow',
    enabled: true,
    valid: true,
    createdAt: hoursAgo(72),
    tags: ['slack'],
    history: [
      {
        id: 'exec-2',
        status: ExecutionStatus.COMPLETED,
        startedAt: hoursAgo(0.5),
        finishedAt: hoursAgo(0.4),
        duration: 360000,
      },
    ],
    definition: {
      version: '1',
      name: 'Trigger workflow from Slack message',
      enabled: true,
      tags: ['slack'],
      steps: [
        { name: 'send_message', type: 'slack_api' },
        { name: 'check_response', type: 'if', condition: 'true', steps: [] },
      ],
      triggers: [{ type: 'scheduled', with: { every: '10m' } }],
    },
  },
  {
    id: 'wf-3',
    name: 'slack-basic-demo',
    description: 'Send a slack message when a cloudwatch alarm is triggered',
    enabled: true,
    valid: true,
    createdAt: hoursAgo(96),
    tags: ['slack', 'monitoring', 'alerts', 'cloudwatch', 'infrastructure'],
    history: [
      {
        id: 'exec-3',
        status: ExecutionStatus.COMPLETED,
        startedAt: hoursAgo(0.4),
        finishedAt: hoursAgo(0.3),
        duration: 360000,
      },
    ],
    definition: {
      version: '1',
      name: 'slack-basic-demo',
      enabled: true,
      tags: ['slack', 'monitoring', 'alerts', 'cloudwatch', 'infrastructure'],
      steps: [{ name: 'send_slack', type: 'slack_api' }],
      triggers: [{ type: 'scheduled', with: { every: '25m' } }],
    },
  },
  {
    id: 'wf-4',
    name: 'GitHub PR Notification',
    description: 'Notify the team when a PR is opened or updated with relevant labels',
    enabled: true,
    valid: true,
    createdAt: hoursAgo(120),
    tags: ['github'],
    history: [
      {
        id: 'exec-4',
        status: ExecutionStatus.COMPLETED,
        startedAt: hoursAgo(1),
        finishedAt: hoursAgo(0.9),
        duration: 360000,
      },
    ],
    definition: {
      version: '1',
      name: 'GitHub PR Notification',
      enabled: true,
      tags: ['github'],
      steps: [
        { name: 'fetch_pr', type: 'http' },
        { name: 'check_labels', type: 'if', condition: 'true', steps: [] },
        { name: 'send_notification', type: 'slack_api' },
        { name: 'update_status', type: 'elasticsearch' },
      ],
      triggers: [{ type: 'scheduled', with: { every: '1h' } }],
    },
  },
  {
    id: 'wf-5',
    name: 'JIRA Issue Update',
    description: 'Sync JIRA issue status and assignee when an alert is triggered',
    enabled: true,
    valid: true,
    createdAt: hoursAgo(200),
    history: [
      {
        id: 'exec-5',
        status: ExecutionStatus.FAILED,
        startedAt: hoursAgo(1),
        finishedAt: hoursAgo(0.9),
        duration: 360000,
      },
    ],
    definition: {
      version: '1',
      name: 'JIRA Issue Update',
      enabled: true,
      steps: [{ name: 'update_jira', type: 'http' }],
      triggers: [{ type: 'alert' }],
    },
  },
  {
    id: 'wf-6',
    name: 'Daily Standup Reminder',
    description: 'Post a daily reminder for the standup meeting at 9 AM',
    enabled: true,
    valid: true,
    createdAt: hoursAgo(300),
    tags: ['daily'],
    history: [
      {
        id: 'exec-6',
        status: ExecutionStatus.COMPLETED,
        startedAt: hoursAgo(2),
        finishedAt: hoursAgo(1.9),
        duration: 360000,
      },
    ],
    definition: {
      version: '1',
      name: 'Daily Standup Reminder',
      enabled: true,
      tags: ['daily'],
      steps: [
        {
          name: 'check_day',
          type: 'if',
          condition: 'true',
          steps: [{ name: 'send_reminder', type: 'slack_api' }],
          else: [{ name: 'send_email_fallback', type: 'email' }],
        },
        { name: 'log_sent', type: 'console' },
      ],
      triggers: [{ type: 'alert' }],
    },
  },
  {
    id: 'wf-7',
    name: 'Draft test',
    description: '',
    enabled: false,
    valid: false,
    createdAt: hoursAgo(1),
    history: [],
    definition: {
      version: '1',
      name: 'Draft test',
      enabled: false,
      steps: [{ name: 'placeholder', type: 'console' }],
      triggers: [{ type: 'scheduled', with: { every: '1h' } }],
    },
  },
  {
    id: 'wf-8',
    name: 'New User Signup Alert',
    description: 'Notify the team when a new user signs up on the platform',
    enabled: true,
    valid: true,
    createdAt: hoursAgo(500),
    tags: ['users', 'notifications'],
    history: [
      {
        id: 'exec-8',
        status: ExecutionStatus.COMPLETED,
        startedAt: hoursAgo(2),
        finishedAt: hoursAgo(1.9),
        duration: 360000,
      },
    ],
    definition: {
      version: '1',
      name: 'New User Signup Alert',
      enabled: true,
      tags: ['users', 'notifications'],
      steps: [
        { name: 'detect_signup', type: 'elasticsearch' },
        { name: 'enrich_data', type: 'data.set' },
        { name: 'send_alert', type: 'slack_api' },
      ],
      triggers: [{ type: 'alert' }],
    },
  },
  {
    id: 'wf-9',
    name: 'Server Downtime Notification',
    description: 'Send an alert to the channel if the server goes down',
    enabled: true,
    valid: true,
    createdAt: hoursAgo(700),
    history: [
      {
        id: 'exec-9',
        status: ExecutionStatus.COMPLETED,
        startedAt: hoursAgo(2),
        finishedAt: hoursAgo(1.9),
        duration: 360000,
      },
    ],
    definition: {
      version: '1',
      name: 'Server Downtime Notification',
      enabled: true,
      steps: [
        { name: 'check_health', type: 'http' },
        {
          name: 'loop_servers',
          type: 'foreach',
          foreach: '[]',
          steps: [
            { name: 'ping_server', type: 'http' },
            { name: 'log_result', type: 'elasticsearch' },
          ],
        },
        { name: 'set_vars', type: 'data.set' },
        {
          name: 'branch_check',
          type: 'if',
          condition: 'true',
          steps: [{ name: 'send_slack', type: 'slack_api' }],
          else: [{ name: 'send_email', type: 'email' }],
        },
        { name: 'wait_cooldown', type: 'wait', with: { duration: '30s' } },
        { name: 'kibana_action', type: 'kibana.createCase' },
        { name: 'run_child', type: 'workflow.execute', with: { 'workflow-id': 'child' } },
      ],
      triggers: [{ type: 'scheduled', with: { every: '5m' } }],
    },
  },
  {
    id: 'wf-10',
    name: 'A Very Long Workflow Name That Should Be Truncated Because It Exceeds Available Space',
    description:
      'This workflow has an extremely long description that will definitely need to be truncated in the table cell because it is way too long to fit',
    enabled: true,
    valid: true,
    createdAt: hoursAgo(1000),
    tags: [
      'long-tag-one',
      'long-tag-two',
      'long-tag-three',
      'long-tag-four',
      'long-tag-five',
      'long-tag-six',
    ],
    history: [
      {
        id: 'exec-10',
        status: ExecutionStatus.COMPLETED,
        startedAt: hoursAgo(3),
        finishedAt: hoursAgo(2.9),
        duration: 360000,
      },
    ],
    definition: {
      version: '1',
      name: 'A Very Long Workflow Name',
      enabled: true,
      tags: [
        'long-tag-one',
        'long-tag-two',
        'long-tag-three',
        'long-tag-four',
        'long-tag-five',
        'long-tag-six',
      ],
      steps: [
        { name: 'step1', type: 'slack_api' },
        { name: 'step2', type: 'http' },
        { name: 'step3', type: 'elasticsearch.search' },
      ],
      triggers: [{ type: 'alert' }, { type: 'scheduled', with: { every: '1d' } }],
    },
  },
  {
    id: 'wf-11',
    name: 'No definition workflow',
    description: 'This workflow has no definition (null)',
    enabled: false,
    valid: false,
    createdAt: hoursAgo(24),
    history: [],
    definition: null,
  },
  {
    id: 'wf-12',
    name: 'Monthly Performance Review',
    description: 'Share a summary of team performance metrics at the end of each month',
    enabled: true,
    valid: true,
    createdAt: hoursAgo(2000),
    tags: ['monthly', 'review'],
    history: [
      {
        id: 'exec-12',
        status: ExecutionStatus.FAILED,
        startedAt: hoursAgo(4),
        finishedAt: hoursAgo(3.9),
        duration: 360000,
      },
    ],
    definition: {
      version: '1',
      name: 'Monthly Performance Review',
      enabled: true,
      tags: ['monthly', 'review'],
      steps: [
        { name: 'query_data', type: 'elasticsearch' },
        { name: 'aggregate', type: 'data.set' },
      ],
      // @ts-expect-error TS2322 - custom trigger type
      triggers: [{ type: 'Example.customtrigger', with: { every: '30d' } }],
    },
  },
];

const WorkflowListTableWithState = (props: WorkflowListTableProps) => {
  const [selectedItems, setSelectedItems] = useState<WorkflowListItemDto[]>([]);
  return (
    <WorkflowListTable
      {...props}
      selectedItems={selectedItems}
      onSelectionChange={setSelectedItems}
    />
  );
};

const meta: Meta<typeof WorkflowListTable> = {
  component: WorkflowListTableWithState,
  title: 'Workflows Management/Workflow List Table',
  decorators: [routerDecorator, kibanaReactDecorator],
};

export default meta;

type Story = StoryObj<typeof WorkflowListTable>;

const noop = () => {};

export const Default: Story = {
  args: {
    items: mockItems,
    page: 1,
    size: 20,
    total: mockItems.length,
    selectedItems: [],
    onSelectionChange: noop,
    onPageChange: noop,
    onToggleWorkflow: noop,
    onDeleteWorkflow: noop,
    onCloneWorkflow: noop,
    onExportWorkflow: noop,
    onRequestRun: noop,
    onEditWorkflow: noop,
    canCreateWorkflow: true,
    canReadWorkflow: true,
    canReadWorkflowExecution: true,
    canUpdateWorkflow: true,
    canDeleteWorkflow: true,
    canExecuteWorkflow: true,
  },
};

export const ReadOnly: Story = {
  args: {
    ...Default.args,
    canCreateWorkflow: false,
    canUpdateWorkflow: false,
    canDeleteWorkflow: false,
    canExecuteWorkflow: false,
  },
};

export const Empty: Story = {
  args: {
    ...Default.args,
    items: [],
    total: 0,
  },
};

export const SingleItem: Story = {
  args: {
    ...Default.args,
    items: [mockItems[0]],
    total: 1,
  },
};

export const Narrow: Story = {
  args: {
    ...Default.args,
  },
  parameters: {
    viewport: { defaultViewport: 'tablet' },
  },
  decorators: [(story) => <div style={{ maxWidth: 900 }}>{story()}</div>],
};

export const ConnectorSubtypeDeduplication: Story = {
  args: {
    ...Default.args,
    items: [
      {
        id: 'wf-dedup-1',
        name: '1Password Secret Rotation',
        description:
          'Fetches multiple secrets from 1Password, validates them, and rotates expired ones',
        enabled: true,
        valid: true,
        createdAt: hoursAgo(24),
        tags: ['1password', 'secrets'],
        history: [],
        definition: {
          version: '1',
          name: '1Password Secret Rotation',
          enabled: true,
          tags: ['1password', 'secrets'],
          steps: [
            { name: 'get_secret', type: '.one_password.get_item' },
            { name: 'list_secrets', type: '.one_password.get_items' },
            { name: 'check_expiry', type: 'if', condition: 'true', steps: [] },
            { name: 'rotate', type: '.one_password.update_item' },
            { name: 'notify', type: 'slack_api' },
          ],
          triggers: [{ type: 'scheduled', with: { every: '1d' } }],
        },
      },
      {
        id: 'wf-dedup-2',
        name: 'Multi-ES Pipeline',
        description: 'Queries multiple indices and bulk-indexes aggregated results',
        enabled: true,
        valid: true,
        createdAt: hoursAgo(48),
        tags: ['elasticsearch'],
        history: [],
        definition: {
          version: '1',
          name: 'Multi-ES Pipeline',
          enabled: true,
          tags: ['elasticsearch'],
          steps: [
            { name: 'search_logs', type: 'elasticsearch.search' },
            { name: 'search_metrics', type: 'elasticsearch.search' },
            { name: 'transform', type: 'data.set' },
            { name: 'bulk_index', type: 'elasticsearch.bulk' },
            { name: 'create_case', type: 'kibana.createCase' },
            { name: 'update_case', type: 'kibana.updateCase' },
          ],
          triggers: [{ type: 'scheduled', with: { every: '5m' } }],
        },
      },
    ],
    total: 2,
  },
};
