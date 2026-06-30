/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { EuiButton, EuiContextMenu, EuiPopover } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';
import { isNonLocalIndexName } from '@kbn/es-query';
import { ALERT_WORKFLOW_STATUS, EVENT_KIND } from '@kbn/rule-data-utils';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import { EventKind } from '../constants/event_kinds';
import type { Status } from '../../../../../common/api/detection_engine';
import { useAddToCaseActions } from '../../../../detections/components/alerts_table/timeline_actions/use_add_to_case_actions';
import { useAlertsActions } from '../../../../detections/components/alerts_table/timeline_actions/use_alerts_actions';
import { useAlertAssigneesActions } from '../../../../detections/components/alerts_table/timeline_actions/use_alert_assignees_actions';
import { useAlertTagsActions } from '../../../../detections/components/alerts_table/timeline_actions/use_alert_tags_actions';
import { useInvestigateInTimeline } from '../../../../detections/components/alerts_table/timeline_actions/use_investigate_in_timeline';
import { useIsInSecurityApp } from '../../../../common/hooks/is_in_security_app';
import { useRunAlertWorkflowPanel } from '../../../../detections/components/alerts_table/timeline_actions/use_run_alert_workflow_panel';
import { useRunDocumentWorkflowPanel } from '../../../../detections/components/alerts_table/timeline_actions/use_run_document_workflow_panel';
import type { HostIsolationAction } from '../../../../common/components/endpoint/host_isolation/from_alerts/use_host_isolation_action';
import { useHostIsolationAction } from '../../../../common/components/endpoint/host_isolation/from_alerts/use_host_isolation_action';
import { HostIsolationFlyout } from '../../../../common/components/endpoint/host_isolation/from_alerts/host_isolation_flyout';
import { useResponderActionItem } from '../../../../common/components/endpoint/responder';
import { useExploreActions } from '../hooks/use_explore_actions';
import { getTimelineEventsDetailsFromRecord } from '../utils/get_timeline_events_details_from_record';
import { FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID } from './test_ids';

const TAKE_ACTION = i18n.translate('xpack.securitySolution.flyoutV2.footer.takeActionButtonLabel', {
  defaultMessage: 'Take action',
});

const TAKE_ACTION_MENU = i18n.translate(
  'xpack.securitySolution.flyoutV2.footer.takeActionMenuLabel',
  {
    defaultMessage: 'Take action menu',
  }
);

const ADD_NOTE = i18n.translate('xpack.securitySolution.flyoutV2.footer.takeAction.addNoteLabel', {
  defaultMessage: 'Add note',
});

export interface TakeActionButtonProps {
  /**
   * The raw document record, used to extract alert metadata
   */
  hit: DataTableRecord;
  /**
   * ECS data for the document
   */
  ecsData: Ecs;
  /**
   * Callback to refetch flyout data
   */
  refetchFlyoutData: () => Promise<void>;
  /**
   * Callback invoked after alert mutations to refresh flyout data.
   */
  onAlertUpdated: () => void;
  /**
   * Callback to open the notes flyout. Shown in the dropdown only for raw events (not alerts).
   */
  onShowNotes: () => void;
}

/**
 * Take action button with dropdown used to show all the options available to the user on a document rendered in the expandable flyout
 * // TODO: refactor all actions to take a DataTableRecord as input.
 */
