/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import numeral from '@elastic/numeral';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ConnectedProps } from 'react-redux-v7';
import { connect, useDispatch } from 'react-redux-v7';
import { useUiSetting$ } from '@kbn/kibana-react-plugin/public';
import {
  dataTableSelectors,
  dataTableActions,
  tableEntity,
} from '@kbn/securitysolution-data-table';
import type { DataTableModel, DataTableState, TableId } from '@kbn/securitysolution-data-table';
import { noop } from 'lodash';
import { DEFAULT_NUMBER_FORMAT } from '../../../../../common/constants';
import type {
  CustomBulkActionProp,
  SetEventsDeleted,
  SetEventsLoading,
} from '../../../../../common/types';
import type { TimelineItem } from '../../../../../common/search_strategy';
import { BulkActions } from '.';
import { useBulkActionItems } from './use_bulk_action_items';
import type { AlertWorkflowStatus, Refetch } from '../../../types';
import type { OnUpdateAlertStatusError, OnUpdateAlertStatusSuccess } from './types';
import type { inputsModel } from '../../../store';
import { inputsSelectors } from '../../../store';
import { useDeepEqualSelector } from '../../../hooks/use_selector';
import * as i18n from './translations';

interface OwnProps {
  id: TableId;
  totalItems: number;
  filterStatus?: AlertWorkflowStatus;
  query?: string;
  showAlertStatusActions?: boolean;
  onActionSuccess?: OnUpdateAlertStatusSuccess;
  onActionFailure?: OnUpdateAlertStatusError;
  customBulkActions?: CustomBulkActionProp[];
  customRefetch?: Refetch;
  data: TimelineItem[];
}

export type StatefulAlertBulkActionsProps = OwnProps & PropsFromRedux;

/**
 * Component to render status bulk actions
 */
