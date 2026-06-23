/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactNode } from 'react';
import React, { useState } from 'react';
import type { estypes } from '@elastic/elasticsearch';
import { i18n } from '@kbn/i18n';
import {
  EuiBasicTable,
  EuiButtonIcon,
  EuiText,
  EuiToolTip,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import { ShardFailureDetails } from './shard_failure_details';

function getRowId(failure: estypes.ShardFailure) {
  return `${failure.shard}${failure.index}`;
}

interface ShardRow {
  rowId: string;
  shard: number;
  index?: string;
  failureType: string;
}

interface Props {
  failures: estypes.ShardFailure[];
}

export function ShardFailureTable({ failures }: Props) {
  const [expandedRows, setExpandedRows] = useState<Record<string, ReactNode>>({});

  const toggleDetails = (rowId: string) => {
    const nextExpandedRows = { ...expandedRows };
    if (rowId in nextExpandedRows) {
      delete nextExpandedRows[rowId];
    } else {
      const shardFailure = failures.find((failure) => rowId === getRowId(failure));
      nextExpandedRows[rowId] = shardFailure ? (
        <ShardFailureDetails failure={shardFailure} />
      ) : null;
    }
    setExpandedRows(nextExpandedRows);
  };

  const columns: Array<EuiBasicTableColumn<ShardRow>> = [
    {
      field: 'shard',
      name: i18n.translate('inspector.requests.clusters.shards.table.shardLabel', {
        defaultMessage: 'Shard',
      }),
      render: (shard: number, item: ShardRow) => {
        const label =
          item.rowId in expandedRows
            ? i18n.translate('inspector.requests.clusters.shards.table.collapseRow', {
                defaultMessage: 'Collapse table row to hide shard details',
              })
            : i18n.translate('inspector.requests.clusters.shards.table.expandRow', {
                defaultMessage: 'Expand table row to view shard details',
              });
        return (
          <>
            <EuiToolTip content={label} disableScreenReaderOutput>
              <EuiButtonIcon
                onClick={() => toggleDetails(item.rowId)}
                aria-label={label}
                iconType={item.rowId in expandedRows ? 'chevronSingleDown' : 'chevronSingleRight'}
              />
            </EuiToolTip>
            <EuiText size="xs" color="subdued">
              {shard}
            </EuiText>
          </>
        );
      },
      width: '20%',
    },
    {
      field: 'index',
      name: i18n.translate('inspector.requests.clusters.shards.table.indexLabel', {
        defaultMessage: 'Index',
      }),
      render: (index?: string) =>
        index ? (
          <EuiText size="xs" color="subdued">
            {index}
          </EuiText>
        ) : null,
    },
    {
      field: 'failureType',
      name: i18n.translate('inspector.requests.clusters.shards.table.failureTypeLabel', {
        defaultMessage: 'Failure type',
      }),
      render: (failureType: string) => (
        <EuiText size="xs" color="subdued">
          {failureType}
        </EuiText>
      ),
    },
  ];

  return (
    <EuiBasicTable
      tableCaption={i18n.translate('inspector.requests.clusters.shards.table.caption', {
        defaultMessage: 'Shard failures',
      })}
      items={failures.map((failure) => {
        return {
          rowId: getRowId(failure),
          shard: failure.shard!,
          index: failure.index,
          failureType: failure.reason.type,
        };
      })}
      itemIdToExpandedRowMap={expandedRows}
      itemId="rowId"
      columns={columns}
    />
  );
}
