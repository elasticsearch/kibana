/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useCallback, useMemo, useState } from 'react';
import type { EuiBasicTableColumn, EuiTableSortingType, Criteria } from '@elastic/eui';
import {
  EuiBasicTable,
  EuiConfirmModal,
  EuiToolTip,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css } from '@emotion/css';
import type { DataStreamResponse } from '../../../../../../common';
import * as i18n from '../translations';
import { useDeleteDataStream, useReanalyzeDataStream } from '../../../../../common';
import { InputTypesBadges } from './input_types_badges';
import { Status } from './status';
import { useUIState } from '../../../contexts';
import { useIntegrationForm } from '../../../forms/integration_form';
import { useTelemetry } from '../../../../telemetry_context';

interface DataStreamsTableProps {
  integrationId: string;
  items: DataStreamResponse[];
  onReanalyzeSuccess?: () => void;
}

export const DataStreamsTable = ({
  integrationId,
  items,
  onReanalyzeSuccess,
}: DataStreamsTableProps) => {
  const { euiTheme } = useEuiTheme();
  const { deleteDataStreamMutation } = useDeleteDataStream();
  const { reanalyzeDataStreamMutation } = useReanalyzeDataStream();
  const { openEditPipelineFlyout } = useUIState();
  const { formData } = useIntegrationForm();
  const {
    reportEditDataStreamFlyoutOpened,
    reportDataStreamDeleteConfirmed,
    reportDataStreamRefreshConfirmed,
  } = useTelemetry();

  const handleOpenEditPipelineFlyout = useCallback(
    (item: DataStreamResponse) => {
      openEditPipelineFlyout(item);
      reportEditDataStreamFlyoutOpened({ integrationId, dataStreamId: item.dataStreamId });
    },
    [integrationId, reportEditDataStreamFlyoutOpened, openEditPipelineFlyout]
  );
  const [dataStreamDeleteTarget, setDataStreamDeleteTarget] = useState<DataStreamResponse | null>(
    null
  );
  const [dataStreamReanalyzeTarget, setDataStreamReanalyzeTarget] =
    useState<DataStreamResponse | null>(null);
  const deleteModalTitleId = useGeneratedHtmlId();
  const reanalyzeModalTitleId = useGeneratedHtmlId();
  const [sortField, setSortField] = useState<keyof DataStreamResponse | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const sorting: EuiTableSortingType<DataStreamResponse> = sortField
    ? { sort: { field: sortField, direction: sortDirection } }
    : { sort: undefined };

  const onTableChange = ({ sort }: Criteria<DataStreamResponse>) => {
    if (sort) {
      setSortField(sort.field);
      setSortDirection(sort.direction);
    }
  };

  const sortedItems = useMemo(() => {
    if (!sortField) {
      return items;
    }
    return [...items].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, sortField, sortDirection]);

  const reanalyzingDataStreamId = reanalyzeDataStreamMutation.isLoading
    ? reanalyzeDataStreamMutation.variables?.dataStreamId
    : undefined;

  const isDeleting = (item: DataStreamResponse) => item.status === 'deleting';

  const handleReAnalyzeConfirm = async () => {
    if (!formData?.connectorId || !dataStreamReanalyzeTarget) return;

    const target = dataStreamReanalyzeTarget;
    reportDataStreamRefreshConfirmed({
      integrationId,
      dataStreamId: target.dataStreamId,
    });
    setDataStreamReanalyzeTarget(null);
    try {
      await reanalyzeDataStreamMutation.mutateAsync({
        integrationId,
        dataStreamId: target.dataStreamId,
        connectorId: formData.connectorId,
      });
      onReanalyzeSuccess?.();
    } catch {
      // Error toast is shown by useReanalyzeDataStream
    }
  };

  const handleReanalyzeCancel = () => {
    setDataStreamReanalyzeTarget(null);
  };

  const handleDeleteConfirm = () => {
    if (dataStreamDeleteTarget) {
      reportDataStreamDeleteConfirmed({
        integrationId,
        dataStreamId: dataStreamDeleteTarget.dataStreamId,
      });
      setDataStreamDeleteTarget(null);
      deleteDataStreamMutation.mutate({
        integrationId,
        dataStreamId: dataStreamDeleteTarget.dataStreamId,
      });
    }
  };

  const handleDeleteCancel = () => {
    setDataStreamDeleteTarget(null);
  };

  const dataStreamColumns: Array<EuiBasicTableColumn<DataStreamResponse>> = useMemo(() => {
    const tooltipStyles = {
      backgroundColor: euiTheme.colors.backgroundBaseSubdued,
      color: euiTheme.colors.text,
      border: 'none',
    };

    return [
      {
        name: '',
        actions: [
          {
            name: i18n.TABLE_ACTIONS.expand,
            description: i18n.TABLE_ACTIONS.expandDescription,
            icon: 'maximize',
            type: 'icon',
            'data-test-subj': 'expandDataStreamButton',
            onClick: (item: DataStreamResponse) => {
              handleOpenEditPipelineFlyout(item);
            },
            enabled: (item: DataStreamResponse) => item.status === 'completed' && !isDeleting(item),
          },
        ],
        width: '48px',
      },
      {
        field: 'title',
        name: i18n.TABLE_COLUMN_HEADERS.title,
        sortable: true,
        render: (title: DataStreamResponse['title']) => (
          <EuiToolTip
            content={title}
            anchorClassName="eui-textTruncate"
            css={tooltipStyles}
            position="top"
          >
            <span tabIndex={0}>{title}</span>
          </EuiToolTip>
        ),
      },
      {
        field: 'inputTypes',
        name: i18n.TABLE_COLUMN_HEADERS.dataCollectionMethods,
        sortable: true,
        render: (inputTypes: DataStreamResponse['inputTypes']) => (
          <InputTypesBadges inputTypes={inputTypes} />
        ),
        css: css`
          max-width: 200px;
        `,
      },
      {
        field: 'status',
        name: i18n.TABLE_COLUMN_HEADERS.status,
        sortable: true,
        render: (status: DataStreamResponse['status'], item: DataStreamResponse) => (
          <Status status={status} phase={item.phase} isDeleting={isDeleting(item)} />
        ),
        width: '220px',
      },
      {
        name: i18n.TABLE_COLUMN_HEADERS.actions,
        actions: [
          {
            name: i18n.TABLE_ACTIONS.refresh,
            description: i18n.TABLE_ACTIONS.refreshDescription,
            icon: 'refresh',
            type: 'icon',
            'data-test-subj': 'refreshDataStreamButton',
            onClick: (item: DataStreamResponse) => {
              setDataStreamReanalyzeTarget(item);
            },
            enabled: (item: DataStreamResponse) =>
              !!formData?.connectorId &&
              (item.status === 'completed' || item.status === 'failed') &&
              !isDeleting(item) &&
              item.dataStreamId !== reanalyzingDataStreamId,
          },
          {
            name: i18n.TABLE_ACTIONS.delete,
            description: i18n.TABLE_ACTIONS.deleteDescription,
            icon: 'trash',
            type: 'icon',
            color: 'danger',
            'data-test-subj': 'deleteDataStreamButton',
            onClick: (item: DataStreamResponse) => {
              setDataStreamDeleteTarget(item);
            },
            enabled: (item: DataStreamResponse) => !isDeleting(item),
          },
        ],
        width: '80px',
      },
    ];
  }, [reanalyzingDataStreamId, formData?.connectorId, euiTheme, handleOpenEditPipelineFlyout]);

  return (
    <>
      <EuiBasicTable<DataStreamResponse>
        items={sortedItems}
        columns={dataStreamColumns}
        tableLayout="fixed"
        tableCaption={i18n.DATA_STREAMS_TITLE}
        sorting={sorting}
        onChange={onTableChange}
      />
      {dataStreamReanalyzeTarget && (
        <EuiConfirmModal
          aria-labelledby={reanalyzeModalTitleId}
          title={i18n.REANALYZE_MODAL.title(dataStreamReanalyzeTarget.title)}
          titleProps={{ id: reanalyzeModalTitleId }}
          onCancel={handleReanalyzeCancel}
          onConfirm={handleReAnalyzeConfirm}
          cancelButtonText={i18n.REANALYZE_MODAL.cancelButton}
          confirmButtonText={i18n.REANALYZE_MODAL.confirmButton}
          defaultFocusedButton="confirm"
        >
          <p>{i18n.REANALYZE_MODAL.body}</p>
        </EuiConfirmModal>
      )}
      {dataStreamDeleteTarget && (
        <EuiConfirmModal
          aria-labelledby={deleteModalTitleId}
          title={i18n.DELETE_MODAL.title(dataStreamDeleteTarget.title)}
          titleProps={{ id: deleteModalTitleId }}
          onCancel={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          cancelButtonText={i18n.DELETE_MODAL.cancelButton}
          confirmButtonText={i18n.DELETE_MODAL.confirmButton}
          defaultFocusedButton="confirm"
          buttonColor="danger"
        />
      )}
    </>
  );
};

DataStreamsTable.displayName = 'DataStreamsTable';
