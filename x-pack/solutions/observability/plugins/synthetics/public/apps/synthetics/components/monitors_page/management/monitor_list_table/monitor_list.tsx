/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { Criteria, EuiTableSortingType } from '@elastic/eui';
import { EuiBasicTable, EuiPanel, EuiHorizontalRule, useIsWithinMinBreakpoint } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { EuiTableSelectionType } from '@elastic/eui/src/components/basic_table/table_types';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { SpacesContextProps } from '@kbn/spaces-plugin/public';
import { MonitorListHeader } from './monitor_list_header';
import type { MonitorListSortField } from '../../../../../../../common/runtime_types/monitor_management/sort_field';
import { DeleteMonitor } from './delete_monitor';
import { ResetMonitorModal } from './reset_monitor_modal';
import { BulkStatusUpdateModal } from './bulk_status_update_modal';
import type { BulkEditAction } from './bulk_operations';
import { BulkTagsFlyout } from './bulk_tags_flyout';
import { BulkServiceNameFlyout } from './bulk_service_name_flyout';
import { BulkLabelsFlyout } from './bulk_labels_flyout';
import { BulkLocationsFlyout } from './bulk_locations_flyout';
import { BulkScheduleFlyout } from './bulk_schedule_flyout';
import { BulkMaintenanceWindowsFlyout } from './bulk_maintenance_windows_flyout';
import { useMonitorIntegrationHealth } from '../../../common/hooks/use_monitor_integration_health';
import type { IHttpSerializedFetchError } from '../../../../state/utils/http_error';
import type { MonitorListPageState } from '../../../../state';
import type {
  EncryptedSyntheticsSavedMonitor,
  OverviewStatusState,
} from '../../../../../../../common/runtime_types';
import { ConfigKey, SourceType } from '../../../../../../../common/runtime_types';
import { useMonitorListColumns, MANAGEMENT_DEFAULT_VISIBLE_COLUMN_IDS } from './columns';
import * as labels from './labels';
import type { ClientPluginsStart } from '../../../../../../plugin';
import {
  MANAGEMENT_TABLE_COLUMNS_STORAGE_KEY,
  useTableColumnSelector,
} from '../../../common/hooks/use_table_column_selector';

export type MonitorListItem = EncryptedSyntheticsSavedMonitor;

interface Props {
  pageState: MonitorListPageState;
  syntheticsMonitors: EncryptedSyntheticsSavedMonitor[];
  total: number;
  error: IHttpSerializedFetchError | null;
  loading: boolean;
  loadPage: (state: MonitorListPageState) => void;
  reloadPage: () => void;
  overviewStatus: OverviewStatusState | null;
}
const getEmptyFunctionComponent: React.FC<SpacesContextProps> = ({ children }) => <>{children}</>;

