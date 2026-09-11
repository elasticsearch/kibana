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
import type { FlyoutActionType } from '../../../../common/lib/telemetry';
import { FLYOUT_ACTION } from '../../../../common/lib/telemetry';
import {
  withActionIcon,
  withActionIcons,
  withGroupSeparators,
  withStatusDotIcons,
} from '../../../../common/utils/action_menu_items';
import { ACTION_ICONS_BY_ID } from '../../../../common/utils/action_icons';
import { ALERT_STATUS_ICON_COLORS } from '../../../../common/components/toolbar/bulk_actions/use_bulk_action_items';
import type { ReportActionClickedParams } from '../../../shared/hooks/use_flyout_telemetry';
import { wrapActionTelemetry } from '../utils/wrap_action_telemetry';
import {
  ADD_TO_CASE_ACTION_IDS,
  ALERT_ASSIGNEE_ACTION_IDS,
  ALERT_EXCEPTION_ACTION_IDS,
  ALERT_TAG_ACTION_ID,
  EXPLORE_ACTION_ID,
  INVESTIGATE_IN_TIMELINE_ACTION_ID,
  ISOLATE_HOST_ACTION_ID,
  OSQUERY_ACTION_ID,
  RESPOND_ACTION_ID,
  RUN_ALERT_WORKFLOW_ACTION_ID,
  RUN_DOCUMENT_WORKFLOW_ACTION_ID,
} from '../../../../common/constants/action_ids';

/** Subset of ActionMenuProps used to derive the visible groups (no panels or callbacks). */
export interface ActionMenuGroupsProps {
  addToCaseItems: EuiContextMenuPanelItemDescriptor[];
  alertAssigneeItems: EuiContextMenuPanelItemDescriptor[];
  alertTagItems: EuiContextMenuPanelItemDescriptor[];
  documentWorkflowItems: EuiContextMenuPanelItemDescriptor[];
  endpointResponseItems: EuiContextMenuPanelItemDescriptor[];
  exceptionItems: EuiContextMenuPanelItemDescriptor[];
  exploreItems: EuiContextMenuPanelItemDescriptor[];
  hostIsolationItems: EuiContextMenuPanelItemDescriptor[];
  investigateInTimelineItems: EuiContextMenuPanelItemDescriptor[];
  isAlert: boolean;
  isInSecurityApp: boolean;
  isRemoteDocument: boolean;
  noteItems: EuiContextMenuPanelItemDescriptor[];
  osqueryAvailable: boolean;
  osqueryItems: EuiContextMenuPanelItemDescriptor[];
  runAlertWorkflowItems: EuiContextMenuPanelItemDescriptor[];
  statusItems: EuiContextMenuPanelItemDescriptor[];
}

/**
 * Returns the raw action groups for the document flyout Take Action menu, in the order they
 * are rendered. Each entry is an array of items for one group; empty arrays are included so
 * the parent can replace its `hasItems` check with
 * `getActionGroups(props).some(g => g.length > 0)` and guarantee it always agrees with what
 * the menu actually renders.
 */
export const getActionGroups = ({
  addToCaseItems,
  alertAssigneeItems,
  alertTagItems,
  documentWorkflowItems,
  endpointResponseItems,
  exceptionItems,
  exploreItems,
  hostIsolationItems,
  investigateInTimelineItems,
  isAlert,
  isInSecurityApp,
  isRemoteDocument,
  noteItems,
  osqueryAvailable,
  osqueryItems,
  runAlertWorkflowItems,
  statusItems,
}: ActionMenuGroupsProps): EuiContextMenuPanelItemDescriptor[][] => {
  const alertManagementItems = [
    ...(!isRemoteDocument && isAlert ? alertAssigneeItems : []),
    ...(!isRemoteDocument ? addToCaseItems : []),
    ...(!isRemoteDocument && isAlert ? alertTagItems : []),
  ];
  const responseActionItems = !isRemoteDocument
    ? [
        ...(isAlert ? runAlertWorkflowItems : documentWorkflowItems),
        ...(isAlert ? hostIsolationItems : []),
        ...endpointResponseItems,
        ...(osqueryAvailable ? osqueryItems : []),
      ]
    : [];
  return [
    !isRemoteDocument && isAlert ? statusItems : [],
    alertManagementItems,
    !isRemoteDocument && isAlert ? exceptionItems : [],
    responseActionItems,
    !isRemoteDocument && !isAlert ? noteItems : [],
    isInSecurityApp ? investigateInTimelineItems : [],
    !isInSecurityApp ? exploreItems : [],
  ];
};

interface ActionMenuProps extends ActionMenuGroupsProps {
  alertAssigneePanels: EuiContextMenuPanelDescriptor[];
  alertTagPanels: EuiContextMenuPanelDescriptor[];
  reportActionClicked: (params: ReportActionClickedParams) => void;
  runAlertWorkflowPanels: EuiContextMenuPanelDescriptor[];
  runDocumentWorkflowPanels: EuiContextMenuPanelDescriptor[];
  statusPanels: EuiContextMenuPanelDescriptor[];
}

