/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiEmptyPrompt,
  EuiFieldSearch,
  EuiFieldText,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiLink,
  EuiPageSection,
  EuiSpacer,
  EuiTextArea,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
  type CriteriaWithPagination,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import { useHistory } from 'react-router-dom';
import type { DatasetSummary } from '@kbn/evals-common';
import { reactRouterNavigate } from '@kbn/kibana-react-plugin/public';
import { useCreateDataset, useDatasets } from '../../hooks/use_evals_api';
import { useEvalsPermissions } from '../../hooks/use_evals_permissions';
import { DeleteDatasetModal } from '../../components/delete_dataset_modal';
import * as i18n from './translations';

// `created_at` is intentionally omitted: the list surfaces a "Last updated"
// column but not a creation-date one, so it isn't offered as a sort option here.
// The API (sort_field) still supports `created_at` for other consumers.
type SortableField = Extract<keyof DatasetSummary, 'name' | 'examples_count' | 'updated_at'>;

export const DatasetsListPage: React.FC = () => {
  const history = useHistory();
  const { euiTheme } = useEuiTheme();
  const { canManage } = useEvalsPermissions();
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<SortableField>('updated_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [datasetPendingDelete, setDatasetPendingDelete] = useState<DatasetSummary | null>(null);
  const [isCreateFlyoutOpen, setIsCreateFlyoutOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const createDataset = useCreateDataset();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const { data, isLoading, error, refetch } = useDatasets({
    page: pageIndex + 1,
    perPage: pageSize,
    search: debouncedSearch || undefined,
    sortField,
    sortOrder: sortDirection,
  });

  const columns: Array<EuiBasicTableColumn<DatasetSummary>> = useMemo(() => {
    const baseColumns: Array<EuiBasicTableColumn<DatasetSummary>> = [
      {
        field: 'name',
        name: i18n.COLUMN_NAME,
        sortable: true,
        render: (datasetName: string, item: DatasetSummary) => (
          <EuiLink
            {...reactRouterNavigate(history, `/datasets/${item.id}`, (e: React.MouseEvent) =>
              e.stopPropagation()
            )}
          >
            <strong>{datasetName}</strong>
          </EuiLink>
        ),
      },
      {
        field: 'description',
        name: i18n.COLUMN_DESCRIPTION,
        render: (descriptionValue: string) => descriptionValue || '-',
      },
      {
        field: 'examples_count',
        name: i18n.COLUMN_EXAMPLES,
        sortable: true,
        width: '120px',
      },
      {
        field: 'updated_at',
        name: i18n.COLUMN_LAST_UPDATED,
        sortable: true,
        render: (updatedAt: string) => (updatedAt ? new Date(updatedAt).toLocaleString() : '-'),
      },
    ];

    if (canManage) {
      baseColumns.push({
        name: i18n.COLUMN_ACTIONS,
        width: '60px',
        align: 'right',
        render: (item: DatasetSummary) => (
          <EuiToolTip content={i18n.DELETE_DATASET_ACTION} disableScreenReaderOutput>
            <EuiButtonIcon
              aria-label={i18n.getDeleteDatasetAriaLabel(item.name)}
              iconType="trash"
              color="danger"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setDatasetPendingDelete(item);
              }}
              data-test-subj="deleteDatasetButton"
            />
          </EuiToolTip>
        ),
      });
    }

    return baseColumns;
  }, [history, canManage]);

  const pagination = {
    pageIndex,
    pageSize,
    totalItemCount: data?.total ?? 0,
    pageSizeOptions: [10, 25, 50],
  };

  const sorting = {
    sort: {
      field: sortField,
      direction: sortDirection,
    },
  };

  const onTableChange = ({ page, sort }: CriteriaWithPagination<DatasetSummary>) => {
    if (page) {
      setPageIndex(page.index);
      setPageSize(page.size);
    }
    if (sort) {
      setSortField(sort.field as SortableField);
      setSortDirection(sort.direction);
    }
  };

  const openCreateFlyout = () => {
    setName('');
    setDescription('');
    setCreateError(null);
    setIsCreateFlyoutOpen(true);
  };

  const closeCreateFlyout = () => {
    setIsCreateFlyoutOpen(false);
    setCreateError(null);
  };

  const clearSearch = () => {
    setSearchText('');
    setDebouncedSearch('');
    setPageIndex(0);
  };

  const onCreateDataset = async () => {
    if (!name.trim()) {
      setCreateError(i18n.CREATE_DATASET_NAME_REQUIRED_ERROR);
      return;
    }

    try {
      setCreateError(null);
      await createDataset.mutateAsync({
        name: name.trim(),
        description: description.trim(),
      });
      setPageIndex(0);
      closeCreateFlyout();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    }
  };

  const datasets = data?.datasets ?? [];
  const hasActiveSearch = debouncedSearch.trim().length > 0;
  const showNoDatasetsYet = !isLoading && !error && !hasActiveSearch && datasets.length === 0;
  const showNoMatches = !isLoading && !error && hasActiveSearch && datasets.length === 0;
  const showSearchBar = !error && !showNoDatasetsYet;

  return (
    <>
      <EuiPageSection paddingSize="none" css={{ paddingTop: euiTheme.size.l }}>
        {showSearchBar ? (
          <>
            <EuiFlexGroup
              responsive={false}
              alignItems="center"
              justifyContent="spaceBetween"
              gutterSize="m"
            >
              <EuiFlexItem css={{ maxWidth: 500 }}>
                <EuiFieldSearch
                  placeholder={i18n.SEARCH_PLACEHOLDER}
                  value={searchText}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchText(value);
                    if (!value) {
                      setDebouncedSearch('');
                    }
                    setPageIndex(0);
                  }}
                  isClearable
                  fullWidth
                  aria-label={i18n.SEARCH_PLACEHOLDER}
                  data-test-subj="datasetsSearch"
                />
              </EuiFlexItem>
              {canManage ? (
                <EuiFlexItem grow={false}>
                  <EuiButton onClick={openCreateFlyout} fill iconType="plusInCircle">
                    {i18n.CREATE_DATASET_BUTTON}
                  </EuiButton>
                </EuiFlexItem>
              ) : null}
            </EuiFlexGroup>
            <EuiSpacer size="m" />
          </>
        ) : null}
        {error ? (
          <EuiEmptyPrompt
            color="danger"
            iconType="warning"
            title={<h2>{i18n.LOAD_ERROR_TITLE}</h2>}
            body={<p>{i18n.getLoadErrorBody(String(error))}</p>}
            actions={[
              <EuiButton onClick={() => refetch()} iconType="refresh">
                {i18n.RETRY_BUTTON}
              </EuiButton>,
            ]}
          />
        ) : showNoDatasetsYet ? (
          <EuiEmptyPrompt
            iconType="indexOpen"
            title={<h2>{i18n.NO_DATASETS_TITLE}</h2>}
            body={<p>{i18n.NO_DATASETS_BODY}</p>}
            actions={
              canManage
                ? [
                    <EuiButton onClick={openCreateFlyout} fill iconType="plusInCircle">
                      {i18n.CREATE_DATASET_BUTTON}
                    </EuiButton>,
                  ]
                : undefined
            }
          />
        ) : showNoMatches ? (
          <EuiEmptyPrompt
            iconType="search"
            title={<h2>{i18n.NO_MATCHES_TITLE}</h2>}
            body={<p>{i18n.getNoMatchesBody(debouncedSearch)}</p>}
            actions={[
              <EuiButton onClick={clearSearch} iconType="cross">
                {i18n.CLEAR_SEARCH_BUTTON}
              </EuiButton>,
            ]}
          />
        ) : (
          <EuiBasicTable<DatasetSummary>
            tableCaption={i18n.TABLE_CAPTION}
            items={datasets}
            columns={columns}
            loading={isLoading}
            pagination={pagination}
            sorting={sorting}
            onChange={onTableChange}
            rowProps={(item) => ({
              onClick: () => history.push(`/datasets/${item.id}`),
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </EuiPageSection>
      {datasetPendingDelete ? (
        <DeleteDatasetModal
          datasetId={datasetPendingDelete.id}
          datasetName={datasetPendingDelete.name}
          examplesCount={datasetPendingDelete.examples_count}
          onClose={() => setDatasetPendingDelete(null)}
        />
      ) : null}
      {isCreateFlyoutOpen ? (
        <EuiFlyout onClose={closeCreateFlyout} size="s" aria-labelledby="createDatasetFlyoutTitle">
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m">
              <h2 id="createDatasetFlyoutTitle">{i18n.CREATE_DATASET_FLYOUT_TITLE}</h2>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <EuiForm component="form">
              <EuiFormRow
                label={i18n.CREATE_DATASET_NAME_LABEL}
                isInvalid={Boolean(createError)}
                error={createError ?? undefined}
                fullWidth
              >
                <EuiFieldText
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  isInvalid={Boolean(createError)}
                  fullWidth
                />
              </EuiFormRow>
              <EuiFormRow label={i18n.CREATE_DATASET_DESCRIPTION_LABEL} fullWidth>
                <EuiTextArea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  fullWidth
                />
              </EuiFormRow>
            </EuiForm>
          </EuiFlyoutBody>
          <EuiFlyoutFooter>
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty onClick={closeCreateFlyout}>
                  {i18n.CREATE_DATASET_CANCEL_BUTTON}
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  onClick={onCreateDataset}
                  fill
                  isLoading={createDataset.isLoading}
                  disabled={createDataset.isLoading}
                >
                  {i18n.CREATE_DATASET_SUBMIT_BUTTON}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutFooter>
        </EuiFlyout>
      ) : null}
    </>
  );
};
