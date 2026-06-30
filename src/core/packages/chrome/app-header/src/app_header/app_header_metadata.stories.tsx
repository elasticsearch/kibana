/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { css } from '@emotion/react';
import { EuiPageTemplate, EuiTitle } from '@elastic/eui';
import type { AppHeaderMetadataItems } from '../types';
import { AppHeaderMetadata } from './app_header_metadata';
import { AppHeaderShell } from './app_header_shell';

interface AppHeaderMetadataStoryProps {
  title: string;
  metadata: AppHeaderMetadataItems;
  width?: number;
}

const HeaderWithMetadata = ({ title, metadata, width }: AppHeaderMetadataStoryProps) => {
  return (
    <div
      css={css`
        width: ${width ? `${width}px` : '100%'};
      `}
    >
      <AppHeaderShell
        title={
          <EuiTitle size="xs">
            <h1>{title}</h1>
          </EuiTitle>
        }
        metadata={<AppHeaderMetadata metadata={metadata} />}
        padding="m"
        sticky={false}
      />
    </div>
  );
};

const meta: Meta<AppHeaderMetadataStoryProps> = {
  title: 'Chrome/App Header Metadata',
  component: HeaderWithMetadata,
  decorators: [
    (Story) => (
      <EuiPageTemplate>
        <Story />
      </EuiPageTemplate>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'Metadata displayed below the page title in the Chrome app header. ' +
          'Metadata supports up to three visible items with no overflow menu.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<AppHeaderMetadataStoryProps>;

export const Metadata: Story = {
  args: {
    title: '[Elastic Agent] CPU usage spike',
    metadata: [
      { type: 'health', label: 'Degraded', color: 'warning' },
      { type: 'text', label: 'Created by', value: 'analyst' },
      { type: 'button', label: 'View details', onClick: action('view-details-clicked') },
    ],
  },
};

export const WrappedMetadata: Story = {
  name: 'Wrapped metadata',
  args: {
    ...Metadata.args,
    width: 260,
  },
};

export const KeyValueText: Story = {
  name: 'Key/value text',
  args: {
    title: '[Elastic Agent] CPU usage spike',
    metadata: [
      { type: 'text', label: 'API key owner', value: 'kate@elastic.co' },
      { type: 'text', label: 'Last updated by', value: 'elastic on Apr 20' },
      { type: 'text', label: 'Created by', value: 'elastic on Apr 19' },
    ],
  },
};

export const PlainText: Story = {
  name: 'Plain text (no value)',
  args: {
    title: '[Elastic Agent] CPU usage spike',
    metadata: [
      { type: 'text', label: 'Draft' },
      { type: 'text', label: 'Last run 3 minutes ago' },
    ],
  },
};

export const Buttons: Story = {
  name: 'Buttons (action, link)',
  args: {
    title: '[Elastic Agent] CPU usage spike',
    metadata: [
      { type: 'button', label: 'View details', onClick: action('view-details-clicked') },
      { type: 'button', label: 'Run history', href: '#' },
      { type: 'button', label: 'Edit', onClick: action('edit-clicked') },
    ],
  },
};

export const HealthStatuses: Story = {
  name: 'Health statuses',
  args: {
    title: '[Elastic Agent] CPU usage spike',
    metadata: [
      { type: 'health', label: 'Healthy', color: 'success' },
      { type: 'health', label: 'Degraded', color: 'warning' },
      { type: 'health', label: 'Failed', color: 'danger' },
    ],
  },
};

export const SingleItem: Story = {
  name: 'Single item',
  args: {
    title: '[Elastic Agent] CPU usage spike',
    metadata: [{ type: 'health', label: 'Running', color: 'success' }],
  },
};
