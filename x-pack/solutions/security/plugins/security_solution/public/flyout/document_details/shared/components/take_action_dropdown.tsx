/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { EuiButton, EuiPopover } from '@elastic/eui';
import type { ExceptionListTypeEnum } from '@kbn/securitysolution-io-ts-list-types';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import type { TimelineEventsDetailsItem } from '@kbn/timelines-plugin/common';
import { i18n } from '@kbn/i18n';
import { getOr } from 'lodash/fp';
import { buildDataTableRecord, getFieldValue } from '@kbn/discover-utils';
import type { EsHitRecord } from '@kbn/discover-utils';
import { isNonLocalIndexName } from '@kbn/es-query';
import type { SearchHit } from '../../../../../common/search_strategy';
import { useRunAlertWorkflowPanel } from '../../../../detections/components/alerts_table/timeline_actions/use_run_alert_workflow_panel';
import { useRunDocumentWorkflowPanel } from '../../../../detections/components/alerts_table/timeline_actions/use_run_document_workflow_panel';
import { FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID } from './test_ids';
import { getAlertDetailsFieldValue } from '../../../../common/lib/endpoint/utils/get_event_details_field_values';
import { useAlertExceptionActions } from '../../../../detections/components/alerts_table/timeline_actions/use_add_exception_actions';
import { useAlertsActions } from '../../../../detections/components/alerts_table/timeline_actions/use_alerts_actions';
import { useInvestigateInTimeline } from '../../../../detections/components/alerts_table/timeline_actions/use_investigate_in_timeline';
import { useEventFilterAction } from '../../../../detections/components/alerts_table/timeline_actions/use_event_filter_action';
import { useResponderActionItem } from '../../../../common/components/endpoint/responder';
import { useHostIsolationAction } from '../../../../common/components/endpoint/host_isolation';
import type { HostIsolationAction } from '../../../../common/components/endpoint/host_isolation/from_alerts/use_host_isolation_action';
import type { Status } from '../../../../../common/api/detection_engine';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { useAddToCaseActions } from '../../../../detections/components/alerts_table/timeline_actions/use_add_to_case_actions';
import { useKibana } from '../../../../common/lib/kibana';
import { getOsqueryActionItem } from '../../../../detections/components/osquery/osquery_action_item';
import { useAlertTagsActions } from '../../../../detections/components/alerts_table/timeline_actions/use_alert_tags_actions';
import { useAlertAssigneesActions } from '../../../../detections/components/alerts_table/timeline_actions/use_alert_assignees_actions';
import { DocumentDetailsActionMenu, getDocumentActionGroups } from './document_details_action_menu';

const TAKE_ACTION = i18n.translate('xpack.securitySolution.flyout.footer.takeActionButtonLabel', {
  defaultMessage: 'Take action',
});

export interface AlertSummaryData {
  /**
   * Status of the alert (open, closed...)
   */
  alertStatus: Status;
  /**
   * Id of the document
   */
  eventId: string;
  /**
   * Type of document (event, signal, alert...)
   */
  eventKind: string;
  /**
   * Id of the rule
   */
  ruleId: string;
  /**
   * Name of the rule
   */
  ruleName: string;
}

export interface TakeActionDropdownProps {
  /**
   * An array of field objects with category and value
   */
  dataFormattedForFieldBrowser: TimelineEventsDetailsItem[] | null;
  /**
   * The actual raw document object
   */
  dataAsNestedObject: Ecs;
  /**
   * Callback called when the popover closes
   */
  handleOnEventClosed: () => void;
  /**
   * Callback to let parent know when the user interacts with the exception panel
   */
  onAddIsolationStatusClick: (action: HostIsolationAction) => void;
  /**
   * Callback to let parent know when the user interacts with event filter
   */
  onAddEventFilterClick: () => void;
  /**
   * Callback to let parent know when the user interacts with the exception panel
   */
  onAddExceptionTypeClick: (type?: ExceptionListTypeEnum) => void;
  /**
   * Callback to let parent know when the user interacts with the osquery panel
   */
  onOsqueryClick: (id: string) => void;
  /**
   * Callback to refetch the data (from timeline query or global query)
   */
  refetch: (() => void) | undefined;
  /**
   * Callback to refetch the document
   */
  refetchFlyoutData: () => Promise<void>;
  /**
   * Maintain backwards compatibility // TODO remove when possible
   */
  scopeId: string;
  /**
   * The raw ES search hit containing the full document source
   */
  searchHit: SearchHit;
}

