/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';

import { EuiButtonIcon, EuiPopover, EuiToolTip } from '@elastic/eui';
import { indexOf } from 'lodash';
import { useSelector } from 'react-redux-v7';
import { ExceptionListTypeEnum } from '@kbn/securitysolution-io-ts-list-types';
import { get, getOr } from 'lodash/fp';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import { TableId } from '@kbn/securitysolution-data-table';
import { flattenObject } from '@kbn/object-utils';
import { buildDataTableRecord, getFieldValue } from '@kbn/discover-utils';
import type { DataTableRecord, EsHitRecord } from '@kbn/discover-utils';
import { ALERT_RULE_UUID, ALERT_WORKFLOW_STATUS } from '@kbn/rule-data-utils';
import { useRunAlertWorkflowPanel } from './use_run_alert_workflow_panel';
import { useRunDocumentWorkflowPanel } from './use_run_document_workflow_panel';
import { EndpointExceptionsFlyout } from '../../../../management/pages/endpoint_exceptions/view/components/endpoint_exceptions_flyout';
import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';
import { useRuleWithFallback } from '../../../../detection_engine/rule_management/logic/use_rule_with_fallback';
import { DEFAULT_ACTION_BUTTON_WIDTH } from '../../../../common/components/header_actions';
import { isActiveTimeline } from '../../../../helpers';
import { useOsqueryContextActionItem } from '../../osquery/use_osquery_context_action_item';
import { OsqueryFlyout } from '../../osquery/osquery_flyout';
import { buildGetAlertByIdQuery } from '../../../../detection_engine/rule_exceptions/utils/helpers';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { EventsTdContent } from '../../../../timelines/components/timeline/styles';
import type { AddExceptionFlyoutProps } from '../../../../detection_engine/rule_exceptions/components/add_exception_flyout';
import { AddExceptionFlyout } from '../../../../detection_engine/rule_exceptions/components/add_exception_flyout';
import * as i18n from '../translations';
import type { inputsModel, State } from '../../../../common/store';
import { inputsSelectors } from '../../../../common/store';
import type { AlertData, EcsHit } from '../../../../detection_engine/rule_exceptions/utils/types';
import { useQueryAlerts } from '../../../containers/detection_engine/alerts/use_query';
import { ALERTS_QUERY_NAMES } from '../../../containers/detection_engine/alerts/constants';
import { useSignalIndex } from '../../../containers/detection_engine/alerts/use_signal_index';
import { EventFiltersFlyout } from '../../../../management/pages/event_filters/view/components/event_filters_flyout';
import { useAlertsActions } from './use_alerts_actions';
import { useExceptionFlyout } from './use_add_exception_flyout';
import { useAlertExceptionActions } from './use_add_exception_actions';
import { useEventFilterModal } from './use_event_filter_modal';
import { TimelineId } from '../../../../../common/types/timeline';
import type { Status } from '../../../../../common/api/detection_engine';
import { ATTACH_ALERT_TO_CASE_FOR_ROW } from '../../../../timelines/components/timeline/body/translations';
import { selectTimelineById } from '../../../../timelines/store/selectors';
import { useEventFilterAction } from './use_event_filter_action';
import { useAddToCaseActions } from './use_add_to_case_actions';
import { useAlertTagsActions } from './use_alert_tags_actions';
import { useAlertAssigneesActions } from './use_alert_assignees_actions';
import { useAddToChatAction } from './use_add_to_chat_action';
import { timelineDefaults } from '../../../../timelines/store/defaults';
import { AlertRowActionMenu, getAlertRowActionGroups } from './action_menu/alert_row_action_menu';

interface AlertContextMenuProps {
  ariaLabel?: string;
  ariaRowindex: number;
  columnValues: string;
  isRemoteDocument: boolean;
  ecsRowData: Ecs;
  onRuleChange?: () => void;
  scopeId: string;
  refetch: (() => void) | undefined;
}

