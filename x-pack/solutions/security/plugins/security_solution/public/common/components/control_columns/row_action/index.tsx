/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiDataGridCellValueElementProps } from '@elastic/eui';
import type { RefObject } from 'react';
import React, { useCallback, useMemo } from 'react';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import type { DataTableRecord, EsHitRecord } from '@kbn/discover-utils';
import { buildDataTableRecord } from '@kbn/discover-utils';
import { TableId } from '@kbn/securitysolution-data-table';
import {
  SECURITY_CELL_ACTIONS_CASE_EVENTS,
  SECURITY_CELL_ACTIONS_DETAILS_FLYOUT,
} from '@kbn/ui-actions-plugin/common/trigger_ids';
import type { AlertsTableImperativeApi } from '@kbn/response-ops-alerts-table/types';
import {
  createCellActionRenderer,
  rulePreviewCellActionRenderer,
} from '../../../../flyout_v2/shared/components/cell_actions';
import { useFlyoutApi } from '../../../../flyout_v2/use_flyout_api';
import { getAlertIndexAlias } from '../../../../flyout/document_details/shared/hooks/use_event_details';
import { useSpaceId } from '../../../hooks/use_space_id';
import { LeftPanelNotesTab } from '../../../../flyout/document_details/left';
import { useKibana } from '../../../lib/kibana';
import { useIsNewFlyoutEnabled } from '../../../hooks/use_is_new_flyout_enabled';
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
import { DocumentEventTypes, FLYOUT_ORIGIN, NotesEventTypes } from '../../../lib/telemetry';
import { getMappedNonEcsValue } from '../../../utils/get_mapped_non_ecs_value';
import { useUserPrivileges } from '../../user_privileges';
import { getDocumentHistoryTitle } from '../../../../flyout_v2/document/main/utils/get_header_title';

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
  /**
   * Handle to the alerts table this row belongs to. Provided by the alerts table so the document
   * flyout's "Toggle column in table" action can add/remove columns on it. Absent for other tables.
   */
  alertsTableRef?: RefObject<AlertsTableImperativeApi>;
  width: number;
  /**
   * Optional override for the "expand flyout" row action. When provided,
   * clicking the expand button calls this callback instead of opening the
   * expandable flyout directly. The alerts page uses this so the alerts table
   * can drive the in-flyout pagination (see `usePaginatedFlyout` in `flyout_v2/document/pagination`).
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
  alertsTableRef,
  width,
}: RowActionProps) => {
  const { data: timelineNonEcsData, ecs: ecsData, _id: eventId, _index: indexName } = data ?? {};
  const hit: DataTableRecord | undefined = useMemo(
    () => esHitRecord && buildDataTableRecord(esHitRecord),
    [esHitRecord]
  );

  const { telemetry } = useKibana().services;
  const spaceId = useSpaceId();

  const { openFlyout } = useExpandableFlyoutApi();
  const enableNewFlyout = useIsNewFlyoutEnabled();
  const { openDocumentFlyoutFromIndex, openDocumentFlyoutFromPattern, openNotes } = useFlyoutApi();

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

  // Cell action renderer for the new document details flyout opened from this table.
  // The table scope is always bound and the details-flyout trigger is used — that trigger is the
  // only one that registers the "Toggle column in table" action, and binding the scope makes the
  // action compatible for both Timeline/table scopes. How the column toggle is applied depends on
  // the table:
  // - Alerts tables forward their `alertsTableRef` so the toggle targets the imperatively-controlled
  //   table.
  // - Event tables (e.g. the Explore host/user pages) have no ref; the toggle dispatches to the
  //   Redux data table store keyed by the bound scope instead.
  // - The alerts table on the Cases page uses the case-events trigger.
  const documentFlyoutCellActionRenderer = useMemo(
    () =>
      createCellActionRenderer(tableId, {
        triggerId:
          tableId === TableId.alertsOnCasePage
            ? SECURITY_CELL_ACTIONS_CASE_EVENTS
            : SECURITY_CELL_ACTIONS_DETAILS_FLYOUT,
        visibleCellActions: 6,
        alertsTableRef,
      }),
    [tableId, alertsTableRef]
  );

  const handleOnEventDetailPanelOpened = useCallback(() => {
    if (onExpandFlyout) {
      onExpandFlyout();
      return;
    }

    if (enableNewFlyout && hit) {
      if (tableId === TableId.rulePreview) {
        // Rule preview alert rows reference their backing .internal.preview. index, which is
        // not included in any data view pattern. Convert to the alias and resolve via the
        // pattern-based wrapper.
        const resolvedIndex = indexName
          ? getAlertIndexAlias(indexName, spaceId) ?? indexName
          : undefined;
        openDocumentFlyoutFromPattern({
          documentId: eventId,
          indexName: resolvedIndex,
          renderCellActions: rulePreviewCellActionRenderer,
          onAlertUpdated: handleAlertUpdated,
          origin: FLYOUT_ORIGIN.ALERTS_TABLE,
          title: getDocumentHistoryTitle(hit),
        });
      } else {
        openDocumentFlyoutFromIndex({
          documentId: eventId,
          indexName: indexName ?? undefined,
          renderCellActions: documentFlyoutCellActionRenderer,
          onAlertUpdated: handleAlertUpdated,
          origin: FLYOUT_ORIGIN.ALERTS_TABLE,
          title: getDocumentHistoryTitle(hit),
        });
      }
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
    enableNewFlyout,
    hit,
    tableId,
    spaceId,
    indexName,
    openDocumentFlyoutFromPattern,
    openDocumentFlyoutFromIndex,
    documentFlyoutCellActionRenderer,
    eventId,
    handleAlertUpdated,
    onExpandFlyout,
    openFlyout,
    telemetry,
  ]);

  const toggleShowNotes = useCallback(() => {
    if (enableNewFlyout && hit) {
      openNotes({ hit, origin: FLYOUT_ORIGIN.ALERTS_TABLE });
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
    }
    telemetry.reportEvent(NotesEventTypes.OpenNoteInExpandableFlyoutClicked, {
      location: tableId,
    });
    telemetry.reportEvent(DocumentEventTypes.DetailsFlyoutOpened, {
      location: tableId,
      panel: 'left',
    });
  }, [enableNewFlyout, hit, openNotes, openFlyout, eventId, indexName, tableId, telemetry]);

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
