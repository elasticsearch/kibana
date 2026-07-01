/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FunctionComponent } from 'react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { EuiBasicTableColumn, EuiTabbedContentTab } from '@elastic/eui';
import {
  EuiBetaBadge,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiInMemoryTable,
  EuiLink,
  EuiPageHeader,
  EuiPageSection,
  EuiSelect,
  EuiSpacer,
  EuiTabbedContent,
} from '@elastic/eui';

import type { HttpSetup, ToastsStart } from '@kbn/core/public';
import type { DataSetWithName, DataSourceWithSecrets, DataSource } from '../common';
import type { FederatedIdentityClusterInfo } from './create_data_source_flyout/federated_identity_cluster_info';
import { CreateDatasetFlyout } from './create_dataset_flyout';
import { dataSetFromListItem } from './create_dataset_flyout/dataset_flyout_initial_values';
import { DatasetsClient } from './datasets_client';
import { DataSourcesClient } from './data_sources_client';
import { CreateDataSourceFlyout } from './create_data_source_flyout';
import { dataSourceFromListItem } from './create_data_source_flyout/data_source_flyout_initial_values';
import { getDataSourceTypeVerbose } from './get_data_source_type_label';
import { getFlyoutSaveErrorMessage } from './get_flyout_save_error_message';
import { mainTranslations } from './main_i18n';
import { ConfirmDeleteDataSourceModal } from './confirm_delete_data_source_modal';
import { ConfirmDeleteDataSourcesModal } from './confirm_delete_data_sources_modal';
import { ConfirmDeleteDataSetModal } from './confirm_delete_data_set_modal';
import { ConfirmDeleteDataSetsModal } from './confirm_delete_data_sets_modal';

/** Data set row in the table; `type` is resolved from the linked data source. */
type DataSetListRow = DataSetWithName & { type?: DataSource['type'] };

type DataSourceFlyoutState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; dataSource: DataSourceWithSecrets };

type DataSetFlyoutState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; dataSet: DataSetWithName };

export interface MainProps {
  httpClient: HttpSetup;
  toasts: ToastsStart;
  cloudInfo?: FederatedIdentityClusterInfo;
  featureFlags?: {
    enableFederatedIdentityAuth?: boolean;
    enableGoogleCloudStorageDataSourceType?: boolean;
    enableAzureDataSourceType?: boolean;
  };
}