const AlertContextMenuComponent: React.FC<AlertContextMenuProps> = ({
  ariaLabel = i18n.MORE_ACTIONS,
  ariaRowindex,
  columnValues,
  isRemoteDocument,
  ecsRowData,
  onRuleChange,
  scopeId,
  refetch,
}) => {
  const [isPopoverOpen, setPopover] = useState(false);
  const [isOsqueryFlyoutOpen, setOsqueryFlyoutOpen] = useState(false);

  const onMenuItemClick = useCallback(() => {
    setPopover(false);
  }, []);
  const { activeTab } = useSelector(
    (state: State) => selectTimelineById(state, TimelineId.active) ?? timelineDefaults
  );
  const getGlobalQueries = useMemo(() => inputsSelectors.globalQuery(), []);
  const getTimelineQuery = useMemo(() => inputsSelectors.timelineQueryByIdSelectorFactory(), []);
  const globalQuery = useSelector((state: State) => getGlobalQueries(state));
  const timelineQuery = useSelector((state: State) =>
    getTimelineQuery(state, `${TimelineId.active}-${activeTab}`)
  );

  const getAlertId = () => (ecsRowData?.kibana?.alert ? ecsRowData?._id : null);
  const alertId = getAlertId();
  const ruleId = get(0, ecsRowData?.kibana?.alert?.rule?.uuid);

  const flattenedEcsData = useMemo(() => {
    const flattened = flattenObject(ecsRowData);
    return Object.entries(flattened).map(([key, value]) => ({
      field: key,
      value: value as string[],
    }));
  }, [ecsRowData]);

  const { addToCaseActionItems } = useAddToCaseActions({
    ecsData: ecsRowData,
    nonEcsData: flattenedEcsData,
    onMenuItemClick,
    ariaLabel: ATTACH_ALERT_TO_CASE_FOR_ROW({ ariaRowindex, columnValues }),
    refetch,
  });

  const { loading: endpointPrivilegesLoading, canWriteEventFilters } =
    useUserPrivileges().endpointPrivileges;
  const canCreateEndpointEventFilters = useMemo(
    () => !endpointPrivilegesLoading && canWriteEventFilters,
    [canWriteEventFilters, endpointPrivilegesLoading]
  );

  const alertStatus = get(0, ecsRowData?.kibana?.alert?.workflow_status) as Status | undefined;

  const isEvent = useMemo(() => indexOf(ecsRowData.event?.kind, 'event') !== -1, [ecsRowData]);
  const isAgentEndpoint = useMemo(() => ecsRowData.agent?.type?.includes('endpoint'), [ecsRowData]);
  const isEndpointEvent = useMemo(() => isEvent && isAgentEndpoint, [isEvent, isAgentEndpoint]);
  const isAlertSourceEndpoint = useMemo(() => {
    const eventModules = getOr([], 'kibana.alert.original_event.module', ecsRowData);
    const kinds = getOr([], 'kibana.alert.original_event.kind', ecsRowData);

    return eventModules.includes('endpoint') && kinds.includes('alert');
  }, [ecsRowData]);

  const scopeIdAllowsAddEndpointEventFilter = useMemo(
    () => scopeId === TableId.hostsPageEvents || scopeId === TableId.usersPageEvents,
    [scopeId]
  );

  const onButtonClick = useCallback(() => {
    setPopover((current) => !current);
  }, []);

  const closePopover = useCallback((): void => {
    setPopover(false);
  }, []);

  const refetchAll = useCallback(() => {
    const refetchQuery = (newQueries: inputsModel.GlobalQuery[]) => {
      newQueries.forEach((q) => q.refetch && (q.refetch as inputsModel.Refetch)());
    };
    if (isActiveTimeline(scopeId ?? '')) {
      refetchQuery([timelineQuery]);
    } else {
      refetchQuery(globalQuery);
    }

    if (refetch) refetch();
  }, [scopeId, globalQuery, timelineQuery, refetch]);

  const hit = useMemo(
    () =>
      buildDataTableRecord({
        _id: ecsRowData._id,
        _index: ecsRowData._index,
        _source: ecsRowData as unknown as EsHitRecord['_source'],
      }),
    [ecsRowData]
  );

  const {
    exceptionFlyoutType,
    openAddExceptionFlyout,
    onAddExceptionCancel,
    onAddExceptionConfirm,
    onAddExceptionTypeClick,
  } = useExceptionFlyout({
    refetch: refetchAll,
    onRuleChange,
    isActiveTimelines: isActiveTimeline(scopeId ?? ''),
  });

  const { closeAddEventFilterModal, isAddEventFilterModalOpen, onAddEventFilterClick } =
    useEventFilterModal();

  const { actionItems: statusActionItems, panels: statusActionPanels } = useAlertsActions({
    alertStatus,
    eventId: ecsRowData?._id,
    scopeId,
    refetch: refetchAll,
    closePopover,
  });

  const handleOnAddExceptionTypeClick = useCallback(
    (type?: ExceptionListTypeEnum) => {
      onAddExceptionTypeClick(type);
      closePopover();
    },
    [closePopover, onAddExceptionTypeClick]
  );

  const handleOnAddEventFilterClick = useCallback(() => {
    onAddEventFilterClick();
    closePopover();
  }, [closePopover, onAddEventFilterClick]);

  const { exceptionActionItems } = useAlertExceptionActions({
    isEndpointAlert: isAlertSourceEndpoint,
    onAddExceptionTypeClick: handleOnAddExceptionTypeClick,
  });
  const { eventFilterActionItems } = useEventFilterAction({
    onAddEventFilterClick: handleOnAddEventFilterClick,
    disabled: !isEndpointEvent || !scopeIdAllowsAddEndpointEventFilter,
    tooltipMessage: !scopeIdAllowsAddEndpointEventFilter
      ? i18n.ACTION_ADD_EVENT_FILTER_DISABLED_TOOLTIP
      : undefined,
  });
  const agentId = useMemo(() => get(0, ecsRowData?.agent?.id), [ecsRowData]);

  const handleOnOsqueryClick = useCallback(() => {
    setOsqueryFlyoutOpen((prevValue) => !prevValue);
    setPopover(false);
  }, []);

  const { osqueryActionItems } = useOsqueryContextActionItem({ handleClick: handleOnOsqueryClick });

  const { alertTagsItems, alertTagsPanels } = useAlertTagsActions({
    closePopover,
    ecsRowData,
    refetch: refetchAll,
  });

  const { alertAssigneesItems, alertAssigneesPanels } = useAlertAssigneesActions({
    closePopover,
    ecsRowData,
    refetch: refetchAll,
  });

  const { runWorkflowMenuItem, runAlertWorkflowPanel } = useRunAlertWorkflowPanel({
    closePopover,
    ecsRowData,
  });

  const documentForWorkflow = useMemo(() => {
    const fields: Record<string, unknown> = {};
    for (const { field, value } of flattenedEcsData) {
      fields[field] = value;
    }
    return [{ _id: ecsRowData._id, _index: ecsRowData._index ?? '', ...fields }];
  }, [ecsRowData._id, ecsRowData._index, flattenedEcsData]);

  const {
    runWorkflowMenuItem: runDocumentWorkflowMenuItem,
    runDocumentWorkflowPanel: runDocumentWorkflowPanels,
  } = useRunDocumentWorkflowPanel({
    closePopover,
    documents: documentForWorkflow,
  });

  const { addToChatActionItems } = useAddToChatAction({
    ecsData: flattenedEcsData,
    onMenuItemClick,
    alertId: ecsRowData._id,
  });

  const isAlertActionMenu = !isEvent && Boolean(ruleId);
  const hasAgent = Boolean(agentId);
  const hasItems = useMemo(
    () =>
      getAlertRowActionGroups({
        addToCaseItems: addToCaseActionItems,
        addToChatItems: addToChatActionItems,
        alertAssigneeItems: alertAssigneesItems,
        alertTagItems: alertTagsItems,
        canCreateEndpointEventFilters,
        eventFilterItems: eventFilterActionItems,
        exceptionItems: exceptionActionItems,
        hasAgent,
        isAlert: isAlertActionMenu,
        osqueryItems: osqueryActionItems,
        runAlertWorkflowItems: runWorkflowMenuItem,
        runDocumentWorkflowItems: runDocumentWorkflowMenuItem,
        statusItems: statusActionItems,
      }).some((group) => group.length > 0),
    [
      addToCaseActionItems,
      addToChatActionItems,
      alertAssigneesItems,
      alertTagsItems,
      canCreateEndpointEventFilters,
      eventFilterActionItems,
      exceptionActionItems,
      hasAgent,
      isAlertActionMenu,
      osqueryActionItems,
      runWorkflowMenuItem,
      runDocumentWorkflowMenuItem,
      statusActionItems,
    ]
  );

  const panels = useMemo(
    () => [
      ...alertTagsPanels,
      ...alertAssigneesPanels,
      ...statusActionPanels,
      ...runAlertWorkflowPanel,
      ...runDocumentWorkflowPanels,
    ],
    [
      alertTagsPanels,
      alertAssigneesPanels,
      statusActionPanels,
      runAlertWorkflowPanel,
      runDocumentWorkflowPanels,
    ]
  );

  const button = useMemo(() => {
    const tooltipContent = isRemoteDocument
      ? i18n.REMOTE_DOCUMENT_ACTIONS_UNAVAILABLE
      : hasItems
      ? i18n.MORE_ACTIONS
      : i18n.INSUFFICIENT_PRIVILEGES;

    return (
      <EuiToolTip position="top" content={tooltipContent}>
        <EuiButtonIcon
          aria-label={ariaLabel}
          data-test-subj="timeline-context-menu-button"
          size="s"
          iconType="boxesVertical"
          data-popover-open={isPopoverOpen}
          onClick={onButtonClick}
          isDisabled={isRemoteDocument || !hasItems}
          color={isPopoverOpen ? 'primary' : 'text'}
        />
      </EuiToolTip>
    );
  }, [ariaLabel, hasItems, isPopoverOpen, onButtonClick, isRemoteDocument]);

  const osqueryFlyout = useMemo(() => {
    return (
      <OsqueryFlyout
        agentId={agentId}
        defaultValues={alertId ? { alertIds: [alertId] } : undefined}
        onClose={handleOnOsqueryClick}
        ecsData={ecsRowData}
      />
    );
  }, [agentId, alertId, ecsRowData, handleOnOsqueryClick]);

  return (
    <>
      <div key="actions-context-menu">
        <EventsTdContent textAlign="center" width={DEFAULT_ACTION_BUTTON_WIDTH}>
          <EuiPopover
            id="singlePanel"
            aria-label={ariaLabel}
            button={button}
            isOpen={isPopoverOpen}
            closePopover={closePopover}
            panelPaddingSize="none"
            anchorPosition="downLeft"
            repositionOnScroll
          >
            <AlertRowActionMenu
              addToCaseItems={addToCaseActionItems}
              addToChatItems={addToChatActionItems}
              alertAssigneeItems={alertAssigneesItems}
              alertTagItems={alertTagsItems}
              canCreateEndpointEventFilters={canCreateEndpointEventFilters}
              eventFilterItems={eventFilterActionItems}
              exceptionItems={exceptionActionItems}
              hasAgent={hasAgent}
              isAlert={isAlertActionMenu}
              osqueryItems={osqueryActionItems}
              panels={panels}
              runAlertWorkflowItems={runWorkflowMenuItem}
              runDocumentWorkflowItems={runDocumentWorkflowMenuItem}
              statusItems={statusActionItems}
            />
          </EuiPopover>
        </EventsTdContent>
      </div>
      {openAddExceptionFlyout && ruleId && ecsRowData._id && (
        <AddExceptionFlyoutWrapper
          hit={hit}
          exceptionListType={exceptionFlyoutType}
          onCancel={onAddExceptionCancel}
          onConfirm={onAddExceptionConfirm}
        />
      )}
      {isAddEventFilterModalOpen && ecsRowData != null && (
        <EventFiltersFlyout data={ecsRowData} onCancel={closeAddEventFilterModal} />
      )}
      {isOsqueryFlyoutOpen && agentId && ecsRowData != null && osqueryFlyout}
    </>
  );
};

