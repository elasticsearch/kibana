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
import type { ExceptionListTypeEnum } from '@kbn/securitysolution-io-ts-list-types';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import { EventKind } from '../constants/event_kinds';
import type { Status } from '../../../../../common/api/detection_engine';
import { useAddToCaseActions } from '../../../../detections/components/alerts_table/timeline_actions/use_add_to_case_actions';
import { useAlertsActions } from '../../../../detections/components/alerts_table/timeline_actions/use_alerts_actions';
import { useAlertAssigneesActions } from '../../../../detections/components/alerts_table/timeline_actions/use_alert_assignees_actions';
import { useAlertTagsActions } from '../../../../detections/components/alerts_table/timeline_actions/use_alert_tags_actions';
import { useAlertExceptionActions } from '../../../../detections/components/alerts_table/timeline_actions/use_add_exception_actions';
import { useInvestigateInTimeline } from '../../../../detections/components/alerts_table/timeline_actions/use_investigate_in_timeline';
import { useIsInSecurityApp } from '../../../../common/hooks/is_in_security_app';
import { useRunAlertWorkflowPanel } from '../../../../detections/components/alerts_table/timeline_actions/use_run_alert_workflow_panel';
import { useRunDocumentWorkflowPanel } from '../../../../detections/components/alerts_table/timeline_actions/use_run_document_workflow_panel';
import type { HostIsolationAction } from '../../../../common/components/endpoint/host_isolation/from_alerts/use_host_isolation_action';
import { useHostIsolationAction } from '../../../../common/components/endpoint/host_isolation/from_alerts/use_host_isolation_action';
import { HostIsolationFlyout } from '../../../../common/components/endpoint/host_isolation/from_alerts/host_isolation_flyout';
import { useResponderActionItem } from '../../../../common/components/endpoint/responder';
import { useExploreActions } from '../hooks/use_explore_actions';
import { AddExceptionFlyoutWrapper } from '../../../../detections/components/alerts_table/timeline_actions/alert_context_menu';
import { getOsqueryActionItem } from '../../../../detections/components/osquery/osquery_action_item';
import { OsqueryFlyout } from '../../../../detections/components/osquery/osquery_flyout';
import { getAlertDetailsFieldValue } from '../../../../common/lib/endpoint/utils/get_event_details_field_values';
import { useKibana } from '../../../../common/lib/kibana';
import { getTimelineEventsDetailsFromRecord } from '../utils/get_timeline_events_details_from_record';
import type { FlyoutActionType } from '../../../../common/lib/telemetry';
import { FLYOUT_ACTION } from '../../../../common/lib/telemetry';
import { useFlyoutTelemetry } from '../../../shared/hooks/use_flyout_telemetry';
import { wrapActionTelemetry } from '../utils/wrap_action_telemetry';
import { FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID } from './test_ids';

