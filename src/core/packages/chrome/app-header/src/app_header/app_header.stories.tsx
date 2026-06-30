/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { css } from '@emotion/react';
import { EuiButtonIcon, EuiPageTemplate, EuiToolTip } from '@elastic/eui';
import { ChromeServiceProvider } from '@kbn/core-chrome-browser-context';
import { createChromeStorybookStart } from '@kbn/core-chrome-browser-mocks';
import type {
  AppHeaderBadge,
  AppHeaderMetadataItems,
  AppHeaderTab,
} from '@kbn/core-chrome-browser';
import type { AppMenuConfig } from '@kbn/core-chrome-app-menu-components';
import type { AppHeaderPadding } from '../types';
import { AppHeaderView } from './app_header';

interface ComposedHeaderStoryProps {
  title: string;
  editable: boolean;
  padding: 'none' | 's' | 'm' | 'bleed-l';
  width: number;
  showBack: boolean;
  showTabs: boolean;
  showBadges: boolean;
  showMetadata: boolean;
  showFavorite: boolean;
  showMenu: boolean;
}

const badges: AppHeaderBadge[] = [
  { label: 'Beta', color: 'accent' },
  { label: 'Managed', color: 'primary' },
];

const tabs: AppHeaderTab[] = [
  { id: 'overview', label: 'Overview', isSelected: true, onClick: action('tab-overview') },
  { id: 'alerts', label: 'Alerts', badge: 3, onClick: action('tab-alerts') },
  {
    id: 'insights',
    label: 'Insights',
    badge: { iconType: 'beaker', tooltip: 'Beta feature' },
    onClick: action('tab-insights'),
  },
  { id: 'settings', label: 'Settings', onClick: action('tab-settings') },
  {
    id: 'logs',
    label: 'Logs',
    onClick: action('tab-logs'),
    disabled: true,
    toolTipContent: 'Logs are disabled for this app',
  },
];

const metadata: AppHeaderMetadataItems = [
  { type: 'text', label: 'Created by: analyst' },
  { type: 'health', label: 'Healthy', color: 'success' },
  { type: 'button', label: 'Updated 2 minutes ago', onClick: action('metadata-clicked') },
];

// Six items so the menu overflows the visible limit into the "More" popover.
const menu: AppMenuConfig = {
  items: Array.from({ length: 6 }, (_, index) => ({
    id: `action-${index}`,
    order: index,
    label: `Action ${index + 1}`,
    iconType: 'gear',
    run: action(`menu-action-${index}`),
  })),
};

const ComposedHeader = ({
  title: initialTitle,
  editable,
  padding,
  width,
  showBack,
  showTabs,
  showBadges,
  showMetadata,
  showFavorite,
  showMenu,
}: ComposedHeaderStoryProps) => {
  const [title, setTitle] = useState(initialTitle);
  const chrome = useMemo(() => createChromeStorybookStart(), []);

  const editableTitle = {
    text: title,
    onSave: async (nextTitle: string) => {
      action('title-saved')(nextTitle);
      setTitle(nextTitle);
    },
  };

  const paddingProp: AppHeaderPadding = padding === 'bleed-l' ? { bleed: 'l' } : padding;

  return (
    <ChromeServiceProvider value={{ chrome }}>
      <div
        css={css`
          width: ${width}px;
        `}
      >
        <AppHeaderView
          title={editable ? editableTitle : title}
          back={showBack ? { href: '/app/management', label: 'Stack Management' } : undefined}
          tabs={showTabs ? tabs : undefined}
          badges={showBadges ? badges : undefined}
          metadata={showMetadata ? metadata : undefined}
          menu={showMenu ? menu : undefined}
          favorite={
            showFavorite ? (
              <EuiToolTip content="Favorite" disableScreenReaderOutput>
                <EuiButtonIcon
                  aria-label="Favorite"
                  iconType="starEmpty"
                  onClick={action('favorite')}
                />
              </EuiToolTip>
            ) : undefined
          }
          sticky={false}
          padding={paddingProp}
        />
      </div>
    </ChromeServiceProvider>
  );
};

const meta: Meta<ComposedHeaderStoryProps> = {
  title: 'Chrome/App Header',
  component: ComposedHeader,
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
          'The composed Chrome Next app header. Toggle the regions (back navigation, tabs, ' +
          'badges, metadata, app menu, favorite) to see how they lay out together. For ' +
          'title-specific states see the "App Header Editable Title" story.',
      },
    },
  },
  argTypes: {
    padding: {
      control: 'inline-radio',
      options: ['none', 's', 'm', 'bleed-l'],
      description: "Horizontal padding. `bleed-l` cancels a padded container (`{ bleed: 'l' }`).",
    },
  },
  args: {
    title: 'System Shells via Services',
    editable: true,
    padding: 'm',
    width: 900,
    showBack: true,
    showTabs: true,
    showBadges: true,
    showMetadata: true,
    showFavorite: true,
    showMenu: true,
  },
};

export default meta;

type Story = StoryObj<ComposedHeaderStoryProps>;

export const FullHeader: Story = {};

export const TitleOnly: Story = {
  args: {
    showBack: false,
    showTabs: false,
    showBadges: false,
    showMetadata: false,
    showFavorite: false,
    showMenu: false,
  },
};

export const WithoutTabs: Story = {
  args: {
    showTabs: false,
  },
};

export const NonEditableTitle: Story = {
  args: {
    editable: false,
  },
};