export const AlertContextMenu = React.memo(AlertContextMenuComponent);

type AddExceptionFlyoutWrapperProps = Omit<
  AddExceptionFlyoutProps,
  | 'alertData'
  | 'isAlertDataLoading'
  | 'isEndpointItem'
  | 'rules'
  | 'isBulkAction'
  | 'showAlertCloseOptions'
  | 'alertStatus'
> & {
  hit: DataTableRecord;
  exceptionListType: ExceptionListTypeEnum | null;
};

/**
 * This component exists to fetch needed data outside of the AddExceptionFlyout
 * Due to the conditional nature of the flyout and how we use the `ecsData` field,
 * we cannot use the fetch hook within the flyout component itself
 */
export const AddExceptionFlyoutWrapper: React.FC<AddExceptionFlyoutWrapperProps> = ({
  hit,
  exceptionListType,
  onCancel,
  onConfirm,
}) => {
  const eventId = hit.raw._id;
  const alertStatus = getFieldValue(hit, ALERT_WORKFLOW_STATUS) as Status | undefined;
  const ruleId = (getFieldValue(hit, ALERT_RULE_UUID) ??
    getFieldValue(hit, 'signal.rule.id') ??
    '') as string;
  const rawIndices =
    hit.flattened['kibana.alert.rule.parameters.index'] ?? hit.flattened['signal.rule.index'];
  const ruleIndices =
    rawIndices != null ? ([] as string[]).concat(rawIndices as string | string[]) : undefined;
  const ruleDataViewId = (getFieldValue(hit, 'kibana.alert.rule.parameters.data_view_id') ??
    getFieldValue(hit, 'signal.rule.data_view_id')) as string | undefined;

  const isEndpointExceptionsMovedUnderManagement = useIsExperimentalFeatureEnabled(
    'endpointExceptionsMovedUnderManagement'
  );

  const { loading: isSignalIndexLoading, signalIndexName } = useSignalIndex();
  const { rule: maybeRule, loading: isRuleLoading } = useRuleWithFallback(ruleId);

  const { loading: isLoadingAlertData, data } = useQueryAlerts<EcsHit, {}>({
    query: buildGetAlertByIdQuery(eventId),
    indexName: signalIndexName,
    queryName: ALERTS_QUERY_NAMES.ADD_EXCEPTION_FLYOUT,
  });

  const enrichedAlert: AlertData | undefined = useMemo(() => {
    if (isLoadingAlertData === false) {
      const esHit = data?.hits.hits[0];
      if (!esHit) {
        return undefined;
      }
      const { _id, _index, _source } = esHit;
      return { ..._source, _id, _index };
    }
  }, [data?.hits.hits, isLoadingAlertData]);

  /**
   * This should be re-visited after UEBA work is merged
   */
  const memoRuleIndices = useMemo(() => {
    if (enrichedAlert != null && enrichedAlert['kibana.alert.rule.parameters']?.index != null) {
      return Array.isArray(enrichedAlert['kibana.alert.rule.parameters'].index)
        ? enrichedAlert['kibana.alert.rule.parameters'].index
        : [enrichedAlert['kibana.alert.rule.parameters'].index];
    } else if (enrichedAlert != null && enrichedAlert?.signal?.rule?.index != null) {
      return Array.isArray(enrichedAlert.signal.rule.index)
        ? enrichedAlert.signal.rule.index
        : [enrichedAlert.signal.rule.index];
    }
    return ruleIndices;
  }, [enrichedAlert, ruleIndices]);

  const memoDataViewId = useMemo(() => {
    if (
      enrichedAlert != null &&
      enrichedAlert['kibana.alert.rule.parameters']?.data_view_id != null
    ) {
      return enrichedAlert['kibana.alert.rule.parameters'].data_view_id;
    }

    return ruleDataViewId;
  }, [enrichedAlert, ruleDataViewId]);

  const memoRule = useMemo(() => {
    if (maybeRule) {
      return [maybeRule];
    }

    return null;
  }, [maybeRule]);

  const ruleType = enrichedAlert?.['kibana.alert.rule.parameters']?.type;
  const isAlertWithoutIndex = ruleType === 'esql' || ruleType === 'machine_learning';
  const isWaitingForIndexOrDataView =
    !isAlertWithoutIndex && memoRuleIndices == null && memoDataViewId == null;

  const isLoading =
    (isLoadingAlertData && isSignalIndexLoading) ||
    enrichedAlert == null ||
    isWaitingForIndexOrDataView ||
    isRuleLoading;

  const isEndpointItem = exceptionListType === ExceptionListTypeEnum.ENDPOINT;

  if (isLoading) return null;

  return isEndpointItem && isEndpointExceptionsMovedUnderManagement ? (
    <EndpointExceptionsFlyout
      onCancel={onCancel}
      onConfirm={onConfirm}
      alertData={enrichedAlert}
      alertStatus={alertStatus}
      isAlertDataLoading={isLoading}
      rules={memoRule}
    />
  ) : (
    <AddExceptionFlyout
      rules={memoRule}
      isEndpointItem={isEndpointItem}
      alertData={enrichedAlert}
      isAlertDataLoading={isLoading}
      alertStatus={alertStatus}
      isBulkAction={false}
      showAlertCloseOptions
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
};
