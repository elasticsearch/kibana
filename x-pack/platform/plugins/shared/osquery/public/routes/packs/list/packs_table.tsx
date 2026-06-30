/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { CriteriaWithPagination, EuiBasicTableColumn } from '@elastic/eui';
import {
  EuiBasicTable,
  EuiButton,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiSkeletonText,
  EuiSpacer,
  EuiToolTip,
} from '@elastic/eui';
import moment from 'moment-timezone';
import { i18n } from '@kbn/i18n';
import { useHistory } from 'react-router-dom';
import { FormattedMessage } from '@kbn/i18n-react';
import useLocalStorage from 'react-use/lib/useLocalStorage';
import { useKibana, useRouterNavigate } from '../../../common/lib/kibana';
import { usePersistedPageSize, PAGE_SIZE_OPTIONS } from '../../../common/use_persisted_page_size';
import { usePacks } from '../../../packs/use_packs';
import { usePackUsers } from '../../../common/use_saved_object_users';
import { RunByColumn } from '../../../actions/components/run_by_column';
import { PacksTableEmptyState } from './empty_state';
import { TableToolbar } from '../../../components/table_toolbar';
import type { EnabledFilter, SortDirection } from '../../../components/table_toolbar';
import { ActiveStateSwitch } from '../../../packs/active_state_switch';
import { PackRowActions } from '../../../packs/pack_row_actions';
import type { PackSavedObject } from '../../../packs/types';
import { LoadIntegrationAssetsButton } from './load_integration_assets';

const EMPTY_ARRAY: PackSavedObject[] = [];

const PACKS_COLUMNS_STORAGE_KEY = 'osquery:packsColumns';

const SEARCH_PLACEHOLDER = i18n.translate('xpack.osquery.packList.searchPlaceholder', {
  defaultMessage: 'Search by pack name or description',
});

const ALL_COLUMN_IDS = [
  'name',
  'policy_ids',
  'queries',
  'created_by',
  'updated_at',
  'enabled',
] as const;

const COLUMN_CONFIGS = [
  {
    id: 'name',
    label: i18n.translate('xpack.osquery.packs.table.nameColumnTitle', {
      defaultMessage: 'Name',
    }),
  },
  {
    id: 'policy_ids',
    label: i18n.translate('xpack.osquery.packs.table.policyColumnTitle', {
      defaultMessage: 'Scheduled policies',
    }),
  },
  {
    id: 'queries',
    label: i18n.translate('xpack.osquery.packs.table.numberOfQueriesColumnTitle', {
      defaultMessage: 'Number of queries',
    }),
  },
  {
    id: 'created_by',
    label: i18n.translate('xpack.osquery.packs.table.createdByColumnTitle', {
      defaultMessage: 'Created by',
    }),
  },
  {
    id: 'updated_at',
    label: i18n.translate('xpack.osquery.packs.table.lastUpdatedColumnTitle', {
      defaultMessage: 'Last updated',
    }),
  },
  {
    id: 'enabled',
    label: i18n.translate('xpack.osquery.packs.table.enableColumnTitle', {
      defaultMessage: 'Enable',
    }),
  },
];

const SORT_FIELDS = [
  {
    id: 'created_by',
    label: i18n.translate('xpack.osquery.packs.sort.createdByLabel', {
      defaultMessage: 'Created by',
    }),
  },
  {
    id: 'updated_at',
    label: i18n.translate('xpack.osquery.packs.sort.updatedAtLabel', {
      defaultMessage: 'Last updated',
    }),
  },
];

