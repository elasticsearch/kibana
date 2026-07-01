/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiPanel, EuiSpacer } from '@elastic/eui';
import type { EmbeddableStoryObj } from '@kbn/storybook';
import { action } from '@storybook/addon-actions';
import type { Meta, StoryObj } from '@storybook/react';
import type { FC } from 'react';
import React from 'react';
import { KbnCallout } from '../components/base/base_callout';
import type { KbnCalloutProps } from '../components/base/base_callout';
import {
  KbnDangerCallout,
  KbnInfoCallout,
  KbnSuccessCallout,
  KbnWarningCallout,
} from '../components';

const sampleContent =
  'Life is a canvas, and you are the artist. Paint your dreams with vibrant colors and bold strokes.';

const meta: Meta = {
  title: 'Callout',
  parameters: { layout: 'padded' },
};
export default meta;

/** The four semantic variants. Choose by meaning, not by color. */
export const Variants: EmbeddableStoryObj = {
  tags: ['embeddable'],
  parameters: { embeddable: { height: 440 } },
  render: () => (
    <>
      <KbnInfoCallout title="Neutral" content={sampleContent} />
      <EuiSpacer size="m" />
      <KbnSuccessCallout title="Success" content={sampleContent} />
      <EuiSpacer size="m" />
      <KbnWarningCallout title="Warning" content={sampleContent} />
      <EuiSpacer size="m" />
      <KbnDangerCallout title="Danger" content={sampleContent} />
    </>
  ),
};

/** A primary action, optionally paired with a secondary one. */
export const Actions: EmbeddableStoryObj = {
  tags: ['embeddable'],
  parameters: { embeddable: { height: 160 } },
  render: () => (
    <KbnInfoCallout
      title="Update available"
      content="A new version is ready to install."
      actions={{
        primary: { label: 'Update now', onClick: action('primary') },
        secondary: { label: 'View changes', onClick: action('secondary') },
      }}
    />
  ),
};

/** Pass `onDismiss` to render the close (X) button. */
export const Dismissible: EmbeddableStoryObj = {
  tags: ['embeddable'],
  parameters: { embeddable: { height: 140 } },
  render: () => (
    <KbnWarningCallout
      title="Unsaved changes"
      content="Your changes will be lost if you navigate away."
      onDismiss={action('dismiss')}
    />
  ),
};

/** `m` stacks title above content; `s` renders them inline like a banner. */
export const Sizes: EmbeddableStoryObj = {
  tags: ['embeddable'],
  parameters: { embeddable: { height: 200 } },
  render: () => (
    <>
      <KbnInfoCallout size="m" title="Medium (default)" content={sampleContent} />
      <EuiSpacer size="m" />
      <KbnInfoCallout size="s" title="Small" content="Renders inline like a banner." />
    </>
  ),
};

/** Use the base `KbnCallout` to pair any color with a custom `iconType`. */
export const CustomIcon: EmbeddableStoryObj = {
  tags: ['embeddable'],
  parameters: { embeddable: { height: 120 } },
  render: () => (
    <KbnCallout
      color="primary"
      iconType="bell"
      title="Custom icon"
      content="Reach for the base KbnCallout only when a variant doesn't fit."
    />
  ),
};

interface PlaygroundArgs {
  title: string;
  content: string;
  size: 's' | 'm';
  onDismiss: boolean;
  panelWidth: number;
  includePrimaryAction: boolean;
  includeSecondaryAction: boolean;
}

const VARIANTS: ReadonlyArray<readonly [string, FC<Omit<KbnCalloutProps, 'color' | 'iconType'>>]> =
  [
    ['Neutral', KbnInfoCallout],
    ['Success', KbnSuccessCallout],
    ['Warning', KbnWarningCallout],
    ['Danger', KbnDangerCallout],
  ];

/** Interactive sandbox for exploring the prop surface across every variant. */
export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    title: { control: 'text' },
    content: { control: 'text' },
    size: {
      control: { type: 'radio' },
      options: ['s', 'm'],
    },
    onDismiss: { control: 'boolean', name: 'Show dismiss button' },
    panelWidth: {
      control: { type: 'range', min: 320, max: 1600, step: 16 },
      name: 'Panel width (px)',
    },
    includePrimaryAction: { control: 'boolean', name: 'Include primary action' },
    includeSecondaryAction: { control: 'boolean', name: 'Include secondary action' },
  },
  args: {
    title: 'Callout title',
    content: sampleContent,
    size: 'm',
    onDismiss: false,
    panelWidth: 720,
    includePrimaryAction: true,
    includeSecondaryAction: true,
  },
  render: ({
    title,
    content,
    size,
    onDismiss,
    panelWidth,
    includePrimaryAction,
    includeSecondaryAction,
  }) => (
    <EuiPanel hasShadow={false} hasBorder paddingSize="m" style={{ width: panelWidth }}>
      {VARIANTS.map(([label, Component], index) => (
        <React.Fragment key={label}>
          {index > 0 && <EuiSpacer size="m" />}
          <Component
            title={title || undefined}
            content={content}
            size={size}
            onDismiss={onDismiss ? action('dismiss') : undefined}
            actions={
              includePrimaryAction
                ? {
                    primary: { label: 'Primary action', onClick: action('primary') },
                    secondary: includeSecondaryAction
                      ? { label: 'Secondary action', onClick: action('secondary') }
                      : undefined,
                  }
                : undefined
            }
          />
        </React.Fragment>
      ))}
    </EuiPanel>
  ),
};