export const AlertBulkActionsComponent = React.memo<StatefulAlertBulkActionsProps>(
  ({
    id,
    totalItems,
    filterStatus,
    query,
    selectedEventIds,
    isSelectAllChecked,
    clearSelected,
    showAlertStatusActions,
    onActionSuccess,
    onActionFailure,
    customBulkActions,
    customRefetch,
    data,
  }) => {
    const dispatch = useDispatch();

    const [showClearSelection, setShowClearSelection] = useState(false);
    const getGlobalQuerySelector = useMemo(() => inputsSelectors.globalQuery(), []);
    const globalQueries = useDeepEqualSelector(getGlobalQuerySelector);
    const refetchQuery = useCallback(() => {
      globalQueries.forEach((q) => q.refetch && (q.refetch as inputsModel.Refetch)());
    }, [globalQueries]);

    const [defaultNumberFormat] = useUiSetting$<string>(DEFAULT_NUMBER_FORMAT);
    const selectedCount = useMemo(() => Object.keys(selectedEventIds).length, [selectedEventIds]);

    const formattedTotalCount = useMemo(
      () => numeral(totalItems).format(defaultNumberFormat),
      [defaultNumberFormat, totalItems]
    );
    const formattedSelectedCount = useMemo(
      () => numeral(selectedCount).format(defaultNumberFormat),
      [defaultNumberFormat, selectedCount]
    );

    const selectText = useMemo(
      () =>
        showClearSelection
          ? i18n.SELECTED_ENTITIES(tableEntity[id], formattedTotalCount, totalItems)
          : i18n.SELECTED_ENTITIES(tableEntity[id], formattedSelectedCount, selectedCount),
      [
        id,
        showClearSelection,
        formattedTotalCount,
        formattedSelectedCount,
        totalItems,
        selectedCount,
      ]
    );

    const selectClearAllText = useMemo(
      () =>
        showClearSelection
          ? i18n.CLEAR_SELECTION
          : i18n.SELECT_ALL_ENTITIES(tableEntity[id], formattedTotalCount, totalItems),
      [id, showClearSelection, formattedTotalCount, totalItems]
    );

    // Catches state change isSelectAllChecked->false (page checkbox) upon user selection change to reset toolbar select all
    useEffect(() => {
      if (isSelectAllChecked) {
        dispatch(dataTableActions.setDataTableSelectAll({ id, selectAll: false }));
      } else {
        setShowClearSelection(false);
      }
    }, [dispatch, isSelectAllChecked, id]);

    // Callback for selecting all events on all pages from toolbar
    // Dispatches to stateful_body's selectAll via TimelineTypeContext props
    // as scope of response data required to actually set selectedEvents
    const onSelectAll = useCallback(() => {
      dispatch(dataTableActions.setDataTableSelectAll({ id, selectAll: true }));
      setShowClearSelection(true);
    }, [dispatch, id]);

    // Callback for clearing entire selection from toolbar
    const onClearSelection = useCallback(() => {
      clearSelected({ id });
      dispatch(dataTableActions.setDataTableSelectAll({ id, selectAll: false }));
      setShowClearSelection(false);
    }, [clearSelected, dispatch, id]);

    const onUpdateSuccess = useCallback(
      (updated: number, conflicts: number, newStatus: AlertWorkflowStatus) => {
        if (customRefetch) {
          customRefetch();
        } else {
          refetchQuery();
        }
        if (onActionSuccess) {
          onActionSuccess(updated, conflicts, newStatus);
        }
      },
      [customRefetch, onActionSuccess, refetchQuery]
    );

    const onUpdateFailure = useCallback(
      (newStatus: AlertWorkflowStatus, error: Error) => {
        if (customRefetch) {
          customRefetch();
        } else {
          refetchQuery();
        }
        if (onActionFailure) {
          onActionFailure(newStatus, error);
        }
      },
      [customRefetch, onActionFailure, refetchQuery]
    );

    const setEventsLoading = useCallback<SetEventsLoading>(
      ({ eventIds, isLoading }) => {
        dispatch(dataTableActions.setEventsLoading({ id, eventIds, isLoading }));
      },
      [dispatch, id]
    );

    const setEventsDeleted = useCallback<SetEventsDeleted>(
      ({ eventIds, isDeleted }) => {
        dispatch(dataTableActions.setEventsDeleted({ id, eventIds, isDeleted }));
      },
      [dispatch, id]
    );

    const eventIds = useMemo(() => Object.keys(selectedEventIds), [selectedEventIds]);

    const closePopoverRef = useRef<() => void>(noop);
    const closePopover = useCallback(() => closePopoverRef.current(), []);

    const { panels: bulkActionsPanels, groups: bulkActionGroups } = useBulkActionItems({
      eventIds,
      currentStatus: filterStatus,
      ...(showClearSelection ? { query } : {}),
      setEventsLoading,
      setEventsDeleted,
      showAlertStatusActions,
      onUpdateSuccess,
      onUpdateFailure,
      customBulkActions,
      data,
      closePopover,
    });

    return (
      <BulkActions
        selectText={selectText}
        selectClearAllText={selectClearAllText}
        data-test-subj="bulk-actions"
        showClearSelection={showClearSelection}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
        bulkActionPanels={bulkActionsPanels}
        bulkActionGroups={bulkActionGroups}
        closePopoverRef={closePopoverRef}
      />
    );
  }
);

AlertBulkActionsComponent.displayName = 'AlertBulkActionsComponent';

const makeMapStateToProps = () => {
  const getTable = dataTableSelectors.getTableByIdSelector();
  const mapStateToProps = (state: DataTableState, { id }: OwnProps) => {
    const dataTable: DataTableModel = getTable(state, id);
    const { selectedEventIds, isSelectAllChecked } = dataTable;

    return {
      isSelectAllChecked,
      selectedEventIds,
    };
  };
  return mapStateToProps;
};

const mapDispatchToProps = {
  clearSelected: dataTableActions.clearSelected,
};

type StateProps = ReturnType<ReturnType<typeof makeMapStateToProps>>;
type DispatchProps = typeof mapDispatchToProps;
const connector = connect<StateProps, DispatchProps, OwnProps, DataTableState>(
  makeMapStateToProps,
  mapDispatchToProps
);

type PropsFromRedux = ConnectedProps<typeof connector>;

export const StatefulAlertBulkActions = connector(AlertBulkActionsComponent);

// eslint-disable-next-line import/no-default-export
export { StatefulAlertBulkActions as default };