export const TakeActionButton = memo(
  ({ hit, ecsData, refetchFlyoutData, onAlertUpdated, onShowNotes }: TakeActionButtonProps) => {
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const togglePopoverHandler = useCallback(() => setIsPopoverOpen((open) => !open), []);
    const closePopoverHandler = useCallback(() => setIsPopoverOpen(false), []);
    const [isolateAction, setIsolateAction] = useState<HostIsolationAction | null>(null);

    const isInSecurityApp = useIsInSecurityApp();

    const documentId = hit.raw._id ?? '';
    const isRemoteDocument = useMemo(
      () => isNonLocalIndexName(hit.raw._index ?? (getFieldValue(hit, '_index') as string) ?? ''),
      [hit]
    );
    const isAlert = useMemo(
      () => (getFieldValue(hit, EVENT_KIND) as string) === EventKind.signal,
      [hit]
    );
    const alertStatus = useMemo(() => {
      const rawStatus = getFieldValue(hit, ALERT_WORKFLOW_STATUS);
      return (Array.isArray(rawStatus) ? rawStatus[0] : rawStatus) as Status;
    }, [hit]);

    const dataFormattedForFieldBrowser = useMemo(
      () => getTimelineEventsDetailsFromRecord(hit),
      [hit]
    );

    const nonEcsData = useMemo(
      () => dataFormattedForFieldBrowser.map((d) => ({ field: d.field, value: d.values ?? null })),
      [dataFormattedForFieldBrowser]
    );

    const hostIsolationActionItems = useHostIsolationAction({
      closePopover: closePopoverHandler,
      detailsData: dataFormattedForFieldBrowser,
      onAddIsolationStatusClick: setIsolateAction,
    });

    const { addToCaseActionItems } = useAddToCaseActions({
      ecsData,
      nonEcsData,
      onMenuItemClick: closePopoverHandler,
      onSuccess: refetchFlyoutData,
    });

    const { actionItems: statusActionItems, panels: statusActionPanels } = useAlertsActions({
      alertStatus,
      closePopover: closePopoverHandler,
      eventId: documentId,
      scopeId: '',
      refetch: onAlertUpdated,
    });

    const { alertTagsItems, alertTagsPanels } = useAlertTagsActions({
      closePopover: closePopoverHandler,
      ecsRowData: ecsData,
      refetch: onAlertUpdated,
    });

    const onAssigneesUpdate = useCallback(() => {
      onAlertUpdated();
      refetchFlyoutData();
    }, [onAlertUpdated, refetchFlyoutData]);

    const { alertAssigneesItems, alertAssigneesPanels } = useAlertAssigneesActions({
      closePopover: closePopoverHandler,
      ecsRowData: ecsData,
      refetch: onAssigneesUpdate,
    });

    const { investigateInTimelineActionItems } = useInvestigateInTimeline({
      ecsRowData: ecsData,
      onInvestigateInTimelineAlertClick: closePopoverHandler,
    });

    const noteItems = useMemo(
      () => [
        {
          'data-test-subj': 'add-note-action',
          key: 'add-note-action',
          name: ADD_NOTE,
          onClick: () => {
            closePopoverHandler();
            onShowNotes();
          },
        },
      ],
      [closePopoverHandler, onShowNotes]
    );

    const { runWorkflowMenuItem, runAlertWorkflowPanel } = useRunAlertWorkflowPanel({
      ecsRowData: ecsData,
      closePopover: closePopoverHandler,
    });

    const { runWorkflowMenuItem: documentWorkflowMenuItem, runDocumentWorkflowPanel } =
      useRunDocumentWorkflowPanel({
        closePopover: closePopoverHandler,
        documents: [
          {
            _id: documentId,
            _index: hit.raw._index ?? '',
            ...hit.flattened,
          },
        ],
      });

    const { exploreActionItems } = useExploreActions({
      hit,
      closePopover: closePopoverHandler,
    });

    const endpointResponseActionsConsoleItems = useResponderActionItem(
      dataFormattedForFieldBrowser,
      closePopoverHandler
    );

    const items = useMemo(
      () => [
        ...(!isRemoteDocument ? addToCaseActionItems : []),
        ...(!isRemoteDocument && isAlert ? statusActionItems : []),
        ...(!isRemoteDocument && isAlert ? alertTagsItems : []),
        ...(!isRemoteDocument && isAlert ? alertAssigneesItems : []),
        ...(!isRemoteDocument && isAlert ? hostIsolationActionItems : []),
        ...(!isRemoteDocument ? (isAlert ? runWorkflowMenuItem : documentWorkflowMenuItem) : []),
        ...(!isRemoteDocument ? endpointResponseActionsConsoleItems : []),
        ...(!isRemoteDocument && !isAlert ? noteItems : []),
        ...(isInSecurityApp ? investigateInTimelineActionItems : []),
        ...(!isInSecurityApp ? exploreActionItems : []),
      ],
      [
        addToCaseActionItems,
        alertAssigneesItems,
        alertTagsItems,
        documentWorkflowMenuItem,
        endpointResponseActionsConsoleItems,
        exploreActionItems,
        hostIsolationActionItems,
        investigateInTimelineActionItems,
        isAlert,
        isInSecurityApp,
        isRemoteDocument,
        noteItems,
        runWorkflowMenuItem,
        statusActionItems,
      ]
    );

    const panels = useMemo(
      () => [
        { id: 0, items },
        ...(!isRemoteDocument && isAlert ? statusActionPanels : []),
        ...(!isRemoteDocument && isAlert ? alertAssigneesPanels : []),
        ...(!isRemoteDocument && isAlert ? alertTagsPanels : []),
        ...(!isRemoteDocument ? (isAlert ? runAlertWorkflowPanel : runDocumentWorkflowPanel) : []),
      ],
      [
        alertAssigneesPanels,
        alertTagsPanels,
        isAlert,
        isRemoteDocument,
        items,
        runAlertWorkflowPanel,
        runDocumentWorkflowPanel,
        statusActionPanels,
      ]
    );

    const takeActionButton = (
      <EuiButton
        data-test-subj={FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID}
        fill
        iconSide="right"
        iconType="arrowDown"
        isDisabled={items.length === 0}
        onClick={togglePopoverHandler}
      >
        {TAKE_ACTION}
      </EuiButton>
    );

    return (
      <>
        {isolateAction !== null && (
          <HostIsolationFlyout
            hit={hit}
            detailsData={dataFormattedForFieldBrowser}
            isolateAction={isolateAction}
            onClose={() => setIsolateAction(null)}
          />
        )}
        <EuiPopover
          id="AlertTakeActionPanel"
          aria-label={TAKE_ACTION_MENU}
          button={takeActionButton}
          isOpen={isPopoverOpen}
          closePopover={closePopoverHandler}
          panelPaddingSize="none"
          anchorPosition="downLeft"
          repositionOnScroll
        >
          <EuiContextMenu initialPanelId={0} panels={panels} data-test-subj="takeActionPanelMenu" />
        </EuiPopover>
      </>
    );
  }
);

TakeActionButton.displayName = 'TakeActionButton';
