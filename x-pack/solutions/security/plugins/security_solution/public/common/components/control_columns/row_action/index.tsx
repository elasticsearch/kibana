/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiDataGridCellValueElementProps } from '@elastic/eui';
import React, { useCallback, useMemo } from 'react';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import type { DataTableRecord, EsHitRecord } from '@kbn/discover-utils';
import { buildDataTableRecord } from '@kbn/discover-utils';
import { useHistory } from 'react-router-dom';
import { useStore } from 'react-redux';
import { documentFlyoutHistoryKey } from '../../../../flyout_v2/shared/constants/flyout_history';
import { cellActionRenderer } from '../../../../flyout_v2/shared/components/cell_actions';
import { DocumentFlyoutWrapper } from '../../../../flyout_v2/document/main/document_flyout_wrapper';
import { LeftPanelNotesTab } from '../../../../flyout/document_details/left';
import { useKibana } from '../../../lib/kibana';
import { useIsExperimentalFeatureEnabled } from '../../../hooks/use_experimental_features';
import {
  DocumentDetailsLeftPanelKey,
  DocumentDetailsRightPanelKey,
} from '../../../../flyout/document_details/shared/constants/panel_keys';
import type {
  ControlColumnProps,
  SetEventsDeleted,
  SetEventsLoading,
} from '../../../../../common/types';
import type { TimelineItem, TimelineNonEcsData } from '../../../../../common/search_strategy';
import { type ColumnHeaderOptions, type OnRowSelected } from '../../../../../common/types/timeline';
import { DocumentEventTypes, NotesEventTypes } from '../../../lib/telemetry';
import { getMappedNonEcsValue } from '../../../utils/get_mapped_non_ecs_value';
import { useUserPrivileges } from '../../user_privileges';
import { flyoutProviders } from '../../../../flyout_v2/shared/components/flyout_provider';
import { useDefaultDocumentFlyoutProperties } from '../../../../flyout_v2/shared/hooks/use_default_flyout_properties';

export type RowActionProps = EuiDataGridCellValueElementProps & {
  columnHeaders: ColumnHeaderOptions[];
  controlColumn: ControlColumnProps;
  data: TimelineItem;
  disabled: boolean;
  esHitRecord?: EsHitRecord;
  index: number;
  isEventViewer: boolean;
  loadingEventIds: Readonly<string[]>;
  onRowSelected: OnRowSelected;
  onRuleChange?: () => void;
  pageRowIndex: number;
  refetch?: () => void;
  selectedEventIds: Readonly<Record<string, TimelineNonEcsData[]>>;
  setEventsDeleted: SetEventsDeleted;
  setEventsLoading: SetEventsLoading;
  showCheckboxes: boolean;
  tabType?: string;
  tableId: string;
  width: number;
  /**
   * Optional override for the "expand flyout" row action. When provided,
   * clicking the expand button calls this callback instead of opening the
   * expandable flyout directly. The alerts page uses this so the alerts table
   * can drive the in-flyout pagination (see `usePaginatedFlyout` in `common/utils/flyout_pagination`).
   *
   * If omitted (e.g. for the cases events table), the default behaviour of
   * opening `DocumentDetailsRightPanelKey` directly is preserved.
   */
  onExpandFlyout?: () => void;
};