export const Main: FunctionComponent<MainProps> = ({
  httpClient,
  toasts,
  cloudInfo,
  featureFlags,
}) => {
  const enableFederatedIdentityAuth = featureFlags?.enableFederatedIdentityAuth;
  const enableGoogleCloudStorageDataSourceType =
    featureFlags?.enableGoogleCloudStorageDataSourceType;
  const enableAzureDataSourceType = featureFlags?.enableAzureDataSourceType;
  const dataClient = useMemo(() => new DataSourcesClient(httpClient), [httpClient]);
  const dataSetsClient = useMemo(() => new DatasetsClient(httpClient), [httpClient]);
  const [items, setItems] = useState<DataSource[]>([]);
  const [selectedItems, setSelectedItems] = useState<DataSource[]>([]);
  const [selectedDataSets, setSelectedDataSets] = useState<DataSetListRow[]>([]);
  const [dataSourceFilter, setDataSourceFilter] = useState<string>('');
  const [hasLoadedDataSources, setHasLoadedDataSources] = useState(false);
  const [hasLoadedDataSets, setHasLoadedDataSets] = useState(false);
  const [selectedTabId, setSelectedTabId] = useState<'sets' | 'sources'>('sets');
  const [hasUserSelectedTab, setHasUserSelectedTab] = useState(false);
  const [pendingDeleteDataSource, setPendingDeleteDataSource] = useState<DataSource | null>(null);
  const [isDeletingDataSource, setIsDeletingDataSource] = useState(false);
  const [deleteDataSourceError, setDeleteDataSourceError] = useState<string | null>(null);
  const [pendingDeleteDataSources, setPendingDeleteDataSources] = useState<
    readonly DataSource[] | null
  >(null);
  const [isDeletingDataSources, setIsDeletingDataSources] = useState(false);
  const [deleteDataSourcesError, setDeleteDataSourcesError] = useState<string | null>(null);
  const [pendingDeleteDataSet, setPendingDeleteDataSet] = useState<DataSetListRow | null>(null);
  const [isDeletingDataSet, setIsDeletingDataSet] = useState(false);
  const [deleteDataSetError, setDeleteDataSetError] = useState<string | null>(null);
  const [pendingDeleteDataSets, setPendingDeleteDataSets] = useState<
    readonly DataSetListRow[] | null
  >(null);
  const [isDeletingDataSets, setIsDeletingDataSets] = useState(false);
  const [deleteDataSetsError, setDeleteDataSetsError] = useState<string | null>(null);
  const [dataSetsRaw, setDataSetsRaw] = useState<DataSetWithName[]>([]);
  const [dataSourceFlyout, setDataSourceFlyout] = useState<DataSourceFlyoutState>({
    kind: 'closed',
  });
  const [dataSetFlyout, setDataSetFlyout] = useState<DataSetFlyoutState>({ kind: 'closed' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextItems = await dataClient.get();
        if (!cancelled) {
          setItems(nextItems);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setHasLoadedDataSources(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataClient]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextItems = await dataSetsClient.get();
        if (!cancelled) {
          setDataSetsRaw(nextItems);
        }
      } catch {
        if (!cancelled) {
          setDataSetsRaw([]);
        }
      } finally {
        if (!cancelled) {
          setHasLoadedDataSets(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataSetsClient]);

  useEffect(() => {
    if (hasUserSelectedTab || !hasLoadedDataSources || !hasLoadedDataSets) {
      return;
    }

    if (items.length === 0 && dataSetsRaw.length === 0) {
      setSelectedTabId('sources');
    }
  }, [
    dataSetsRaw.length,
    hasLoadedDataSets,
    hasLoadedDataSources,
    hasUserSelectedTab,
    items.length,
  ]);

  const dataSetItems: DataSetListRow[] = useMemo(() => {
    const sourceByName = new Map(items.map((ds) => [ds.name, ds] as const));
    return dataSetsRaw.map((ds) => ({
      ...ds,
      type: sourceByName.get(ds.data_source)?.type,
    }));
  }, [dataSetsRaw, items]);

  const dataSetsCountByDataSource = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ds of dataSetsRaw) {
      counts.set(ds.data_source, (counts.get(ds.data_source) ?? 0) + 1);
    }
    return counts;
  }, [dataSetsRaw]);

  useEffect(() => {
    setSelectedItems((prev) =>
      prev.filter((item) => (dataSetsCountByDataSource.get(item.name) ?? 0) === 0)
    );
  }, [dataSetsCountByDataSource]);

  const dataSourceFilterOptions = useMemo(
    () => [
      { value: '', text: mainTranslations.filters.allDataSources },
      ...[...new Set(items.map((ds) => ds.name))]
        .sort()
        .map((name) => ({ value: name, text: name })),
    ],
    [items]
  );

  useEffect(() => {
    if (dataSourceFilter && !items.some((ds) => ds.name === dataSourceFilter)) {
      setDataSourceFilter('');
    }
  }, [dataSourceFilter, items]);

  useEffect(() => {
    setSelectedDataSets([]);
  }, [dataSourceFilter]);

  const filteredDataSetItems = useMemo(() => {
    if (!dataSourceFilter) {
      return dataSetItems;
    }
    return dataSetItems.filter((ds) => ds.data_source === dataSourceFilter);
  }, [dataSetItems, dataSourceFilter]);

  const handleDataSourceSave = useCallback(
    async (dataSource: DataSourceWithSecrets): Promise<string | null> => {
      try {
        await dataClient.add(dataSource);
        setItems(await dataClient.get());
        setDataSourceFlyout({ kind: 'closed' });
        return null;
      } catch (e) {
        return getFlyoutSaveErrorMessage(e);
      }
    },
    [dataClient]
  );

  const handleEditDataSource = useCallback((item: DataSource) => {
    setDataSourceFlyout({
      kind: 'edit',
      dataSource: dataSourceFromListItem(item),
    });
  }, []);

  const handleDeleteDataSource = useCallback((item: DataSource) => {
    setPendingDeleteDataSource(item);
    setDeleteDataSourceError(null);
  }, []);

  const confirmDeleteDataSource = useCallback(async () => {
    if (!pendingDeleteDataSource) {
      return;
    }
    setIsDeletingDataSource(true);
    setDeleteDataSourceError(null);
    try {
      await dataClient.delete(pendingDeleteDataSource.name);
      setItems(await dataClient.get());
      setSelectedItems([]);
      setPendingDeleteDataSource(null);
    } catch (e) {
      const message = getFlyoutSaveErrorMessage(e);
      setDeleteDataSourceError(message);
      toasts.addDanger({
        title: mainTranslations.confirmDeleteDataSource.errorTitle,
        text: message,
      });
    } finally {
      setIsDeletingDataSource(false);
    }
  }, [dataClient, pendingDeleteDataSource, toasts]);

  const cancelDeleteDataSource = useCallback(() => {
    if (isDeletingDataSource) {
      return;
    }
    setPendingDeleteDataSource(null);
    setDeleteDataSourceError(null);
  }, [isDeletingDataSource]);

  const cancelDeleteDataSources = useCallback(() => {
    if (isDeletingDataSources) {
      return;
    }
    setPendingDeleteDataSources(null);
    setDeleteDataSourcesError(null);
  }, [isDeletingDataSources]);

  const confirmDeleteDataSources = useCallback(async () => {
    if (!pendingDeleteDataSources || pendingDeleteDataSources.length === 0) {
      return;
    }

    const hasRelatedDataSets = pendingDeleteDataSources.some(
      (ds) => (dataSetsCountByDataSource.get(ds.name) ?? 0) > 0
    );
    if (hasRelatedDataSets) {
      setDeleteDataSourcesError(mainTranslations.confirmDeleteDataSources.hasRelatedDataSetsError);
      return;
    }

    setIsDeletingDataSources(true);
    setDeleteDataSourcesError(null);
    try {
      await dataClient.delete(pendingDeleteDataSources.map((ds) => ds.name));
      setItems(await dataClient.get());
      setSelectedItems([]);
      setPendingDeleteDataSources(null);
    } catch (e) {
      const message = getFlyoutSaveErrorMessage(e);
      setDeleteDataSourcesError(message);
      toasts.addDanger({
        title: mainTranslations.confirmDeleteDataSources.errorTitle,
        text: message,
      });
    } finally {
      setIsDeletingDataSources(false);
    }
  }, [dataClient, dataSetsCountByDataSource, pendingDeleteDataSources, toasts]);

  const handleDataSetSave = useCallback(
    async (dataSet: DataSetWithName, previousId?: string): Promise<string | null> => {
      try {
        const nextId = dataSet.name.trim();
        const prevIdTrimmed = previousId?.trim();

        await dataSetsClient.add(dataSet);

        if (prevIdTrimmed && prevIdTrimmed !== nextId) {
          await dataSetsClient.delete(prevIdTrimmed);
        }

        setDataSetsRaw(await dataSetsClient.get());
        setDataSetFlyout({ kind: 'closed' });
        return null;
      } catch (e) {
        return getFlyoutSaveErrorMessage(e);
      }
    },
    [dataSetsClient]
  );

  const handleEditDataSet = useCallback((item: DataSetListRow) => {
    setDataSetFlyout({
      kind: 'edit',
      dataSet: dataSetFromListItem(item),
    });
  }, []);

  const handleDeleteDataSet = useCallback((item: DataSetListRow) => {
    setPendingDeleteDataSet(item);
    setDeleteDataSetError(null);
  }, []);

  const confirmDeleteDataSet = useCallback(async () => {
    if (!pendingDeleteDataSet) {
      return;
    }
    setIsDeletingDataSet(true);
    setDeleteDataSetError(null);
    try {
      await dataSetsClient.delete(pendingDeleteDataSet.name);
      setDataSetsRaw(await dataSetsClient.get());
      setSelectedDataSets([]);
      setPendingDeleteDataSet(null);
    } catch (e) {
      const message = getFlyoutSaveErrorMessage(e);
      setDeleteDataSetError(message);
      toasts.addDanger({
        title: mainTranslations.confirmDeleteDataSet.errorTitle,
        text: message,
      });
    } finally {
      setIsDeletingDataSet(false);
    }
  }, [dataSetsClient, pendingDeleteDataSet, toasts]);

  const cancelDeleteDataSets = useCallback(() => {
    if (isDeletingDataSets) {
      return;
    }
    setPendingDeleteDataSets(null);
    setDeleteDataSetsError(null);
  }, [isDeletingDataSets]);

  const confirmDeleteDataSets = useCallback(async () => {
    if (!pendingDeleteDataSets || pendingDeleteDataSets.length === 0) {
      return;
    }

    setIsDeletingDataSets(true);
    setDeleteDataSetsError(null);
    try {
      await dataSetsClient.delete(pendingDeleteDataSets.map((item) => item.name));
      setDataSetsRaw(await dataSetsClient.get());
      setSelectedDataSets([]);
      setPendingDeleteDataSets(null);
    } catch (e) {
      const message = getFlyoutSaveErrorMessage(e);
      setDeleteDataSetsError(message);
      toasts.addDanger({
        title: mainTranslations.confirmDeleteDataSets.errorTitle,
        text: message,
      });
    } finally {
      setIsDeletingDataSets(false);
    }
  }, [dataSetsClient, pendingDeleteDataSets, toasts]);

  const cancelDeleteDataSet = useCallback(() => {
    if (isDeletingDataSet) {
      return;
    }
    setPendingDeleteDataSet(null);
    setDeleteDataSetError(null);
  }, [isDeletingDataSet]);

  const columns = useMemo<Array<EuiBasicTableColumn<DataSource>>>(
    () => [
      {
        field: 'name',
        name: mainTranslations.columns.dataSources.name,
        sortable: true,
        width: '22%',
        'data-test-subj': 'dataSetsColName',
      },
      {
        name: mainTranslations.columns.dataSources.dataSetsCount,
        width: '10%',
        render: (item: DataSource) => dataSetsCountByDataSource.get(item.name) ?? 0,
        'data-test-subj': 'dataSetsColDataSetsCount',
      },
      {
        field: 'type',
        name: mainTranslations.columns.dataSources.type,
        sortable: true,
        width: '18%',
        render: (value: DataSource['type']) => getDataSourceTypeVerbose(value),
        'data-test-subj': 'dataSetsColType',
      },
      {
        field: 'description',
        name: mainTranslations.columns.dataSources.description,
        sortable: true,
        truncateText: true,
        'data-test-subj': 'dataSetsColDescription',
      },
      {
        name: mainTranslations.columns.dataSources.actions,
        width: '8%',
        actions: [
          {
            name: mainTranslations.columns.dataSources.editAction,
            description: mainTranslations.columns.dataSources.editActionDescription,
            icon: 'pencil',
            type: 'icon',
            onClick: (item) => {
              handleEditDataSource(item);
            },
            'data-test-subj': 'dataSetsEditButton',
          },
          {
            name: mainTranslations.columns.dataSources.deleteAction,
            description: mainTranslations.columns.dataSources.deleteActionDescription,
            icon: 'trash',
            color: 'danger',
            type: 'icon',
            enabled: (item) => (dataSetsCountByDataSource.get(item.name) ?? 0) === 0,
            onClick: (item) => {
              handleDeleteDataSource(item);
            },
            'data-test-subj': 'dataSetsDeleteIconButton',
          },
        ],
      },
    ],
    [dataSetsCountByDataSource, handleDeleteDataSource, handleEditDataSource]
  );

  const dataSetColumns = useMemo<Array<EuiBasicTableColumn<DataSetListRow>>>(
    () => [
      {
        field: 'name',
        name: mainTranslations.columns.dataSets.name,
        sortable: true,
        width: '18%',
        'data-test-subj': 'dataSetsSetsColName',
      },
      {
        field: 'data_source',
        name: mainTranslations.columns.dataSets.dataSourceId,
        sortable: true,
        width: '18%',
        'data-test-subj': 'dataSetsSetsColDataSourceId',
      },
      {
        field: 'type',
        name: mainTranslations.columns.dataSets.dataSourceType,
        render: (type: DataSetListRow['type']) =>
          type
            ? getDataSourceTypeVerbose(type)
            : mainTranslations.columns.dataSets.dataSourceTypeMissing,
        sortable: true,
        width: '18%',
        'data-test-subj': 'dataSetsSetsColDataSourceType',
      },
      {
        field: 'resource',
        name: mainTranslations.columns.dataSets.resource,
        sortable: true,
        width: '22%',
        'data-test-subj': 'dataSetsSetsColResource',
      },
      {
        field: 'description',
        name: mainTranslations.columns.dataSets.description,
        sortable: true,
        truncateText: true,
        'data-test-subj': 'dataSetsSetsColDescription',
      },
      {
        name: mainTranslations.columns.dataSets.actions,
        width: '8%',
        actions: [
          {
            name: mainTranslations.columns.dataSets.editAction,
            description: mainTranslations.columns.dataSets.editActionDescription,
            icon: 'pencil',
            type: 'icon',
            onClick: (item) => {
              handleEditDataSet(item);
            },
            'data-test-subj': 'dataSetsSetsEditButton',
          },
          {
            name: mainTranslations.columns.dataSets.deleteAction,
            description: mainTranslations.columns.dataSets.deleteActionDescription,
            icon: 'trash',
            color: 'danger',
            type: 'icon',
            onClick: (item) => {
              handleDeleteDataSet(item);
            },
            'data-test-subj': 'dataSetsSetsDeleteIconButton',
          },
        ],
      },
    ],
    [handleDeleteDataSet, handleEditDataSet]
  );

  const tabs = useMemo<EuiTabbedContentTab[]>(
    () => [
      {
        id: 'sets',
        name: mainTranslations.tabs.sets,
        content: (
          <>
            <EuiSpacer size="m" />
            <EuiInMemoryTable<DataSetListRow>
              items={filteredDataSetItems}
              itemId="name"
              columns={dataSetColumns}
              search={{
                box: {
                  incremental: true,
                  placeholder: mainTranslations.columns.dataSets.searchPlaceholder,
                  'data-test-subj': 'dataSetsSetsSearch',
                  schema: {
                    fields: {
                      name: { type: 'string' },
                      data_source: { type: 'string' },
                      type: { type: 'string' },
                      resource: { type: 'string' },
                      description: { type: 'string' },
                    },
                  },
                },
                toolsLeft:
                  selectedDataSets.length > 0 ? (
                    <EuiButton
                      color="danger"
                      data-test-subj="dataSetsSetsDeleteButton"
                      iconType="trash"
                      onClick={() => {
                        setPendingDeleteDataSets(selectedDataSets);
                        setDeleteDataSetsError(null);
                      }}
                    >
                      {mainTranslations.actions.deleteButtonLabel}
                    </EuiButton>
                  ) : undefined,
                toolsRight: (
                  <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center">
                    <EuiFlexItem grow={false}>
                      <EuiSelect
                        data-test-subj="dataSetsSetsDataSourceFilter"
                        aria-label={mainTranslations.filters.dataSource}
                        options={dataSourceFilterOptions}
                        value={dataSourceFilter}
                        onChange={(e) => setDataSourceFilter(e.target.value)}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiButton
                        fill
                        color="primary"
                        data-test-subj="dataSetsSetsCreateButton"
                        onClick={() => setDataSetFlyout({ kind: 'create' })}
                        disabled={items.length === 0}
                      >
                        {mainTranslations.columns.dataSets.addButtonLabel}
                      </EuiButton>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                ),
              }}
              rowHeader="name"
              selection={{
                selected: selectedDataSets,
                onSelectionChange: setSelectedDataSets,
              }}
              sorting
              pagination={{
                pageSizeOptions: [5, 10, 20],
                initialPageSize: 10,
              }}
              data-test-subj="dataSetsSetsTable"
              tableCaption={mainTranslations.columns.dataSets.caption}
              noItemsMessage={mainTranslations.columns.dataSets.noItems}
              tableLayout="auto"
              responsiveBreakpoint={false}
            />
          </>
        ),
      },
      {
        id: 'sources',
        name: mainTranslations.tabs.sources,
        content: (
          <>
            <EuiSpacer size="m" />
            <EuiInMemoryTable<DataSource>
              items={items}
              itemId="name"
              columns={columns}
              search={{
                box: {
                  incremental: true,
                  placeholder: mainTranslations.columns.dataSources.searchPlaceholder,
                  'data-test-subj': 'dataSetsSearch',
                  schema: {
                    fields: {
                      name: { type: 'string' },
                      type: { type: 'string' },
                      description: { type: 'string' },
                    },
                  },
                },
                toolsLeft:
                  selectedItems.length > 0 ? (
                    <EuiButton
                      color="danger"
                      data-test-subj="dataSetsDeleteButton"
                      iconType="trash"
                      onClick={() => {
                        setPendingDeleteDataSources(selectedItems);
                        setDeleteDataSourcesError(null);
                      }}
                    >
                      {mainTranslations.actions.deleteButtonLabel}
                    </EuiButton>
                  ) : undefined,
                toolsRight: (
                  <EuiButton
                    fill
                    color="primary"
                    data-test-subj="dataSetsCreateButton"
                    onClick={() => {
                      setDataSourceFlyout({ kind: 'create' });
                    }}
                  >
                    {mainTranslations.actions.addButtonLabel}
                  </EuiButton>
                ),
              }}
              rowHeader="name"
              selection={{
                selected: selectedItems,
                onSelectionChange: setSelectedItems,
                selectable: (row) => (dataSetsCountByDataSource.get(row.name) ?? 0) === 0,
              }}
              sorting
              pagination={{
                pageSizeOptions: [5, 10, 20],
                initialPageSize: 10,
              }}
              data-test-subj="dataSetsTable"
              tableCaption={mainTranslations.columns.dataSources.caption}
              noItemsMessage={mainTranslations.columns.dataSources.noItems}
              tableLayout="auto"
              responsiveBreakpoint={false}
            />
          </>
        ),
      },
    ],
    [
      columns,
      dataSetsCountByDataSource,
      dataSetColumns,
      dataSourceFilter,
      dataSourceFilterOptions,
      filteredDataSetItems,
      items,
      selectedDataSets,
      selectedItems,
    ]
  );

  const selectedTab = useMemo(
    () => tabs.find((tab) => tab.id === selectedTabId) ?? tabs[0],
    [selectedTabId, tabs]
  );

  return (
    <>
      <EuiPageHeader
        bottomBorder
        pageTitle={
          <>
            <span data-test-subj="dataSetsPageTitle">{mainTranslations.pageTitle}</span>
            &nbsp;
            <EuiBetaBadge label={mainTranslations.technicalPreview} size="m" />
          </>
        }
        description={
          <>
            {mainTranslations.pageDescription}{' '}
            <EuiLink
              href="https://www.elastic.co/docs/reference/query-languages/esql/esql-federated-data"
              target="_blank"
            >
              {mainTranslations.docsLink}
            </EuiLink>
          </>
        }
      />
      <EuiPageSection paddingSize="m">
        <EuiTabbedContent
          tabs={tabs}
          selectedTab={selectedTab}
          onTabClick={(tab) => {
            setHasUserSelectedTab(true);
            setSelectedTabId(tab.id === 'sources' ? 'sources' : 'sets');
          }}
          autoFocus="initial"
          data-test-subj="dataSetsTabs"
        />
      </EuiPageSection>
      {pendingDeleteDataSource ? (
        <ConfirmDeleteDataSourceModal
          dataSourceName={pendingDeleteDataSource.name}
          isDeleting={isDeletingDataSource}
          error={deleteDataSourceError}
          onConfirm={() => void confirmDeleteDataSource()}
          onCancel={cancelDeleteDataSource}
        />
      ) : null}
      {pendingDeleteDataSources ? (
        <ConfirmDeleteDataSourcesModal
          dataSourceNames={pendingDeleteDataSources.map((ds) => ds.name)}
          isDeleting={isDeletingDataSources}
          error={deleteDataSourcesError}
          onConfirm={() => void confirmDeleteDataSources()}
          onCancel={cancelDeleteDataSources}
        />
      ) : null}
      {pendingDeleteDataSet ? (
        <ConfirmDeleteDataSetModal
          dataSetName={pendingDeleteDataSet.name}
          isDeleting={isDeletingDataSet}
          error={deleteDataSetError}
          onConfirm={() => void confirmDeleteDataSet()}
          onCancel={cancelDeleteDataSet}
        />
      ) : null}
      {pendingDeleteDataSets ? (
        <ConfirmDeleteDataSetsModal
          dataSetNames={pendingDeleteDataSets.map((ds) => ds.name)}
          isDeleting={isDeletingDataSets}
          error={deleteDataSetsError}
          onConfirm={() => void confirmDeleteDataSets()}
          onCancel={cancelDeleteDataSets}
        />
      ) : null}
      {dataSourceFlyout.kind !== 'closed' ? (
        <CreateDataSourceFlyout
          key={dataSourceFlyout.kind === 'edit' ? dataSourceFlyout.dataSource.name : 'create'}
          initialDataSource={
            dataSourceFlyout.kind === 'edit' ? dataSourceFlyout.dataSource : undefined
          }
          dataSourcesClient={dataClient}
          toasts={toasts}
          cloudInfo={cloudInfo}
          existingDataSourceNames={items.map((ds) => ds.name)}
          featureFlags={{
            enableFederatedIdentityAuth,
            enableGoogleCloudStorageDataSourceType,
            enableAzureDataSourceType,
          }}
          onClose={() => setDataSourceFlyout({ kind: 'closed' })}
          onSave={handleDataSourceSave}
        />
      ) : null}
      {dataSetFlyout.kind !== 'closed' ? (
        <CreateDatasetFlyout
          key={dataSetFlyout.kind === 'edit' ? dataSetFlyout.dataSet.name : 'create'}
          initialDataSet={dataSetFlyout.kind === 'edit' ? dataSetFlyout.dataSet : undefined}
          existingDataSetNames={dataSetsRaw.map((ds) => ds.name)}
          dataSources={items}
          onClose={() => setDataSetFlyout({ kind: 'closed' })}
          onSave={handleDataSetSave}
        />
      ) : null}
    </>
  );
};
