/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiTitle,
  EuiToolTip,
  transparentize,
  useEuiTheme,
} from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedRelative } from '@kbn/i18n-react';
import { MemoryDiffViewer } from './memory_diff_viewer';
import type { MemoryEntry, MemoryVersionRecord } from './types';
import { useMemoryHistory, useMemoryVersion } from './use_memory';
import { changeTypeColors } from './utils';

export function HistoryPanel({ entryId, entry }: { entryId: string; entry: MemoryEntry }) {
  const { data: historyData, isLoading } = useMemoryHistory(entryId);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const { euiTheme } = useEuiTheme();
  const selectedRowBackground = transparentize(euiTheme.colors.primary, 0.1);

  const selectedRecord = useMemo(() => {
    if (selectedVersion === null || !historyData?.history) return undefined;
    return historyData.history.find((r) => r.version === selectedVersion);
  }, [selectedVersion, historyData]);

  const previousVersion = selectedVersion !== null ? selectedVersion - 1 : undefined;
  const { data: previousRecord } = useMemoryVersion(
    previousVersion !== undefined && previousVersion >= 1 ? entryId : undefined,
    previousVersion !== undefined && previousVersion >= 1 ? previousVersion : undefined
  );

  const columns: Array<EuiBasicTableColumn<MemoryVersionRecord>> = [
    {
      field: 'version',
      name: i18n.translate('xpack.streams.memory.history.versionColumn', {
        defaultMessage: 'v',
      }),
      width: '50px',
      render: (version: number) =>
        version === entry.version ? <strong>{version}</strong> : <>{version}</>,
    },
    {
      field: 'change_type',
      name: i18n.translate('xpack.streams.memory.history.changeTypeColumn', {
        defaultMessage: 'Change',
      }),
      width: '90px',
      render: (changeType: string) => (
        <EuiBadge color={changeTypeColors[changeType] ?? 'default'}>{changeType}</EuiBadge>
      ),
    },
    {
      field: 'change_summary',
      name: i18n.translate('xpack.streams.memory.history.summaryColumn', {
        defaultMessage: 'Summary',
      }),
    },
    {
      field: 'created_by',
      name: i18n.translate('xpack.streams.memory.history.authorColumn', {
        defaultMessage: 'Author',
      }),
      width: '120px',
    },
    {
      field: 'created_at',
      name: i18n.translate('xpack.streams.memory.history.dateColumn', {
        defaultMessage: 'Date',
      }),
      width: '130px',
      render: (date: string) => (
        <EuiToolTip content={new Date(date).toLocaleString()}>
          <FormattedRelative value={date} />
        </EuiToolTip>
      ),
    },
  ];

  return isLoading ? (
    <EuiLoadingSpinner size="l" />
  ) : (
    <>
      <EuiBasicTable
        items={historyData?.history ?? []}
        columns={columns}
        tableCaption={i18n.translate('xpack.streams.memory.history.tableCaption', {
          defaultMessage: 'Version history',
        })}
        rowProps={(record) => ({
          onClick: () =>
            setSelectedVersion(selectedVersion === record.version ? null : record.version),
          style: {
            cursor: 'pointer',
            ...(selectedVersion === record.version
              ? { backgroundColor: selectedRowBackground }
              : {}),
          },
        })}
        data-test-subj="streamsMemoryHistoryTable"
      />
      {selectedVersion !== null && selectedRecord && (
        <>
          <EuiSpacer size="m" />
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('xpack.streams.memory.history.diffTitle', {
                defaultMessage: 'Changes in version {version}',
                values: { version: selectedVersion },
              })}
            </h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          <MemoryDiffViewer
            original={{
              title: previousRecord?.title ?? '',
              content: previousRecord?.content ?? '',
              tags: previousRecord?.tags ?? [],
              categories: previousRecord?.categories ?? [],
            }}
            modified={{
              title: selectedRecord.title,
              content: selectedRecord.content,
              tags: selectedRecord.tags ?? [],
              categories: selectedRecord.categories ?? [],
            }}
          />
        </>
      )}
    </>
  );
}
