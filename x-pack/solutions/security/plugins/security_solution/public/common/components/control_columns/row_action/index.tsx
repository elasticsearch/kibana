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
import { ENABLE_NEW_FLYOUT_SETTING } from '../../../../../common/constants';
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
  const { telemetry, overlays, uiSettings } = services;
  const store = useStore();
  const history = useHistory();

  const { openFlyout } = useExpandableFlyoutApi();
  const enableNewFlyout = uiSettings.get(ENABLE_NEW_FLYOUT_SETTING, false);
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
    if (enableNewFlyout && hit) {
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
    enableNewFlyout,
    hit,
    overlays,
    services,
    store,
    history,
    eventId,
    indexName,
    handleAlertUpdated,
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
