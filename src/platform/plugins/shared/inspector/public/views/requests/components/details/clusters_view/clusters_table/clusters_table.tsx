/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactNode } from 'react';
import React, { useMemo, useState } from 'react';
import type { estypes } from '@elastic/elasticsearch';
import { i18n } from '@kbn/i18n';
import type { Criteria } from '@elastic/eui';
import {
  Comparators,
  EuiBasicTable,
  EuiButtonIcon,
  EuiText,
  EuiToolTip,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import { ClusterView } from './cluster_view';
import { ClusterHealth } from '../clusters_health';
import { LOCAL_CLUSTER_KEY } from '../local_cluster';

function getInitialExpandedRow(clusters: Record<string, estypes.ClusterDetails>) {
  const clusterNames = Object.keys(clusters);
  return clusterNames.length === 1
    ? { [clusterNames[0]]: <ClusterView clusterDetails={clusters[clusterNames[0]]} /> }
    : {};
}

interface ClusterItem {
  name: string;
  status: string;
  responseTime?: number;
}

interface Props {
  clusters: Record<string, estypes.ClusterDetails>;
}

export function ClustersTable({ clusters }: Props) {
  const [expandedRows, setExpandedRows] = useState<Record<string, ReactNode>>(
    getInitialExpandedRow(clusters)
  );
  const [sortField, setSortField] = useState<undefined | keyof ClusterItem>();
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const toggleDetails = (name: string) => {
    const nextExpandedRows = { ...expandedRows };
    if (name in nextExpandedRows) {
      delete nextExpandedRows[name];
    } else {
      nextExpandedRows[name] = <ClusterView clusterDetails={clusters[name]} />;
    }
    setExpandedRows(nextExpandedRows);
  };

  const items = useMemo(() => {
    return Object.keys(clusters).map((key) => {
      return {
        name: key,
        status: clusters[key].status,
        responseTime: clusters[key].took,
      };
    });
  }, [clusters]);

  const columns: Array<EuiBasicTableColumn<ClusterItem>> = [
    {
      field: 'name',
      name: i18n.translate('inspector.requests.clusters.table.nameLabel', {
        defaultMessage: 'Name',
      }),
      render: (name: string) => {
        const label =
          name in expandedRows
            ? i18n.translate('inspector.requests.clusters.table.collapseRow', {
                defaultMessage: 'Collapse table row to hide cluster details',
              })
            : i18n.translate('inspector.requests.clusters.table.expandRow', {
                defaultMessage: 'Expand table row to view cluster details',
              });
        return (
          <>
            <EuiToolTip content={label} disableScreenReaderOutput>
              <EuiButtonIcon
                data-test-subj={`inspectorRequestToggleClusterDetails${name}`}
                onClick={() => toggleDetails(name)}
                aria-label={label}
                iconType={name in expandedRows ? 'chevronSingleDown' : 'chevronSingleRight'}
              />
            </EuiToolTip>
            <EuiText size="xs" color="subdued">
              {name === LOCAL_CLUSTER_KEY
                ? i18n.translate('inspector.requests.clusters.table.localClusterDisplayName', {
                    defaultMessage: 'Local cluster',
                  })
                : name}
            </EuiText>
          </>
        );
      },
      sortable: items.length > 1,
      width: '60%',
    },
    {
      field: 'status',
      name: i18n.translate('inspector.requests.clusters.table.statusLabel', {
        defaultMessage: 'Status',
      }),
      render: (status: string) => {
        return <ClusterHealth status={status} />;
      },
      sortable: items.length > 1,
    },
    {
      align: 'right' as 'right',
      field: 'responseTime',
      name: i18n.translate('inspector.requests.clusters.table.responseTimeLabel', {
        defaultMessage: 'Response time',
      }),
      render: (responseTime: number | undefined) => (
        <EuiText size="xs" color="subdued">
          {responseTime
            ? i18n.translate('inspector.requests.clusters.table.responseTimeInMilliseconds', {
                defaultMessage: '{responseTime}ms',
                values: { responseTime },
              })
            : null}
        </EuiText>
      ),
      sortable: items.length > 1,
    },
  ];

  return (
    <EuiBasicTable
      tableCaption={i18n.translate('inspector.requests.clusters.table.caption', {
        defaultMessage: 'Cluster details',
      })}
      items={
        sortField
          ? items.sort(Comparators.property(sortField, Comparators.default(sortDirection)))
          : items
      }
      itemIdToExpandedRowMap={expandedRows}
      itemId="name"
      columns={columns}
      sorting={{
        sort: sortField
          ? {
              field: sortField,
              direction: sortDirection,
            }
          : undefined,
      }}
      onChange={({ sort }: Criteria<ClusterItem>) => {
        if (sort) {
          setSortField(sort.field);
          setSortDirection(sort.direction);
        }
      }}
      noItemsMessage={i18n.translate('inspector.requests.clusters.table.noItemsFound', {
        defaultMessage: 'No clusters found',
      })}
      cellProps={(item, column) => ({
        'data-test-subj': `inspectorRequestClustersTableCell-${column.name}-${item.name}`,
      })}
    />
  );
}
