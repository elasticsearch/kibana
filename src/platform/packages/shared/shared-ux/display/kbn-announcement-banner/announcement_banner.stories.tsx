/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { css } from '@emotion/react';
import type { Meta, StoryObj } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { EuiText, useEuiTheme } from '@elastic/eui';

import { AnnouncementBanner, type AnnouncementBannerProps } from './announcement_banner';

import illustrationSmallUrl from './assets/illustration_s.svg';
import illustrationSmallUrlDark from './assets/illustration_s_dark.svg';
import illustrationMediumUrl from './assets/illustration_m.svg';

const illustrationStyles = css`
  max-inline-size: 100%;
`;

const Illustration = ({ urlLight, urlDark }: { urlLight: string; urlDark?: string }) => {
  const { colorMode } = useEuiTheme();

  return (
    <img
      src={colorMode === 'DARK' ? urlDark ?? urlLight : urlLight}
      alt=""
      aria-hidden="true"
      css={illustrationStyles}
    />
  );
};

const IllustrationMedium = () => <Illustration urlLight={illustrationMediumUrl} />;
const IllustrationSmall = () => (
  <Illustration urlLight={illustrationSmallUrl} urlDark={illustrationSmallUrlDark} />
);

/**
 * Story args extend the public props with three synthetic booleans so the
 * Controls panel can toggle the optional slots without exposing their inner
 * shape.
 */
type StoryArgs = Omit<AnnouncementBannerProps, 'onDismiss'> & {
  primaryAction: boolean;
  secondaryAction: boolean;
  onDismiss: boolean;
};

const buildAnnouncementProps = (args: StoryArgs): AnnouncementBannerProps => {
  const { media, primaryAction, secondaryAction, onDismiss, size, actionProps, ...rest } = args;
  return {
    ...rest,
    size,
    media: size === 's' ? <IllustrationSmall /> : <IllustrationMedium />,
    actionProps: {
      primary: primaryAction
        ? {
            children: 'Primary action',
            onClick: action('primary onClick'),
            ...actionProps?.primary,
          }
        : undefined,
      secondary: secondaryAction
        ? {
            children: 'Secondary action',
            onClick: action('secondary onClick'),
            ...actionProps?.secondary,
          }
        : undefined,
    },
    onDismiss: onDismiss ? action('onDismiss') : undefined,
  };
};

const meta: Meta<StoryArgs> = {
  title: 'Display/AnnouncementBanner',
  component: AnnouncementBanner,
  args: {
    title: 'Announcement title',
    text: 'Envision a realm where your dreams manifest like a breathtaking mural. Each stroke of the brush symbolizes a hope yearning to be fulfilled, creating a tapestry of aspirations that come to life.',
    size: 'm',
    color: 'highlighted',
    primaryAction: true,
    secondaryAction: true,
    onDismiss: true,
  },
  argTypes: {
    size: { control: { type: 'inline-radio' }, options: ['s', 'm'] },
    color: { control: { type: 'inline-radio' }, options: ['highlighted', 'plain'] },
    primaryAction: { control: { type: 'boolean' } },
    secondaryAction: { control: { type: 'boolean' } },
    onDismiss: { control: { type: 'boolean' } },
    children: { table: { disable: true } },
  },
  render: (args) => <AnnouncementBanner {...buildAnnouncementProps(args)} />,
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Playground: Story = {};

const ContainerSizesRender = (args: StoryArgs) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    {[360, 500, 1000, 1800].map((width) => (
      <div key={width}>
        <div style={{ fontSize: 12, marginBottom: 4 }}>{width}px</div>
        <div style={{ width }}>
          <AnnouncementBanner {...buildAnnouncementProps(args)} />
        </div>
      </div>
    ))}
  </div>
);

/** Renders the same announcement at three widths to demo container query zones. */
export const ContainerSizes: Story = {
  render: (args) => <ContainerSizesRender {...args} />,
};

export const FilledPrimaryAction: Story = {
  args: {
    actionProps: {
      primary: {
        children: 'Primary action',
        fill: true,
      },
    },
  },
};

export const WithChildren: Story = {
  args: {
    children: (
      <EuiText size="s" color="subdued">
        Picture each color as a quiet promise — gold for the ambitions you whisper only to yourself,
        blue for the patience that carries you through, crimson for the courage to begin again. The
        mural is never finished, and that is the wonder of it.
      </EuiText>
    ),
  },
  argTypes: {
    children: { table: { disable: false }, control: { type: 'text' } },
  },
};
