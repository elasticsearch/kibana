/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { action } from '@storybook/addon-actions';

import { CustomizeNavigationModal } from '../components/customize_navigation_modal';
import type { NavigationItemInfo } from '../types';

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const BASE_ITEMS: NavigationItemInfo[] = [
  { id: 'discover', title: 'Discover', hidden: false, icon: 'discoverApp' },
  { id: 'dashboards', title: 'Dashboards', hidden: false, icon: 'dashboardApp' },
  { id: 'apm', title: 'Services', hidden: false, icon: 'apmApp' },
  { id: 'infrastructure', title: 'Infrastructure', hidden: false, icon: 'infraApp' },
  { id: 'logs', title: 'Logs', hidden: false, icon: 'logsApp' },
  { id: 'alerts', title: 'Alerts', hidden: false, icon: 'bell' },
  { id: 'fleet', title: 'Fleet', hidden: true, icon: 'fleetApp' },
  { id: 'profiling', title: 'Profiling', hidden: true, icon: 'profilingApp' },
];

// ---------------------------------------------------------------------------
// CustomizeNavigationModal
// ---------------------------------------------------------------------------

type ModalProps = React.ComponentProps<typeof CustomizeNavigationModal>;

/**
 * Stateful wrapper so drag-and-drop and toggle interactions work live in the
 * story canvas. Callbacks are forwarded to Storybook actions so you can
 * observe the values in the Actions panel.
 */
const ControlledModal = ({ items: initialItems }: Pick<ModalProps, 'items'>) => {
  const [items, setItems] = useState(initialItems);

  return (
    <CustomizeNavigationModal
      items={items}
      onChange={(order, hiddenIds) => action('onChange')({ order, hiddenIds })}
      onSave={(order, hiddenIds) => action('onSave')({ order, hiddenIds })}
      onReset={async () => {
        action('onReset')();
        setItems(BASE_ITEMS);
        return BASE_ITEMS;
      }}
      onClose={() => action('onClose')()}
    />
  );
};

export default {
  title: 'Navigation Customization/Modal',
  parameters: { layout: 'centered' },
} satisfies Meta;

export const Default: StoryObj = {
  name: 'default',
  render: () => <ControlledModal items={BASE_ITEMS} />,
};
