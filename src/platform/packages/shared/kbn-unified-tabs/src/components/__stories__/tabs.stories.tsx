/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';
import type { Meta, StoryFn, StoryObj } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { TabbedContent, type TabbedContentProps } from '../tabbed_content';
import { useNewTabProps } from '../../hooks/use_new_tab_props';
import { servicesMock } from '../../../__mocks__/services';
import { getPreviewDataMock } from '../../../__mocks__/get_preview_data';

export default {
  title: 'Unified Tabs/Tabs',
  parameters: {
    backgrounds: {
      default: 'white',
      values: [{ name: 'white', value: '#fff' }],
    },
  },
} as Meta;

const TabbedContentTemplate: StoryFn<TabbedContentProps> = (args) => {
  const { getNewTabDefaultProps } = useNewTabProps({
    numberOfInitialItems: args.items.length,
  });

  const [{ managedItems, managedSelectedItemId }, setState] = useState<{
    managedItems: TabbedContentProps['items'];
    managedSelectedItemId: TabbedContentProps['selectedItemId'];
  }>(() => ({
    managedItems: args.items,
    managedSelectedItemId: args.selectedItemId,
  }));

  return (
    <TabbedContent
      {...args}
      items={managedItems}
      selectedItemId={managedSelectedItemId}
      recentlyClosedItems={args.recentlyClosedItems ?? []}
      createItem={getNewTabDefaultProps}
      getPreviewData={getPreviewDataMock}
      services={servicesMock}
      onEBTEvent={action('onEBTEvent')}
      onChanged={(updatedState) => {
        action('onChanged')(updatedState);
        setState({
          managedItems: updatedState.items,
          managedSelectedItemId: updatedState.selectedItem?.id,
        });
      }}
      onClearRecentlyClosed={action('onClearRecentlyClosed')}
      renderContent={(item) => (
        <div style={{ paddingTop: '16px' }}>Content for tab: {item.label}</div>
      )}
    />
  );
};

export const Default: StoryObj<TabbedContentProps> = {
  render: TabbedContentTemplate,

  args: {
    items: [
      {
        id: '1',
        label: 'Tab 1',
      },
    ],
  },
};

export const WithMultipleTabs: StoryObj<TabbedContentProps> = {
  render: TabbedContentTemplate,

  args: {
    items: [
      {
        id: '1',
        label: 'Tab 1',
      },
      {
        id: '2',
        label: 'Tab 2',
      },
      {
        id: '3',
        label: 'Tab 3',
      },
    ],
    selectedItemId: '3',
    recentlyClosedItems: [
      {
        id: '4',
        label: 'Closed Tab',
        closedAt: 123456789,
      },
    ],
  },
};