export const MonitorList = ({
  pageState: { pageIndex, pageSize, sortField, sortOrder },
  syntheticsMonitors,
  total,
  error,
  loading,
  overviewStatus,
  loadPage,
  reloadPage,
}: Props) => {
  const isXl = useIsWithinMinBreakpoint('xxl');

  const [monitorPendingDeletion, setMonitorPendingDeletion] = useState<string[]>([]);
  const [monitorPendingReset, setMonitorPendingReset] = useState<{
    resetIds: string[];
    skippedMonitors: Array<{ id: string; name: string }>;
  } | null>(null);
  const [monitorPendingStatusUpdate, setMonitorPendingStatusUpdate] = useState<{
    ids: string[];
    enabled: boolean;
  } | null>(null);
  const [bulkEditAction, setBulkEditAction] = useState<BulkEditAction | null>(null);
  const [isLocationsFlyoutOpen, setIsLocationsFlyoutOpen] = useState(false);
  const [isScheduleFlyoutOpen, setIsScheduleFlyoutOpen] = useState(false);
  const [isMaintenanceWindowsFlyoutOpen, setIsMaintenanceWindowsFlyoutOpen] = useState(false);
  const { resetMonitors, isFixableByReset } = useMonitorIntegrationHealth();

  const items: MonitorListItem[] = useMemo(
    () => syntheticsMonitors as MonitorListItem[],
    [syntheticsMonitors]
  );

  const totalItemCount = total;

  const handleOnChange = useCallback(
    ({
      page = { index: 0, size: 10 },
      sort = { field: ConfigKey.NAME, direction: 'asc' },
    }: Criteria<MonitorListItem>) => {
      const { index, size } = page;
      const { field, direction } = sort;

      const rawField = String(field);
      const nextSortField = (
        rawField === 'enabled' || rawField === 'created_at' || rawField === 'updated_at'
          ? rawField
          : `${rawField}.keyword`
      ) as MonitorListSortField;

      loadPage({
        pageIndex: index,
        pageSize: size,
        sortField: nextSortField,
        sortOrder: direction,
      });
    },
    [loadPage]
  );

  const pagination = {
    pageIndex,
    pageSize,
    totalItemCount,
    pageSizeOptions: [5, 10, 25, 50, 100],
  };

  const sorting: EuiTableSortingType<MonitorListItem> = {
    sort: {
      field: sortField?.replace('.keyword', '') as keyof MonitorListItem,
      direction: sortOrder,
    },
  };

  const recordRangeLabel = labels.getRecordRangeLabel({
    rangeStart: totalItemCount === 0 ? 0 : pageSize * pageIndex + 1,
    rangeEnd: pageSize * pageIndex + pageSize,
    total: totalItemCount,
  });

  const allColumns = useMonitorListColumns({
    loading,
    overviewStatus,
    setMonitorPendingDeletion,
    setMonitorPendingReset,
    isFixableByReset,
  });
  const { columns, ColumnSelector } = useTableColumnSelector({
    columns: allColumns,
    defaultVisibleColumnIds: MANAGEMENT_DEFAULT_VISIBLE_COLUMN_IDS,
    storageKeyPrefix: MANAGEMENT_TABLE_COLUMNS_STORAGE_KEY,
  });

  const [selectedItems, setSelectedItems] = useState<MonitorListItem[]>([]);
  const onSelectionChange = (selItems: MonitorListItem[]) => {
    setSelectedItems(selItems);
  };

  const selection: EuiTableSelectionType<MonitorListItem> = {
    onSelectionChange,
    selected: selectedItems,
  };
  const { spaces: spacesApi } = useKibana<ClientPluginsStart>().services;

  const ContextWrapper = useMemo(
    () =>
      spacesApi ? spacesApi.ui.components.getSpacesContextProvider : getEmptyFunctionComponent,
    [spacesApi]
  );

  return (
    <ContextWrapper>
      <EuiPanel
        hasBorder={false}
        hasShadow={false}
        paddingSize="none"
        data-test-subj={loading ? 'syntheticsMonitorList-loading' : 'syntheticsMonitorList-loaded'}
      >
        <MonitorListHeader
          recordRangeLabel={recordRangeLabel}
          selectedItems={selectedItems as EncryptedSyntheticsSavedMonitor[]}
          setMonitorPendingDeletion={setMonitorPendingDeletion}
          setMonitorPendingReset={setMonitorPendingReset}
          setMonitorPendingStatusUpdate={setMonitorPendingStatusUpdate}
          setBulkEditAction={setBulkEditAction}
          setIsLocationsFlyoutOpen={setIsLocationsFlyoutOpen}
          setIsScheduleFlyoutOpen={setIsScheduleFlyoutOpen}
          setIsMaintenanceWindowsFlyoutOpen={setIsMaintenanceWindowsFlyoutOpen}
          columnSelector={ColumnSelector}
        />
        <EuiHorizontalRule margin="s" />
        <EuiBasicTable<MonitorListItem>
          aria-label={i18n.translate('xpack.synthetics.management.monitorList.title', {
            defaultMessage: 'Synthetics monitors list',
          })}
          tableCaption={i18n.translate('xpack.synthetics.management.monitorList.caption', {
            defaultMessage: 'Synthetics monitors',
          })}
          error={error?.body?.message}
          loading={loading}
          itemId="config_id"
          items={items}
          columns={columns}
          tableLayout={isXl ? 'auto' : 'fixed'}
          pagination={pagination}
          sorting={sorting}
          onChange={handleOnChange}
          noItemsMessage={loading ? labels.LOADING : labels.NO_DATA_MESSAGE}
          selection={selection}
        />
      </EuiPanel>
      {monitorPendingReset !== null && monitorPendingReset.resetIds.length > 0 && (
        <ResetMonitorModal
          configIds={monitorPendingReset.resetIds}
          skippedMonitors={monitorPendingReset.skippedMonitors}
          onClose={() => setMonitorPendingReset(null)}
          onCompleted={() => setSelectedItems([])}
          resetMonitors={resetMonitors}
        />
      )}
      {monitorPendingDeletion.length > 0 && (
        <DeleteMonitor
          configIds={monitorPendingDeletion}
          name={
            syntheticsMonitors.find(
              (mon) => mon[ConfigKey.CONFIG_ID] === monitorPendingDeletion[0]
            )?.[ConfigKey.NAME] ?? ''
          }
          setMonitorPendingDeletion={setMonitorPendingDeletion}
          onCompleted={() => setSelectedItems([])}
          isProjectMonitor={
            syntheticsMonitors.find(
              (mon) => mon[ConfigKey.CONFIG_ID] === monitorPendingDeletion[0]
            )?.[ConfigKey.MONITOR_SOURCE_TYPE] === SourceType.PROJECT
          }
          reloadPage={reloadPage}
        />
      )}
      {monitorPendingStatusUpdate !== null && monitorPendingStatusUpdate.ids.length > 0 && (
        <BulkStatusUpdateModal
          monitors={selectedItems.filter((mon) =>
            monitorPendingStatusUpdate.ids.includes(mon[ConfigKey.CONFIG_ID])
          )}
          enabled={monitorPendingStatusUpdate.enabled}
          onClose={() => setMonitorPendingStatusUpdate(null)}
          onCompleted={() => setSelectedItems([])}
          reloadPage={reloadPage}
        />
      )}
      {bulkEditAction === 'tags' && (
        <BulkTagsFlyout
          monitors={selectedItems as EncryptedSyntheticsSavedMonitor[]}
          onClose={() => {
            setBulkEditAction(null);
            setSelectedItems([]);
          }}
          reloadPage={reloadPage}
        />
      )}
      {bulkEditAction === 'serviceName' && (
        <BulkServiceNameFlyout
          monitors={selectedItems as EncryptedSyntheticsSavedMonitor[]}
          onClose={() => {
            setBulkEditAction(null);
            setSelectedItems([]);
          }}
          reloadPage={reloadPage}
        />
      )}
      {bulkEditAction === 'labels' && (
        <BulkLabelsFlyout
          monitors={selectedItems as EncryptedSyntheticsSavedMonitor[]}
          onClose={() => {
            setBulkEditAction(null);
            setSelectedItems([]);
          }}
          reloadPage={reloadPage}
        />
      )}
      {isLocationsFlyoutOpen && (
        <BulkLocationsFlyout
          monitors={selectedItems as EncryptedSyntheticsSavedMonitor[]}
          onClose={() => {
            setIsLocationsFlyoutOpen(false);
            setSelectedItems([]);
          }}
          reloadPage={reloadPage}
        />
      )}
      {isScheduleFlyoutOpen && (
        <BulkScheduleFlyout
          monitors={selectedItems as EncryptedSyntheticsSavedMonitor[]}
          onClose={() => {
            setIsScheduleFlyoutOpen(false);
            setSelectedItems([]);
          }}
          reloadPage={reloadPage}
        />
      )}
      {isMaintenanceWindowsFlyoutOpen && (
        <BulkMaintenanceWindowsFlyout
          monitors={selectedItems as EncryptedSyntheticsSavedMonitor[]}
          onClose={() => {
            setIsMaintenanceWindowsFlyoutOpen(false);
            setSelectedItems([]);
          }}
          reloadPage={reloadPage}
        />
      )}
    </ContextWrapper>
  );
};