const RowActionComponent = ({
  columnHeaders,
  controlColumn,
  data,
  disabled,
  esHitRecord,
  index,
  isEventViewer,
  loadingEventIds,
  onExpandFlyout,
  onRowSelected,
  onRuleChange,
  pageRowIndex,
  refetch,
  rowIndex,
  selectedEventIds,
  setEventsLoading,
  setEventsDeleted,
  showCheckboxes,
  tabType,
  tableId,
  width,
}: RowActionProps) => {
  const { data: timelineNonEcsData, ecs: ecsData, _id: eventId, _index: indexName } = data ?? {};
  const hit: DataTableRecord | undefined = useMemo(
    () => esHitRecord && buildDataTableRecord(esHitRecord),
    [esHitRecord]
  );

  const { services } = useKibana();
  const { telemetry, overlays } = services;
  const store = useStore();
  const history = useHistory();

  const { openFlyout } = useExpandableFlyoutApi();
  const newFlyoutSystemEnabled = useIsExperimentalFeatureEnabled('newFlyoutSystemEnabled');
  const defaultFlyoutProperties = useDefaultDocumentFlyoutProperties();

  const columnValues = useMemo(
    () =>
      timelineNonEcsData &&
      columnHeaders
        .map(
          (header) =>
            getMappedNonEcsValue({
              data: timelineNonEcsData,
              fieldName: header.id,
            }) ?? []
        )
        .join(' '),
    [columnHeaders, timelineNonEcsData]
  );

  const {
    notesPrivileges: { read: canReadNotes },
    timelinePrivileges: { read: canReadTimelines },
  } = useUserPrivileges();
  const showNotes = canReadNotes;

  const handleAlertUpdated = useCallback(() => {
    refetch?.();
  }, [refetch]);

  const handleOnEventDetailPanelOpened = useCallback(() => {
    // When the consumer provides `onExpandFlyout` it takes ownership of opening
    // the expandable flyout (e.g. so it can also update pagination state).
    if (onExpandFlyout) {
      onExpandFlyout();
      telemetry.reportEvent(DocumentEventTypes.DetailsFlyoutOpened, {
        location: tableId,
        panel: 'right',
      });
      return;
    }
    if (newFlyoutSystemEnabled && hit) {
      overlays.openSystemFlyout(
        flyoutProviders({
          services,
          store,
          history,
          children: (
            <DocumentFlyoutWrapper
              documentId={eventId}
              indexName={indexName ?? undefined}
              renderCellActions={cellActionRenderer}
              onAlertUpdated={handleAlertUpdated}
            />
          ),
        }),
        {
          ...defaultFlyoutProperties,
          historyKey: documentFlyoutHistoryKey,
          session: 'start',
        }
      );
    } else {
      openFlyout({
        right: {
          id: DocumentDetailsRightPanelKey,
          params: {
            id: eventId,
            indexName,
            scopeId: tableId,
          },
        },
      });
      telemetry.reportEvent(DocumentEventTypes.DetailsFlyoutOpened, {
        location: tableId,
        panel: 'right',
      });
    }
  }, [
    defaultFlyoutProperties,
    newFlyoutSystemEnabled,
    hit,
    overlays,
    services,
    store,
    history,
    eventId,
    indexName,
    handleAlertUpdated,
    onExpandFlyout,
    openFlyout,
    tableId,
    telemetry,
  ]);

  const toggleShowNotes = useCallback(() => {
    openFlyout({
      right: {
        id: DocumentDetailsRightPanelKey,
        params: {
          id: eventId,
          indexName,
          scopeId: tableId,
        },
      },
      left: {
        id: DocumentDetailsLeftPanelKey,
        path: {
          tab: LeftPanelNotesTab,
        },
        params: {
          id: eventId,
          indexName,
          scopeId: tableId,
        },
      },
    });
    telemetry.reportEvent(NotesEventTypes.OpenNoteInExpandableFlyoutClicked, {
      location: tableId,
    });
    telemetry.reportEvent(DocumentEventTypes.DetailsFlyoutOpened, {
      location: tableId,
      panel: 'left',
    });
  }, [eventId, indexName, openFlyout, tableId, telemetry]);

  const Action = controlColumn.rowCellRender;

  if (!timelineNonEcsData || !ecsData || !eventId) {
    return <span data-test-subj="noData" />;
  }

  return (
    <>
      {Action && (
        <Action
          ariaRowindex={pageRowIndex + 1}
          checked={Object.keys(selectedEventIds).includes(eventId)}
          columnId={controlColumn.id || ''}
          columnValues={columnValues || ''}
          data-test-subj="actions"
          disabled={disabled}
          disableTimelineAction={!canReadTimelines}
          ecsData={ecsData}
          eventId={eventId}
          hit={hit}
          index={index}
          isEventViewer={isEventViewer}
          loadingEventIds={loadingEventIds}
          onEventDetailsPanelOpened={handleOnEventDetailPanelOpened}
          onRowSelected={onRowSelected}
          onRuleChange={onRuleChange}
          refetch={refetch}
          rowIndex={rowIndex}
          setEventsLoading={setEventsLoading}
          setEventsDeleted={setEventsDeleted}
          showCheckboxes={showCheckboxes}
          showNotes={showNotes}
          tabType={tabType}
          timelineId={tableId}
          toggleShowNotes={toggleShowNotes}
          width={width}
        />
      )}
    </>
  );
};

export const RowAction = React.memo(RowActionComponent);
