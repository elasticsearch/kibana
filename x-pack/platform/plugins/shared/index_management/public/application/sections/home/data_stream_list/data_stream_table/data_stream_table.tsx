/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';
import React, { useState, Fragment, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { EuiBasicTableColumn } from '@elastic/eui';
import {
  EuiInMemoryTable,
  EuiButton,
  useEuiTheme,
  EuiLink,
  EuiTextColor,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSwitch,
  EuiIconTip,
  EuiFieldSearch,
  EuiSpacer,
  RIGHT_ALIGNMENT,
} from '@elastic/eui';
import type { ScopedHistory } from '@kbn/core/public';
import { useEuiTablePersist } from '@kbn/shared-ux-table-persist';
import { columnPresetActions } from '@kbn/shared-ux-column-presets';

import type { EuiContextMenuPanelItemDescriptor } from '@elastic/eui/src/components/context_menu/context_menu';
import { MAX_DATA_RETENTION } from '../../../../../../common/constants';
import { useAppContext } from '../../../../app_context';
import type { DataStream } from '../../../../../../common/types';
import { isNextGenIlm } from '../../../../lib/data_streams';
import type { UseRequestResponse } from '../../../../../shared_imports';
import { reactRouterNavigate } from '../../../../../shared_imports';
import { getDataStreamDetailsLink, getIndexListUri } from '../../../../services/routing';
import { DataHealth } from '../../../../components';
import { DeleteDataStreamConfirmationModal } from '../delete_data_stream_confirmation_modal';
import { humanizeTimeStamp } from '../humanize_time_stamp';
import { DataStreamsBadges } from '../data_stream_badges';
import { ConditionalWrap } from '../data_stream_detail_panel';
import { indexModeLabels } from '../../../../lib/index_mode_labels';
import type { Filters } from '../../components';
import { FilterListButton } from '../../components';
import { type DataStreamFilterName } from '../data_stream_list';
import { DataStreamActionsMenu } from '../data_stream_actions_menu';
import { EditDataRetentionModal } from '../edit_data_retention_modal';
import { DataRetentionValue } from '../data_retention_value';
import { formatByteSizeString } from '../../../../lib/format_bytes';

interface TableDataStream extends DataStream {
  isNextGenIlm: boolean;
}

interface Props {
  dataStreams?: DataStream[];
  isLoading?: boolean;
  reload: UseRequestResponse['resendRequest'];
  history: ScopedHistory;
  includeStats: boolean;
  filters: string;
  viewFilters: Filters<DataStreamFilterName>;
  onViewFilterChange: (newFilter: Filters<DataStreamFilterName>) => void;
  setIncludeStats: (includeStats: boolean) => void;
}

const INFINITE_AS_ICON = true;
const PAGE_SIZE_OPTIONS = [10, 20, 50];

const useStyles = () => {
  const { euiTheme } = useEuiTheme();

  return {
    bulkDeleteButton: css`
      color: ${euiTheme.colors.danger};
    `,
  };
};

export const DataStreamTable: React.FunctionComponent<Props> = ({
  dataStreams,
  isLoading,
  reload,
  history,
  filters,
  includeStats,
  setIncludeStats,
  onViewFilterChange,
  viewFilters,
}) => {
  const styles = useStyles();
  const [selection, setSelection] = useState<DataStream[]>([]);
  const [dataStreamsToDelete, setDataStreamsToDelete] = useState<string[]>([]);
  const [dataStreamsToEditDataRetention, setDataStreamsToEditDataRetention] = useState<
    DataStream[]
  >([]);
  const [searchValue, setSearchValue] = useState(filters ?? '');
  const { config } = useAppContext();

  const data = useMemo(() => {
    return (dataStreams || []).map((dataStream) => ({
      ...dataStream,
      isNextGenIlm: isNextGenIlm(dataStream),
    }));
  }, [dataStreams]);

  const filteredData = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return data;
    return data.filter((ds) => ds.name.toLowerCase().includes(q));
  }, [data, searchValue]);

  const columns: Array<EuiBasicTableColumn<TableDataStream>> = [];

  columns.push({
    field: 'name',
    name: i18n.translate('xpack.idxMgmt.dataStreamList.table.nameColumnTitle', {
      defaultMessage: 'Name',
    }),
    truncateText: true,
    sortable: true,
    render: (name: DataStream['name'], dataStream: DataStream) => {
      return (
        <Fragment>
          <EuiLink
            role="button"
            data-test-subj="nameLink"
            {...reactRouterNavigate(history, getDataStreamDetailsLink(name))}
          >
            {name}
          </EuiLink>
          <DataStreamsBadges dataStream={dataStream} />
        </Fragment>
      );
    },
  });

  columns.push({
    field: 'health',
    name: i18n.translate('xpack.idxMgmt.dataStreamList.table.healthColumnTitle', {
      defaultMessage: 'Health',
    }),
    truncateText: true,
    sortable: true,
    render: (health: DataStream['health']) => {
      return <DataHealth health={health} />;
    },
  });

  if (includeStats) {
    if (config.enableSizeAndDocCount) {
      // datastreams stats from metering API on serverless
      columns.push({
        field: 'meteringStorageSizeBytes',
        name: i18n.translate('xpack.idxMgmt.dataStreamList.table.storageSizeColumnTitle', {
          defaultMessage: 'Storage size',
        }),
        sortable: true,
        minWidth: '9em',
        width: '12em',
        className: 'eui-textNoWrap',
        align: RIGHT_ALIGNMENT,
        render: (_: DataStream['meteringStorageSizeBytes'], dataStream: DataStream) =>
          formatByteSizeString(dataStream.meteringStorageSize),
      });
      columns.push({
        field: 'meteringDocsCount',
        name: i18n.translate('xpack.idxMgmt.dataStreamList.table.docsCountColumnTitle', {
          defaultMessage: 'Documents count',
        }),
        sortable: true,
        minWidth: '8em',
        width: '12em',
        className: 'eui-textNoWrap',
        align: RIGHT_ALIGNMENT,
      });
    }
    if (config.enableDataStreamStats) {
      columns.push({
        field: 'maxTimeStamp',
        name: i18n.translate('xpack.idxMgmt.dataStreamList.table.maxTimeStampColumnTitle', {
          defaultMessage: 'Last updated',
        }),
        truncateText: true,
        sortable: true,
        render: (maxTimeStamp: DataStream['maxTimeStamp']) =>
          maxTimeStamp
            ? humanizeTimeStamp(maxTimeStamp)
            : i18n.translate('xpack.idxMgmt.dataStreamList.table.maxTimeStampColumnNoneMessage', {
                defaultMessage: 'Never',
              }),
      });
      columns.push({
        field: 'storageSizeBytes',
        name: i18n.translate('xpack.idxMgmt.dataStreamList.table.storageSizeColumnTitle', {
          defaultMessage: 'Storage size',
        }),
        sortable: true,
        minWidth: '9em',
        width: '12em',
        className: 'eui-textNoWrap',
        align: RIGHT_ALIGNMENT,
        render: (_: DataStream['storageSizeBytes'], dataStream: DataStream) =>
          formatByteSizeString(dataStream.storageSize),
      });
    }
  }

  columns.push({
    field: 'indices',
    name: i18n.translate('xpack.idxMgmt.dataStreamList.table.indicesColumnTitle', {
      defaultMessage: 'Indices',
    }),
    sortable: true,
    align: RIGHT_ALIGNMENT,
    minWidth: '6em',
    width: '7em',
    render: (indices: DataStream['indices'], dataStream) => (
      <EuiLink
        data-test-subj="indicesLink"
        {...reactRouterNavigate(history, getIndexListUri(`data_stream="${dataStream.name}"`, true))}
      >
        {indices.length}
      </EuiLink>
    ),
  });

  columns.push({
    field: 'indexMode',
    name: i18n.translate('xpack.idxMgmt.dataStreamList.table.indexModeColumnTitle', {
      defaultMessage: 'Index mode',
    }),
    sortable: true,
    render: (indexMode: DataStream['indexMode']) => indexModeLabels[indexMode],
    width: '7.5em',
    minWidth: '7.5em',
  });

  columns.push({
    field: 'lifecycle',
    name: i18n.translate('xpack.idxMgmt.dataStreamList.table.dataRetentionColumnTitle', {
      defaultMessage: 'Data retention',
    }),
    nameTooltip: {
      content: i18n.translate('xpack.idxMgmt.dataStreamList.table.dataRetentionColumnTooltip', {
        defaultMessage: `Data is kept at least this long before being automatically deleted. The data retention value only applies to the data managed directly by the data stream. {canDisableDataRetention, plural, one {If some data is subject to an index lifecycle management policy, then the data retention value set for the data stream doesn't apply to that data.} other {}}`,
        values: {
          // ILM is not applicable on serverless, so when the user isn't able to
          // disable data retention (which is only for serverless) we want to
          // tweak the copy of the tooltip to hide any references to it.
          canDisableDataRetention: config.enableTogglingDataRetention ? 1 : 0,
        },
      }),
      icon: 'question',
      iconProps: {
        color: 'subdued',
      },
    },
    width: '12em',
    minWidth: '10em',
    truncateText: true,
    sortable: true,
    render: (lifecycle: DataStream['lifecycle'], dataStream) => (
      <ConditionalWrap
        condition={dataStream.isNextGenIlm}
        wrap={(children) => <EuiTextColor color="subdued">{children}</EuiTextColor>}
      >
        <>
          <DataRetentionValue dataStream={dataStream} infiniteAsIcon={INFINITE_AS_ICON} />

          {!dataStream.isNextGenIlm &&
            dataStream.lifecycle?.retention_determined_by === MAX_DATA_RETENTION && (
              <>
                {' '}
                <EuiIconTip
                  content={i18n.translate(
                    'xpack.idxMgmt.dataStreamList.table.usingEffectiveRetentionTooltip',
                    {
                      defaultMessage:
                        'This data stream is using the maximum allowed data retention: [{effectiveRetention}].',
                      values: {
                        effectiveRetention: dataStream.lifecycle?.effective_retention,
                      },
                    }
                  )}
                  position="top"
                  type="info"
                  size="s"
                  color="subdued"
                  iconProps={{ 'data-test-subj': 'usingMaxRetention' }}
                />
              </>
            )}
        </>
      </ConditionalWrap>
    ),
  });

  columns.push({
    ...columnPresetActions({}),
    name: i18n.translate('xpack.idxMgmt.dataStreamList.table.actionColumnTitle', {
      defaultMessage: 'Actions',
    }),
    actions: [
      {
        name: i18n.translate('xpack.idxMgmt.dataStreamList.table.actionDeleteText', {
          defaultMessage: 'Delete',
        }),
        description: i18n.translate('xpack.idxMgmt.dataStreamList.table.actionDeleteDescription', {
          defaultMessage: 'Delete this data stream',
        }),
        icon: 'trash',
        color: 'danger',
        type: 'icon',
        onClick: ({ name }: DataStream) => {
          setDataStreamsToDelete([name]);
        },
        isPrimary: true,
        'data-test-subj': 'deleteDataStream',
        available: ({ privileges: { delete_index: deleteIndex } }: DataStream) => deleteIndex,
      },
    ],
  });

  const selectionConfig = {
    onSelectionChange: setSelection,
    selectableMessage: () =>
      i18n.translate('xpack.idxMgmt.dataStreamList.table.selection.selectRowAriaLabel', {
        defaultMessage: 'Select this row',
      }),
  };

  const dataStreamActions: EuiContextMenuPanelItemDescriptor[] = [];

  if (
    selection.every(
      (dataStream: DataStream) =>
        dataStream.privileges.manage_data_stream_lifecycle && !isNextGenIlm(dataStream)
    )
  ) {
    dataStreamActions.push({
      name: i18n.translate('xpack.idxMgmt.dataStreamList.table.bulkEditDataRetentionButtonLabel', {
        defaultMessage: 'Edit data retention',
      }),
      icon: 'pencil',
      onClick: () => setDataStreamsToEditDataRetention(selection),
      'data-test-subj': 'bulkEditDataRetentionButton',
    });
  }

  if (selection.every((dataStream: DataStream) => dataStream.privileges.delete_index)) {
    dataStreamActions.push({
      name: i18n.translate('xpack.idxMgmt.dataStreamList.table.deleteDataStreamsButtonLabel', {
        defaultMessage: 'Delete data streams',
      }),
      icon: 'trash',
      onClick: () => setDataStreamsToDelete(selection.map(({ name }: DataStream) => name)),
      css: styles.bulkDeleteButton,
      'data-test-subj': 'deleteDataStreamsButton',
    });
  }

  const { pageSize, sorting, onTableChange } = useEuiTablePersist<TableDataStream>({
    tableId: 'dataStreams',
    initialPageSize: 20,
    initialSort: {
      field: 'name',
      direction: 'asc',
    },
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  });

  const pagination = {
    pageSize,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  };

  return (
    <>
      {dataStreamsToEditDataRetention && dataStreamsToEditDataRetention.length > 0 ? (
        <EditDataRetentionModal
          onClose={(res) => {
            setDataStreamsToEditDataRetention([]);
            if (res && res.hasUpdatedDataRetention) {
              reload();
            }
          }}
          dataStreams={dataStreamsToEditDataRetention}
          isBulkEdit={true}
        />
      ) : null}
      {dataStreamsToDelete && dataStreamsToDelete.length > 0 ? (
        <DeleteDataStreamConfirmationModal
          onClose={(res) => {
            setDataStreamsToDelete([]);
            if (res && res.hasDeletedDataStreams) {
              reload();
            }
          }}
          dataStreams={dataStreamsToDelete}
        />
      ) : null}
      <EuiFlexGroup gutterSize="s" alignItems="center">
        {selection.length > 0 && dataStreamActions.length > 0 && (
          <EuiFlexItem grow={false}>
            <DataStreamActionsMenu
              dataStreamActions={dataStreamActions}
              selectedDataStreamsCount={selection.length}
            />
          </EuiFlexItem>
        )}
        <EuiFlexItem>
          <EuiFieldSearch
            incremental
            fullWidth
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={i18n.translate('xpack.idxMgmt.dataStreamList.table.searchPlaceholder', {
              defaultMessage: 'Search data streams',
            })}
            data-test-subj="dataStreamSearch"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiSwitch
                label={i18n.translate(
                  'xpack.idxMgmt.dataStreamListControls.includeStatsSwitchLabel',
                  { defaultMessage: 'Include stats' }
                )}
                checked={includeStats}
                onChange={(e) => setIncludeStats(e.target.checked)}
                data-test-subj="includeStatsSwitch"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiIconTip
                content={i18n.translate(
                  'xpack.idxMgmt.dataStreamListControls.includeStatsSwitchToolTip',
                  { defaultMessage: 'Including stats can increase reload times' }
                )}
                position="top"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <FilterListButton<DataStreamFilterName>
                filters={viewFilters}
                onChange={onViewFilterChange}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                color="success"
                iconType="refresh"
                onClick={reload}
                data-test-subj="reloadButton"
              >
                <FormattedMessage
                  id="xpack.idxMgmt.dataStreamList.reloadDataStreamsButtonLabel"
                  defaultMessage="Reload"
                />
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiInMemoryTable
        items={filteredData}
        itemId="name"
        columns={columns}
        sorting={sorting}
        selection={selectionConfig}
        pagination={pagination}
        loading={isLoading}
        data-test-subj="dataStreamTable"
        tableCaption={i18n.translate('xpack.idxMgmt.dataStreamList.table.caption', {
          defaultMessage: 'Data streams',
        })}
        noItemsMessage={
          <FormattedMessage
            id="xpack.idxMgmt.dataStreamList.table.noDataStreamsMessage"
            defaultMessage="No data streams found"
          />
        }
        tableLayout="auto"
        scrollableInline
        responsiveBreakpoint={false}
        onTableChange={onTableChange}
      />
    </>
  );
};