const updatedAtCss = {
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const PackName = ({ id, name }: { id: string; name: string }) => (
  <EuiLink {...useRouterNavigate(`packs/${id}/edit`)}>{name}</EuiLink>
);

const PacksTableComponent = ({ hasAssetsToInstall }: { hasAssetsToInstall?: boolean }) => {
  const permissions = useKibana().services.application.capabilities.osquery;
  const { push } = useHistory();
  const newPackLinkProps = useRouterNavigate('packs/add');

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = usePersistedPageSize();
  const [sortField, setSortField] = useState('updated_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchValue, setSearchValue] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>(undefined);
  const [storedColumns, setStoredColumns] = useLocalStorage<string[]>(PACKS_COLUMNS_STORAGE_KEY, [
    ...ALL_COLUMN_IDS,
  ]);
  const visibleColumns = useMemo(() => storedColumns ?? [...ALL_COLUMN_IDS], [storedColumns]);

  const selectedUsersParam = selectedUsers.length > 0 ? selectedUsers.join(',') : undefined;

  const { data, isLoading, isFetching } = usePacks({
    pageIndex,
    pageSize,
    sortField,
    sortOrder: sortDirection,
    search: searchValue || undefined,
    createdBy: selectedUsersParam,
    enabled: enabledFilter,
  });

  const items = useMemo(() => data?.data ?? EMPTY_ARRAY, [data?.data]);
  const totalItemCount = data?.total ?? 0;

  const { users, profilesMap, isLoading: isLoadingUsers } = usePackUsers();

  const handleSearchSubmit = useCallback((value: string) => {
    setSearchValue(value);
    setPageIndex(0);
  }, []);

  const handleSelectedUsersChange = useCallback((newUsers: string[]) => {
    setSelectedUsers(newUsers);
    setPageIndex(0);
  }, []);

  const handleEnabledFilterChange = useCallback((value: EnabledFilter) => {
    setEnabledFilter(value);
    setPageIndex(0);
  }, []);

  const handleSortChange = useCallback((field: string, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
    setPageIndex(0);
  }, []);

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize(size);
      setPageIndex(0);
    },
    [setPageSize]
  );

  const handleVisibleColumnsChange = useCallback(
    (columnIds: string[]) => {
      setStoredColumns(columnIds);
    },
    [setStoredColumns]
  );

  const handlePlayClick = useCallback(
    (item: PackSavedObject) => () =>
      push('/new', {
        form: {
          packId: item.saved_object_id,
        },
      }),
    [push]
  );

  const renderPlayAction = useCallback(
    (item: PackSavedObject) => {
      const playText = i18n.translate('xpack.osquery.packs.table.runActionAriaLabel', {
        defaultMessage: 'Run {packName}',
        values: { packName: item.name },
      });
      const canRun = permissions.writeLiveQueries || permissions.runSavedQueries;

      return (
        <EuiToolTip position="top" content={playText} disableScreenReaderOutput>
          <EuiButtonIcon
            color="primary"
            iconType="play"
            isDisabled={!canRun}
            onClick={handlePlayClick(item)}
            aria-label={playText}
          />
        </EuiToolTip>
      );
    },
    [handlePlayClick, permissions.writeLiveQueries, permissions.runSavedQueries]
  );

  const renderCreatedByColumn = useCallback(
    (_: unknown, item: PackSavedObject) => (
      <RunByColumn
        userId={item.created_by}
        userProfileUid={item.created_by_profile_uid}
        profilesMap={profilesMap}
        isLoadingProfiles={isLoadingUsers}
      />
    ),
    [profilesMap, isLoadingUsers]
  );

  const renderUpdatedAt = useCallback((updatedAt: string) => {
    if (!updatedAt) return <>-</>;

    return (
      <EuiToolTip content={moment(updatedAt).format('llll')}>
        <span tabIndex={0} css={updatedAtCss}>
          {moment(updatedAt).fromNow()}
        </span>
      </EuiToolTip>
    );
  }, []);

  const visibleSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);

  const columns = useMemo(() => {
    const cols: Array<EuiBasicTableColumn<PackSavedObject>> = [
      {
        name: i18n.translate('xpack.osquery.packs.table.actionsColumnTitle', {
          defaultMessage: 'Actions',
        }),
        width: '75px',
        render: (item: PackSavedObject) => renderPlayAction(item),
      },
    ];

    if (visibleSet.has('name')) {
      cols.push({
        field: 'name',
        name: i18n.translate('xpack.osquery.packs.table.nameColumnTitle', {
          defaultMessage: 'Name',
        }),
        width: '50%',
        truncateText: true,
        render: (_: unknown, item: PackSavedObject) => (
          <PackName id={item.saved_object_id} name={item.name} />
        ),
      });
    }

    if (visibleSet.has('policy_ids')) {
      cols.push({
        field: 'policy_ids',
        name: i18n.translate('xpack.osquery.packs.table.policyColumnTitle', {
          defaultMessage: 'Scheduled policies',
        }),
        truncateText: true,
        width: '10%',
        render: (policyIds: string[]) => <>{policyIds?.length ?? 0}</>,
      });
    }

    if (visibleSet.has('queries')) {
      cols.push({
        field: 'queries',
        name: i18n.translate('xpack.osquery.packs.table.numberOfQueriesColumnTitle', {
          defaultMessage: 'Number of queries',
        }),
        width: '10%',
        render: (queries: PackSavedObject['queries']) => <>{Object.keys(queries).length}</>,
      });
    }

    if (visibleSet.has('created_by')) {
      cols.push({
        field: 'created_by',
        name: i18n.translate('xpack.osquery.packs.table.createdByColumnTitle', {
          defaultMessage: 'Created by',
        }),
        sortable: true,
        render: renderCreatedByColumn,
        width: '12%',
      });
    }

    if (visibleSet.has('updated_at')) {
      cols.push({
        field: 'updated_at',
        name: i18n.translate('xpack.osquery.packs.table.lastUpdatedColumnTitle', {
          defaultMessage: 'Last updated',
        }),
        sortable: true,
        render: renderUpdatedAt,
        width: '10%',
      });
    }

    if (visibleSet.has('enabled')) {
      cols.push({
        field: 'enabled',
        name: i18n.translate('xpack.osquery.packs.table.enableColumnTitle', {
          defaultMessage: 'Enable',
        }),
        width: '80px',
        render: (_: unknown, item: PackSavedObject) => <ActiveStateSwitch item={item} />,
      });
    }

    cols.push({
      width: '40px',
      render: (item: PackSavedObject) => <PackRowActions item={item} />,
    });

    return cols;
  }, [visibleSet, renderPlayAction, renderCreatedByColumn, renderUpdatedAt]);

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
      totalItemCount,
      pageSizeOptions: [...PAGE_SIZE_OPTIONS],
    }),
    [pageIndex, pageSize, totalItemCount]
  );

  const sorting = useMemo(
    () => ({
      sort: {
        field: sortField as keyof PackSavedObject,
        direction: sortDirection,
      },
    }),
    [sortField, sortDirection]
  );

  const onTableChange = useCallback(
    ({ page, sort }: CriteriaWithPagination<PackSavedObject>) => {
      if (page) {
        setPageIndex(page.index);
        if (page.size !== pageSize) {
          handlePageSizeChange(page.size);
        }
      }

      if (sort) {
        setSortField(sort.field as string);
        setSortDirection(sort.direction);
      }
    },
    [pageSize, handlePageSizeChange]
  );

  const actionButtons = useMemo(
    () => (
      <EuiFlexGroup gutterSize="m" responsive={false}>
        {hasAssetsToInstall && (
          <EuiFlexItem grow={false}>
            <LoadIntegrationAssetsButton />
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <EuiButton
            {...newPackLinkProps}
            iconType="plusInCircle"
            isDisabled={!permissions.writePacks}
            data-test-subj="add-pack-button"
          >
            <FormattedMessage
              id="xpack.osquery.packList.createPackButtonLabel"
              defaultMessage="Create pack"
            />
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
    [permissions.writePacks, newPackLinkProps, hasAssetsToInstall]
  );

  if (isLoading) {
    return <EuiSkeletonText lines={10} />;
  }

  const hasActiveFilters = !!searchValue || selectedUsers.length > 0 || enabledFilter !== undefined;

  if (totalItemCount === 0 && !hasActiveFilters && hasAssetsToInstall) {
    return <PacksTableEmptyState />;
  }

  return (
    <>
      <TableToolbar
        searchPlaceholder={SEARCH_PLACEHOLDER}
        searchValue={searchValue}
        onSearchSubmit={handleSearchSubmit}
        users={users}
        selectedUsers={selectedUsers}
        onSelectedUsersChange={handleSelectedUsersChange}
        profilesMap={profilesMap}
        showEnabledFilter
        enabledFilter={enabledFilter}
        onEnabledFilterChange={handleEnabledFilterChange}
        columnConfigs={COLUMN_CONFIGS}
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={handleVisibleColumnsChange}
        sortFields={SORT_FIELDS}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
        actionButton={actionButtons}
        data-test-subj="packs-toolbar"
      />
      <EuiSpacer size="s" />
      <EuiBasicTable<PackSavedObject>
        items={items}
        itemId="saved_object_id"
        columns={columns}
        pagination={pagination}
        sorting={sorting}
        onChange={onTableChange}
        loading={isFetching && !isLoading}
        tableCaption={i18n.translate('xpack.osquery.packs.table.caption', {
          defaultMessage: 'List of saved packs',
        })}
        data-test-subj="packsTable"
      />
    </>
  );
};

export const PacksTable = React.memo(PacksTableComponent);
PacksTable.displayName = 'PacksTable';