// Keyed on item.key (the stable action id), not data-test-subj.
const FOOTER_ACTIONS_BY_ID: Partial<Record<string, FlyoutActionType>> = {
  [ADD_TO_CASE_ACTION_IDS.addToCase]: FLYOUT_ACTION.ADD_TO_CASE,
  // Status items use short keys defined in ALERT_STATUS_ACTION_IDS / ALERT_CLOSE_WITH_REASON_ACTION_ID
  open: FLYOUT_ACTION.STATUS_OPEN,
  acknowledge: FLYOUT_ACTION.STATUS_ACKNOWLEDGED,
  'close-alert-with-reason': FLYOUT_ACTION.STATUS_CLOSED,
  [ALERT_TAG_ACTION_ID]: FLYOUT_ACTION.ADD_TAGS,
  [ALERT_ASSIGNEE_ACTION_IDS.assign]: FLYOUT_ACTION.ADD_ASSIGNEES,
  [ALERT_ASSIGNEE_ACTION_IDS.unassignAll]: FLYOUT_ACTION.REMOVE_ASSIGNEES,
  [ALERT_EXCEPTION_ACTION_IDS.addEndpointException]: FLYOUT_ACTION.ADD_ENDPOINT_EXCEPTION,
  [ALERT_EXCEPTION_ACTION_IDS.addRuleException]: FLYOUT_ACTION.ADD_RULE_EXCEPTION,
  [ISOLATE_HOST_ACTION_ID]: FLYOUT_ACTION.ISOLATE_HOST,
  [RUN_ALERT_WORKFLOW_ACTION_ID]: FLYOUT_ACTION.RUN_WORKFLOW,
  [RUN_DOCUMENT_WORKFLOW_ACTION_ID]: FLYOUT_ACTION.RUN_WORKFLOW,
  [RESPOND_ACTION_ID]: FLYOUT_ACTION.RESPOND,
  [OSQUERY_ACTION_ID]: FLYOUT_ACTION.RUN_OSQUERY,
  'add-note-action': FLYOUT_ACTION.ADD_NOTE,
  [INVESTIGATE_IN_TIMELINE_ACTION_ID]: FLYOUT_ACTION.INVESTIGATE_IN_TIMELINE,
  [EXPLORE_ACTION_ID]: FLYOUT_ACTION.EXPLORE,
};

export const ActionMenu = ({
  addToCaseItems,
  alertAssigneeItems,
  alertAssigneePanels,
  alertTagItems,
  alertTagPanels,
  documentWorkflowItems,
  endpointResponseItems,
  exceptionItems,
  exploreItems,
  hostIsolationItems,
  investigateInTimelineItems,
  isAlert,
  isInSecurityApp,
  isRemoteDocument,
  noteItems,
  osqueryAvailable,
  osqueryItems,
  reportActionClicked,
  runAlertWorkflowItems,
  runAlertWorkflowPanels,
  runDocumentWorkflowPanels,
  statusItems,
  statusPanels,
}: ActionMenuProps) => {
  const items = useMemo(() => {
    const [statusRaw, alertMgmt, exceptions, response, notes, timeline, explore] = getActionGroups({
      addToCaseItems,
      alertAssigneeItems,
      alertTagItems,
      documentWorkflowItems,
      endpointResponseItems,
      exceptionItems,
      exploreItems,
      hostIsolationItems,
      investigateInTimelineItems,
      isAlert,
      isInSecurityApp,
      isRemoteDocument,
      noteItems,
      osqueryAvailable,
      osqueryItems,
      runAlertWorkflowItems,
      statusItems,
    });

    const orderedItems = withGroupSeparators([
      withStatusDotIcons(statusRaw, ALERT_STATUS_ICON_COLORS),
      alertMgmt,
      exceptions,
      response,
      withActionIcon(notes, 'pencil'),
      timeline,
      explore,
    ]);

    return wrapActionTelemetry(
      withActionIcons(orderedItems, ACTION_ICONS_BY_ID),
      FOOTER_ACTIONS_BY_ID,
      reportActionClicked
    );
  }, [
    addToCaseItems,
    alertAssigneeItems,
    alertTagItems,
    documentWorkflowItems,
    endpointResponseItems,
    exceptionItems,
    exploreItems,
    hostIsolationItems,
    investigateInTimelineItems,
    isAlert,
    isInSecurityApp,
    isRemoteDocument,
    noteItems,
    osqueryAvailable,
    osqueryItems,
    reportActionClicked,
    runAlertWorkflowItems,
    statusItems,
  ]);

  const panels = useMemo(
    () => [
      ...(!isRemoteDocument && isAlert ? statusPanels : []),
      ...(!isRemoteDocument && isAlert ? alertAssigneePanels : []),
      ...(!isRemoteDocument && isAlert ? alertTagPanels : []),
      ...(!isRemoteDocument && isAlert ? runAlertWorkflowPanels : []),
      ...(!isRemoteDocument && !isAlert ? runDocumentWorkflowPanels : []),
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
