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
} from '../../../../common/utils/action_menu_items';
import { ACTION_ICONS_BY_ID } from '../../../../common/utils/action_icons';
import { ALERT_STATUS_ICON_COLORS } from '../../../../common/components/toolbar/bulk_actions/use_bulk_action_items';

/** Subset of DocumentDetailsActionMenuProps needed to derive the visible groups. */
export interface DocumentActionMenuGroupsProps {
  addToCaseItems: EuiContextMenuPanelItemDescriptor[];
  alertAssigneeItems: EuiContextMenuPanelItemDescriptor[];
  alertTagItems: EuiContextMenuPanelItemDescriptor[];
  documentWorkflowItems: EuiContextMenuPanelItemDescriptor[];
  endpointResponseItems: EuiContextMenuPanelItemDescriptor[];
  eventFilterItems: EuiContextMenuPanelItemDescriptor[];
  exceptionItems: EuiContextMenuPanelItemDescriptor[];
  hostIsolationItems: EuiContextMenuPanelItemDescriptor[];
  investigateInTimelineItems: EuiContextMenuPanelItemDescriptor[];
  isAlert: boolean;
  isRemoteDocument: boolean;
  osqueryAvailable: boolean;
  osqueryItems: EuiContextMenuPanelItemDescriptor[];
  runAlertWorkflowItems: EuiContextMenuPanelItemDescriptor[];
  showAlertActions: boolean;
  showEventFilter: boolean;
  statusItems: EuiContextMenuPanelItemDescriptor[];
}

/**
 * Returns the raw action groups for the document details flyout Take Action menu.
 * Used by the menu component and the parent to guarantee `hasItems` and the rendered
 * groups always agree.
 */
export const getDocumentActionGroups = ({
  addToCaseItems,
  alertAssigneeItems,
  alertTagItems,
  documentWorkflowItems,
  endpointResponseItems,
  eventFilterItems,
  exceptionItems,
  hostIsolationItems,
  investigateInTimelineItems,
  isAlert,
  isRemoteDocument,
  osqueryAvailable,
  osqueryItems,
  runAlertWorkflowItems,
  showAlertActions,
  showEventFilter,
  statusItems,
}: DocumentActionMenuGroupsProps): EuiContextMenuPanelItemDescriptor[][] => {
  if (isRemoteDocument) {
    // Keep the same 5-tuple shape so callers can destructure unconditionally.
    return [[], [], [], [], investigateInTimelineItems];
  }
  const alertManagementItems = [
    ...(showAlertActions ? alertAssigneeItems : []),
    ...addToCaseItems,
    ...(showAlertActions ? alertTagItems : []),
  ];
  const exceptionActionItems = showAlertActions
    ? exceptionItems
    : showEventFilter
    ? eventFilterItems
    : [];
  const responseActionItems = [
    ...(isAlert ? runAlertWorkflowItems : documentWorkflowItems),
    ...hostIsolationItems,
    ...endpointResponseItems,
    ...(osqueryAvailable ? osqueryItems : []),
  ];
  return [
    showAlertActions ? statusItems : [],
    alertManagementItems,
    exceptionActionItems,
    responseActionItems,
    investigateInTimelineItems,
  ];
};

interface DocumentDetailsActionMenuProps extends DocumentActionMenuGroupsProps {
  alertAssigneePanels: EuiContextMenuPanelDescriptor[];
  alertTagPanels: EuiContextMenuPanelDescriptor[];
  runAlertWorkflowPanels: EuiContextMenuPanelDescriptor[];
  runDocumentWorkflowPanels: EuiContextMenuPanelDescriptor[];
  statusPanels: EuiContextMenuPanelDescriptor[];
}

export const DocumentDetailsActionMenu = ({
  addToCaseItems,
  alertAssigneeItems,
  alertAssigneePanels,
  alertTagItems,
  alertTagPanels,
  documentWorkflowItems,
  endpointResponseItems,
  eventFilterItems,
  exceptionItems,
  hostIsolationItems,
  investigateInTimelineItems,
  isAlert,
  isRemoteDocument,
  osqueryAvailable,
  osqueryItems,
  runAlertWorkflowItems,
  runAlertWorkflowPanels,
  runDocumentWorkflowPanels,
  showAlertActions,
  showEventFilter,
  statusItems,
  statusPanels,
}: DocumentDetailsActionMenuProps) => {
  const items = useMemo(() => {
    const rawGroups = getDocumentActionGroups({
      addToCaseItems,
      alertAssigneeItems,
      alertTagItems,
      documentWorkflowItems,
      endpointResponseItems,
      eventFilterItems,
      exceptionItems,
      hostIsolationItems,
      investigateInTimelineItems,
      isAlert,
      isRemoteDocument,
      osqueryAvailable,
      osqueryItems,
      runAlertWorkflowItems,
      showAlertActions,
      showEventFilter,
      statusItems,
    });

    const [statusRaw, alertMgmt, exceptions, response, timeline] = rawGroups;
    return withActionIcons(
      withGroupSeparators([
        withStatusDotIcons(statusRaw, ALERT_STATUS_ICON_COLORS),
        alertMgmt,
        exceptions,
        response,
        timeline,
      ]),
      ACTION_ICONS_BY_ID
    );
  }, [
    addToCaseItems,
    alertAssigneeItems,
    alertTagItems,
    documentWorkflowItems,
    endpointResponseItems,
    eventFilterItems,
    exceptionItems,
    hostIsolationItems,
    investigateInTimelineItems,
    isAlert,
    isRemoteDocument,
    osqueryAvailable,
    osqueryItems,
    runAlertWorkflowItems,
    showAlertActions,
    showEventFilter,
    statusItems,
  ]);

  const panels = useMemo(
    () => [
      ...(!isRemoteDocument ? alertTagPanels : []),
      ...(!isRemoteDocument ? (isAlert ? runAlertWorkflowPanels : runDocumentWorkflowPanels) : []),
      ...(!isRemoteDocument ? alertAssigneePanels : []),
      ...(!isRemoteDocument ? statusPanels : []),
    ],
    [
      alertAssigneePanels,
      alertTagPanels,
      isAlert,
      isRemoteDocument,
      runAlertWorkflowPanels,
      runDocumentWorkflowPanels,
      statusPanels,
    ]
  );

  const menuPanels = useMemo<EuiContextMenuPanelDescriptor[]>(
    () => [{ id: 0, items }, ...panels],
    [items, panels]
  );

  return (
    <EuiContextMenu initialPanelId={0} panels={menuPanels} data-test-subj="takeActionPanelMenu" />
  );
};