// Maps each footer "Take action" menu item's existing `data-test-subj` to the `FlyoutActionType`
// reported when it's clicked. Kept as one flat map (rather than one per action family) since
// `wrapActionTelemetry` is applied once to the fully assembled `items` array below.
const FOOTER_ACTION_TEST_SUBJ: Partial<Record<string, FlyoutActionType>> = {
  'add-to-case-action': FLYOUT_ACTION.ADD_TO_CASE,
  'open-alert-status': FLYOUT_ACTION.STATUS_OPEN,
  'acknowledged-alert-status': FLYOUT_ACTION.STATUS_ACKNOWLEDGED,
  'alert-close-context-menu-item': FLYOUT_ACTION.STATUS_CLOSED,
  'alert-tags-context-menu-item': FLYOUT_ACTION.ADD_TAGS,
  'alert-assignees-context-menu-item': FLYOUT_ACTION.ADD_ASSIGNEES,
  'remove-alert-assignees-menu-item': FLYOUT_ACTION.REMOVE_ASSIGNEES,
  'add-endpoint-exception-menu-item': FLYOUT_ACTION.ADD_ENDPOINT_EXCEPTION,
  'add-exception-menu-item': FLYOUT_ACTION.ADD_RULE_EXCEPTION,
  'isolate-host-action-item': FLYOUT_ACTION.ISOLATE_HOST,
  'run-workflow-action': FLYOUT_ACTION.RUN_WORKFLOW,
  'run-document-workflow-action': FLYOUT_ACTION.RUN_WORKFLOW,
  'endpointResponseActions-action-item': FLYOUT_ACTION.RESPOND,
  'osquery-action-item': FLYOUT_ACTION.RUN_OSQUERY,
  'add-note-action': FLYOUT_ACTION.ADD_NOTE,
  'investigate-in-timeline-action-item': FLYOUT_ACTION.INVESTIGATE_IN_TIMELINE,
  'explore-in-alerts-or-timeline': FLYOUT_ACTION.EXPLORE,
};

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
    const { reportActionClicked } = useFlyoutTelemetry();
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
    const alertStatus = useMemo(() => getFieldValue(hit, ALERT_WORKFLOW_STATUS) as Status, [hit]);
    const isEndpointAlert = useMemo(
      () =>
        getFieldValue(hit, 'kibana.alert.original_event.module') === 'endpoint' &&
        getFieldValue(hit, 'kibana.alert.original_event.kind') === 'alert',
      [hit]
    );

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

    const [osqueryAgentId, setOsqueryAgentId] = useState<string | null>(null);

    const agentId = useMemo(
      () =>
        getAlertDetailsFieldValue(
          { category: 'agent', field: 'agent.id' },
          dataFormattedForFieldBrowser
        ),
      [dataFormattedForFieldBrowser]
    );

    const handleOnCloseOsqueryFlyout = useCallback(() => {
      setOsqueryAgentId(null);
    }, []);

    const osQueryFlyoutDefaultValues = useMemo(
      () => (isAlert ? { alertIds: [documentId] } : undefined),
      [isAlert, documentId]
    );

    const handleOnOsqueryClick = useCallback(() => {
      setOsqueryAgentId(agentId);
      closePopoverHandler();
    }, [agentId, closePopoverHandler]);

    const osqueryActionItem = useMemo(
      () =>
        getOsqueryActionItem({
          handleClick: handleOnOsqueryClick,
        }),
      [handleOnOsqueryClick]
    );

    const { osquery } = useKibana().services;
    const osqueryAvailable = osquery?.isOsqueryAvailable({
      agentId,
    });

    const [isExceptionFlyoutOpen, setIsExceptionFlyoutOpen] = useState(false);
    const [exceptionFlyoutType, setExceptionFlyoutType] = useState<ExceptionListTypeEnum | null>(
      null
    );
    const handleOpenAddRuleException = useCallback(
      (type?: ExceptionListTypeEnum) => {
        closePopoverHandler();
        setExceptionFlyoutType(type ?? null);
        setIsExceptionFlyoutOpen(true);
      },
      [closePopoverHandler]
    );
    const handleExceptionCancel = useCallback((_didRuleChange: boolean) => {
      setIsExceptionFlyoutOpen(false);
    }, []);
    const handleExceptionConfirm = useCallback(
      (_didRuleChange: boolean, didCloseAlert: boolean, didBulkCloseAlert: boolean) => {
        if (didCloseAlert || didBulkCloseAlert) {
          onAlertUpdated();
        }
        setIsExceptionFlyoutOpen(false);
      },
      [onAlertUpdated]
    );
    const { exceptionActionItems } = useAlertExceptionActions({
      isEndpointAlert,
      onAddExceptionTypeClick: handleOpenAddRuleException,
    });

    const rawItems = useMemo(
      () => [
        ...(!isRemoteDocument ? addToCaseActionItems : []),
        ...(!isRemoteDocument && isAlert ? statusActionItems : []),
        ...(!isRemoteDocument && isAlert ? alertTagsItems : []),
        ...(!isRemoteDocument && isAlert ? alertAssigneesItems : []),
        ...(!isRemoteDocument && isAlert ? exceptionActionItems : []),
        ...(!isRemoteDocument && isAlert ? hostIsolationActionItems : []),
        ...(!isRemoteDocument ? (isAlert ? runWorkflowMenuItem : documentWorkflowMenuItem) : []),
        ...(!isRemoteDocument ? endpointResponseActionsConsoleItems : []),
        ...(!isRemoteDocument && osqueryAvailable ? [osqueryActionItem] : []),
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
        exceptionActionItems,
        exploreActionItems,
        hostIsolationActionItems,
        investigateInTimelineActionItems,
        isAlert,
        isInSecurityApp,
        isRemoteDocument,
        noteItems,
        osqueryActionItem,
        osqueryAvailable,
        runWorkflowMenuItem,
        statusActionItems,
      ]
    );

    const items = useMemo(
      () => wrapActionTelemetry(rawItems, FOOTER_ACTION_TEST_SUBJ, reportActionClicked),
      [rawItems, reportActionClicked]
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
        iconType="chevronSingleDown"
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
        {osqueryAgentId && (
          <OsqueryFlyout
            agentId={osqueryAgentId}
            defaultValues={osQueryFlyoutDefaultValues}
            onClose={handleOnCloseOsqueryFlyout}
            ecsData={ecsData}
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
        {isExceptionFlyoutOpen && (
          <AddExceptionFlyoutWrapper
            hit={hit}
            exceptionListType={exceptionFlyoutType}
            onCancel={handleExceptionCancel}
            onConfirm={handleExceptionConfirm}
          />
        )}
      </>
    );
  }
);

TakeActionButton.displayName = 'TakeActionButton';