/**
 * Take action button with dropdown used to show all the options available to the user on a document rendered in the expandable flyout
 */
export const TakeActionDropdown = memo(
  ({
    dataFormattedForFieldBrowser,
    dataAsNestedObject,
    handleOnEventClosed,
    onAddEventFilterClick,
    onAddExceptionTypeClick,
    onAddIsolationStatusClick,
    refetch,
    refetchFlyoutData,
    onOsqueryClick,
    scopeId,
    searchHit,
  }: TakeActionDropdownProps) => {
    // popover interaction
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const togglePopoverHandler = useCallback(() => {
      setIsPopoverOpen(!isPopoverOpen);
    }, [isPopoverOpen]);
    const closePopoverHandler = useCallback(() => {
      setIsPopoverOpen(false);
    }, []);
    const onMenuItemClick = useCallback(() => {
      closePopoverHandler();
    }, [closePopoverHandler]);
    const closePopoverAndFlyout = useCallback(() => {
      handleOnEventClosed();
      setIsPopoverOpen(false);
    }, [handleOnEventClosed]);

    const alertSummaryData = useMemo(
      () =>
        [
          { category: 'kibana', field: 'kibana.alert.rule.uuid', name: 'ruleId' },
          { category: 'kibana', field: 'kibana.alert.rule.name', name: 'ruleName' },
          { category: 'kibana', field: 'kibana.alert.workflow_status', name: 'alertStatus' },
          { category: 'event', field: 'event.kind', name: 'eventKind' },
          { category: '_id', field: '_id', name: 'eventId' },
        ].reduce<AlertSummaryData>(
          (acc, curr) => ({
            ...acc,
            [curr.name]: getAlertDetailsFieldValue(
              { category: curr.category, field: curr.field },
              dataFormattedForFieldBrowser
            ),
          }),
          {} as AlertSummaryData
        ),
      [dataFormattedForFieldBrowser]
    );

    const hit = useMemo(
      () => buildDataTableRecord(searchHit as unknown as EsHitRecord),
      [searchHit]
    );

    const isRemoteDocument = useMemo(
      () => isNonLocalIndexName(hit.raw._index ?? (getFieldValue(hit, '_index') as string) ?? ''),
      [hit]
    );

    const isEvent = alertSummaryData.eventKind === 'event';
    const isAlert = alertSummaryData.eventKind === 'signal';

    const isAgentEndpoint = useMemo(
      () => dataAsNestedObject?.agent?.type?.includes('endpoint'),
      [dataAsNestedObject]
    );

    const isAlertSourceEndpoint = useMemo(() => {
      const eventModules = getOr([], 'kibana.alert.original_event.module', dataAsNestedObject);
      const kinds = getOr([], 'kibana.alert.original_event.kind', dataAsNestedObject);

      return eventModules.includes('endpoint') && kinds.includes('alert');
    }, [dataAsNestedObject]);

    // host isolation interaction
    const handleOnAddIsolationStatusClick = useCallback(
      (action: HostIsolationAction) => {
        onAddIsolationStatusClick(action);
        setIsPopoverOpen(false);
      },
      [onAddIsolationStatusClick]
    );
    const hostIsolationActionItems = useHostIsolationAction({
      closePopover: closePopoverHandler,
      detailsData: dataFormattedForFieldBrowser,
      onAddIsolationStatusClick: handleOnAddIsolationStatusClick,
    });

    // exception interaction
    const handleOnAddExceptionTypeClick = useCallback(
      (type?: ExceptionListTypeEnum) => {
        onAddExceptionTypeClick(type);
        setIsPopoverOpen(false);
      },
      [onAddExceptionTypeClick]
    );
    const { exceptionActionItems } = useAlertExceptionActions({
      isEndpointAlert: isAlertSourceEndpoint,
      onAddExceptionTypeClick: handleOnAddExceptionTypeClick,
    });

    // event filter interaction
    const handleOnAddEventFilterClick = useCallback(() => {
      onAddEventFilterClick();
      setIsPopoverOpen(false);
    }, [onAddEventFilterClick]);
    const { eventFilterActionItems } = useEventFilterAction({
      onAddEventFilterClick: handleOnAddEventFilterClick,
    });
    const { loading: endpointPrivilegesLoading, canWriteEventFilters } =
      useUserPrivileges().endpointPrivileges;
    const isEndpointEvent = useMemo(() => isEvent && isAgentEndpoint, [isEvent, isAgentEndpoint]);
    const canCreateEndpointEventFilters = useMemo(
      () => !endpointPrivilegesLoading && canWriteEventFilters,
      [canWriteEventFilters, endpointPrivilegesLoading]
    );

    // alert status interaction
    const { actionItems: statusActionItems, panels: statusActionPanels } = useAlertsActions({
      alertStatus: alertSummaryData.alertStatus,
      closePopover: closePopoverAndFlyout,
      eventId: alertSummaryData.eventId,
      refetch,
      scopeId,
    });

    // alert tagging interation
    const { alertTagsItems, alertTagsPanels } = useAlertTagsActions({
      closePopover: closePopoverHandler,
      ecsRowData: dataAsNestedObject ?? { _id: alertSummaryData.eventId },
      refetch,
    });

    // assignee interaction
    const onAssigneesUpdate = useCallback(() => {
      if (refetch) {
        refetch();
      }
      if (refetchFlyoutData) {
        refetchFlyoutData();
      }
    }, [refetch, refetchFlyoutData]);
    const { alertAssigneesItems, alertAssigneesPanels } = useAlertAssigneesActions({
      closePopover: closePopoverHandler,
      ecsRowData: dataAsNestedObject ?? { _id: alertSummaryData.eventId },
      refetch: onAssigneesUpdate,
    });

    // timeline interaction
    const { investigateInTimelineActionItems } = useInvestigateInTimeline({
      ecsRowData: dataAsNestedObject,
      onInvestigateInTimelineAlertClick: closePopoverHandler,
    });

    // osquery interaction
    const osqueryAgentId = useMemo(
      () =>
        getAlertDetailsFieldValue(
          { category: 'agent', field: 'agent.id' },
          dataFormattedForFieldBrowser
        ),
      [dataFormattedForFieldBrowser]
    );
    const handleOnOsqueryClick = useCallback(() => {
      onOsqueryClick(osqueryAgentId);
      setIsPopoverOpen(false);
    }, [onOsqueryClick, setIsPopoverOpen, osqueryAgentId]);
    const osqueryActionItem = useMemo(
      () =>
        getOsqueryActionItem({
          handleClick: handleOnOsqueryClick,
        }),
      [handleOnOsqueryClick]
    );
    const osqueryItemsArray = useMemo(() => [osqueryActionItem], [osqueryActionItem]);
    const { osquery } = useKibana().services;
    const osqueryAvailable = osquery?.isOsqueryAvailable({
      agentId: osqueryAgentId,
    });

    const { addToCaseActionItems } = useAddToCaseActions({
      ecsData: dataAsNestedObject,
      nonEcsData:
        dataFormattedForFieldBrowser?.map((d) => ({ field: d.field, value: d.values })) ?? [],
      onMenuItemClick,
      onSuccess: refetchFlyoutData,
      refetch,
    });

    // responder action items
    const endpointResponseActionsConsoleItems = useResponderActionItem(
      dataFormattedForFieldBrowser,
      closePopoverHandler
    );

    const { runWorkflowMenuItem: alertWorkflowMenuItem, runAlertWorkflowPanel } =
      useRunAlertWorkflowPanel({
        closePopover: closePopoverHandler,
        ecsRowData: dataAsNestedObject,
      });

    const documents = useMemo(
      () => [
        {
          _id: dataAsNestedObject._id,
          _index: dataAsNestedObject._index ?? '',
          ...(searchHit?._source ?? {}),
        },
      ],
      [dataAsNestedObject._id, dataAsNestedObject._index, searchHit]
    );

    const { runWorkflowMenuItem: documentWorkflowMenuItem, runDocumentWorkflowPanel } =
      useRunDocumentWorkflowPanel({
        closePopover: closePopoverHandler,
        documents,
      });

    const showAlertActions = !isEvent && Boolean(alertSummaryData.ruleId);
    const showEventFilter = Boolean(
      !showAlertActions && isEndpointEvent && canCreateEndpointEventFilters
    );
    const osqueryAvailableFlag = Boolean(osqueryAvailable);
    const hasItems = useMemo(
      () =>
        getDocumentActionGroups({
          addToCaseItems: addToCaseActionItems,
          alertAssigneeItems: alertAssigneesItems,
          alertTagItems: alertTagsItems,
          documentWorkflowItems: documentWorkflowMenuItem,
          endpointResponseItems: endpointResponseActionsConsoleItems,
          eventFilterItems: eventFilterActionItems,
          exceptionItems: exceptionActionItems,
          hostIsolationItems: hostIsolationActionItems,
          investigateInTimelineItems: investigateInTimelineActionItems,
          isAlert,
          isRemoteDocument,
          osqueryAvailable: osqueryAvailableFlag,
          osqueryItems: osqueryItemsArray,
          runAlertWorkflowItems: alertWorkflowMenuItem,
          showAlertActions,
          showEventFilter,
          statusItems: statusActionItems,
        }).some((group) => group.length > 0),
      [
        addToCaseActionItems,
        alertAssigneesItems,
        alertTagsItems,
        documentWorkflowMenuItem,
        endpointResponseActionsConsoleItems,
        eventFilterActionItems,
        exceptionActionItems,
        hostIsolationActionItems,
        investigateInTimelineActionItems,
        isAlert,
        isRemoteDocument,
        osqueryAvailableFlag,
        osqueryItemsArray,
        alertWorkflowMenuItem,
        showAlertActions,
        showEventFilter,
        statusActionItems,
      ]
    );

    const takeActionButton = useMemo(
      () => (
        <EuiButton
          data-test-subj={FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID}
          fill
          iconSide="right"
          iconType="chevronSingleDown"
          onClick={togglePopoverHandler}
        >
          {TAKE_ACTION}
        </EuiButton>
      ),

      [togglePopoverHandler]
    );

    return hasItems && dataAsNestedObject ? (
      <EuiPopover
        id="AlertTakeActionPanel"
        aria-label={TAKE_ACTION}
        button={takeActionButton}
        isOpen={isPopoverOpen}
        closePopover={closePopoverHandler}
        panelPaddingSize="none"
        anchorPosition="downLeft"
        repositionOnScroll
      >
        <DocumentDetailsActionMenu
          addToCaseItems={addToCaseActionItems}
          alertAssigneeItems={alertAssigneesItems}
          alertAssigneePanels={alertAssigneesPanels}
          alertTagItems={alertTagsItems}
          alertTagPanels={alertTagsPanels}
          documentWorkflowItems={documentWorkflowMenuItem}
          endpointResponseItems={endpointResponseActionsConsoleItems}
          eventFilterItems={eventFilterActionItems}
          exceptionItems={exceptionActionItems}
          hostIsolationItems={hostIsolationActionItems}
          investigateInTimelineItems={investigateInTimelineActionItems}
          isAlert={isAlert}
          isRemoteDocument={isRemoteDocument}
          osqueryAvailable={Boolean(osqueryAvailable)}
          osqueryItems={osqueryItemsArray}
          runAlertWorkflowItems={alertWorkflowMenuItem}
          runAlertWorkflowPanels={runAlertWorkflowPanel}
          runDocumentWorkflowPanels={runDocumentWorkflowPanel}
          showAlertActions={showAlertActions}
          showEventFilter={showEventFilter}
          statusItems={statusActionItems}
          statusPanels={statusActionPanels}
        />
      </EuiPopover>
    ) : null;
  }
);

TakeActionDropdown.displayName = 'TakeActionDropdown';
