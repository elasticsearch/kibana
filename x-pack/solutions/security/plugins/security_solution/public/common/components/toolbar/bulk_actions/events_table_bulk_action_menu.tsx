/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import { EuiContextMenu } from '@elastic/eui';
import React, { useMemo } from 'react';
import {
  withActionIcons,
  withGroupSeparators,
  withStatusDotIcons,
} from '../../../utils/action_menu_items';
import { ACTION_ICONS_BY_ID } from '../../../utils/action_icons';
import { ALERT_STATUS_ICON_COLORS, type BulkActionGroups } from './use_bulk_action_items';

interface EventsTableBulkActionMenuProps {
  panels: EuiContextMenuPanelDescriptor[];
  groups: BulkActionGroups;
}

export const EventsTableBulkActionMenu = ({ panels, groups }: EventsTableBulkActionMenuProps) => {
  const { statusItems, casesItems, timelineItems, customItems, workflowItems } = groups;
  const decoratedItems = useMemo(
    () =>
      withActionIcons(
        withGroupSeparators([
          withStatusDotIcons(statusItems, ALERT_STATUS_ICON_COLORS),
          casesItems,
          timelineItems,
          customItems,
          workflowItems,
        ]),
        ACTION_ICONS_BY_ID
      ),
    [statusItems, casesItems, timelineItems, customItems, workflowItems]
  );

  const menuPanels = useMemo<EuiContextMenuPanelDescriptor[]>(
    () => [{ id: 0, items: decoratedItems }, ...panels],
    [decoratedItems, panels]
  );

  return <EuiContextMenu panels={menuPanels} initialPanelId={0} />;
};
