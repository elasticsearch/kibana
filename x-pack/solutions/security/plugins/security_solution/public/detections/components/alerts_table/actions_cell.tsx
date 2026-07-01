/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import React, { memo, useCallback, useContext, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { getTableByIdSelector, TableId } from '@kbn/securitysolution-data-table';
import { noop } from 'lodash';
import type { EsHitRecord } from '@kbn/discover-utils';
import type { SetEventsLoading } from '../../../../common/types';
import { StatefulEventContext } from '../../../common/components/events_viewer/stateful_event_context';
import { useLicense } from '../../../common/hooks/use_license';
import type { TimelineItem } from '../../../../common/search_strategy';
import { getAlertsDefaultModel } from './default_config';
import type { State } from '../../../common/store';
import { RowAction } from '../../../common/components/control_columns/row_action';
import type { GetSecurityAlertsTableProp } from './types';
import { expandDottedObject } from '../../../../common/utils/expand_dotted';
import { useFlyoutPagination } from '../../../common/utils/flyout_pagination/use_flyout_pagination';

const onRowSelected = () => {};

export const ActionsCellComponent: GetSecurityAlertsTableProp<'renderActionsCell'> = ({
  tableType = TableId.alertsOnAlertsPage,
  rowIndex,
  isDetails,
  isExpanded,
  isExpandable,
  colIndex,
  setCellProps,
  alert,
  setIsActionLoading,
  refresh: alertsTableRefresh,
  clearSelection,
  leadingControlColumn,
  paginationInstanceId,
}) => {
  const license = useLicense();
  const defaults = useMemo(() => getAlertsDefaultModel(license), [license]);
  const selectTableById = useMemo(() => getTableByIdSelector(), []);
  const {
    columns: columnHeaders,
    showCheckboxes,
    selectedEventIds,
    loadingEventIds,
  } = useSelector((state: State) => selectTableById(state, tableType) ?? defaults);
  const eventContext = useContext(StatefulEventContext);
  const { openAlertFlyout } = useFlyoutPagination(paginationInstanceId);

  // `rowIndex` is absolute (it crosses page boundaries), which is also what
  // the pagination slice expects (`flyoutAlertIndex`). See `ActionsCellHost`
  // in `@kbn/response-ops-alerts-table` for where the page-relative index is
  // computed back from this absolute one.
  const onExpandFlyout = useCallback(() => {
    openAlertFlyout(rowIndex);
  }, [openAlertFlyout, rowIndex]);

  // Derive ecsAlert (nested) from alert
  const ecsAlert = useMemo(() => expandDottedObject(alert) as Ecs, [alert]);

  // Derive legacyAlert (flat {field, value[]} array) from alert
  const legacyData = useMemo<TimelineItem['data']>(
    () =>
      Object.entries(alert).map(([field, value]) => ({
        field,
        value: (Array.isArray(value) ? value : [value]) as string[],
      })),
    [alert]
  );

  const timelineItem = useMemo<TimelineItem>(
    () => ({
      _id: alert._id,
      _index: alert._index,
      ecs: ecsAlert,
      data: legacyData,
    }),
    [alert._id, alert._index, ecsAlert, legacyData]
  );

  // We are creating this object here so we can pass it to the cell action, which will then pass it to the flyout.
  // This way we can use the same flyout content code between Security Solution and Discover.
  const esHitRecord: EsHitRecord = useMemo(
    () => ({
      _id: alert._id,
      _index: alert._index,
      _source: alert,
    }),
    [alert]
  );

  const setEventsLoading = useCallback<SetEventsLoading>(
    ({ isLoading }) => {
      if (!isLoading) {
        clearSelection();
        return;
      }
      if (setIsActionLoading) setIsActionLoading(isLoading);
    },
    [clearSelection, setIsActionLoading]
  );

  return (
    <RowAction
      columnId={`actions-${rowIndex}`}
      columnHeaders={columnHeaders}
      controlColumn={leadingControlColumn}
      esHitRecord={esHitRecord}
      data={timelineItem}
      disabled={false}
      index={rowIndex}
      isDetails={isDetails}
      isExpanded={isExpanded}
      isEventViewer={false}
      isExpandable={isExpandable}
      loadingEventIds={loadingEventIds}
      onRowSelected={onRowSelected}
      rowIndex={rowIndex}
      colIndex={colIndex}
      pageRowIndex={rowIndex}
      selectedEventIds={selectedEventIds}
      setCellProps={setCellProps}
      showCheckboxes={showCheckboxes}
      onRuleChange={eventContext?.onRuleChange}
      tabType={'query'}
      tableId={tableType}
      width={0}
      setEventsLoading={setEventsLoading}
      setEventsDeleted={noop}
      refetch={alertsTableRefresh}
      onExpandFlyout={onExpandFlyout}
    />
  );
};

export const ActionsCell = memo(ActionsCellComponent);
