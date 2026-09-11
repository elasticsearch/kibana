/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiContextMenu } from '@elastic/eui';
import type {
  EuiContextMenuPanelDescriptor,
  EuiContextMenuPanelItemDescriptor,
} from '@elastic/eui';
import React, { useMemo } from 'react';
import {
  withActionIcons,
  withGroupSeparators,
  withStatusDotIcons,
} from '../../../../../common/utils/action_menu_items';
import { ACTION_ICONS_BY_ID } from '../../../../../common/utils/action_icons';
import { ALERT_STATUS_ICON_COLORS } from '../../../../../common/components/toolbar/bulk_actions/use_bulk_action_items';

/** Subset of AlertRowActionMenuProps needed to derive the visible groups. */
export interface AlertRowActionGroupsProps {
  addToCaseItems: EuiContextMenuPanelItemDescriptor[];
  addToChatItems: EuiContextMenuPanelItemDescriptor[];
  alertAssigneeItems: EuiContextMenuPanelItemDescriptor[];
  alertTagItems: EuiContextMenuPanelItemDescriptor[];
  canCreateEndpointEventFilters: boolean;
  eventFilterItems: EuiContextMenuPanelItemDescriptor[];
  exceptionItems: EuiContextMenuPanelItemDescriptor[];
  hasAgent: boolean;
  isAlert: boolean;
  osqueryItems: EuiContextMenuPanelItemDescriptor[];
  runAlertWorkflowItems: EuiContextMenuPanelItemDescriptor[];
  runDocumentWorkflowItems: EuiContextMenuPanelItemDescriptor[];
  statusItems: EuiContextMenuPanelItemDescriptor[];
}

/**
 * Returns the raw action groups for the alert-row Take Action menu.
 * Used by the menu component and the parent to guarantee `hasItems` and the rendered
 * groups always agree.
 */
export const getAlertRowActionGroups = ({
  addToCaseItems,
  addToChatItems,
  alertAssigneeItems,
  alertTagItems,
  canCreateEndpointEventFilters,
  eventFilterItems,
  exceptionItems,
  hasAgent,
  isAlert,
  osqueryItems,
  runAlertWorkflowItems,
  runDocumentWorkflowItems,
  statusItems,
}: AlertRowActionGroupsProps): EuiContextMenuPanelItemDescriptor[][] => {
  const alertManagementItems = [...alertAssigneeItems, ...addToCaseItems, ...alertTagItems];
  const responseActionItems = [
    ...(isAlert ? runAlertWorkflowItems : runDocumentWorkflowItems),
    ...(hasAgent ? osqueryItems : []),
  ];
  return isAlert
    ? [statusItems, alertManagementItems, exceptionItems, responseActionItems, addToChatItems]
    : [
        [],
        addToCaseItems,
        canCreateEndpointEventFilters ? eventFilterItems : [],
        responseActionItems,
        [],
      ];
};

interface AlertRowActionMenuProps extends AlertRowActionGroupsProps {
  panels: EuiContextMenuPanelDescriptor[];
}

export const AlertRowActionMenu = ({
  addToCaseItems,
  addToChatItems,
  alertAssigneeItems,
  alertTagItems,
  canCreateEndpointEventFilters,
  eventFilterItems,
  exceptionItems,
  hasAgent,
  isAlert,
  osqueryItems,
  panels,
  runAlertWorkflowItems,
  runDocumentWorkflowItems,
  statusItems,
}: AlertRowActionMenuProps) => {
  const items = useMemo(() => {
    const [statusRaw, ...restGroups] = getAlertRowActionGroups({
      addToCaseItems,
      addToChatItems,
      alertAssigneeItems,
      alertTagItems,
      canCreateEndpointEventFilters,
      eventFilterItems,
      exceptionItems,
      hasAgent,
      isAlert,
      osqueryItems,
      runAlertWorkflowItems,
      runDocumentWorkflowItems,
      statusItems,
    });

    return withActionIcons(
      withGroupSeparators([withStatusDotIcons(statusRaw, ALERT_STATUS_ICON_COLORS), ...restGroups]),
      ACTION_ICONS_BY_ID
    );
  }, [
    addToCaseItems,
    addToChatItems,
    alertAssigneeItems,
    alertTagItems,
    canCreateEndpointEventFilters,
    eventFilterItems,
    exceptionItems,
    hasAgent,
    isAlert,
    osqueryItems,
    runAlertWorkflowItems,
    runDocumentWorkflowItems,
    statusItems,
  ]);

  const menuPanels = useMemo<EuiContextMenuPanelDescriptor[]>(
    () => [{ id: 0, items }, ...panels],
    [items, panels]
  );

  return (
    <EuiContextMenu initialPanelId={0} panels={menuPanels} data-test-subj="actions-context-menu" />
  );
};
