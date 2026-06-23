/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FunctionComponent, ReactElement } from 'react';
import React, { useState } from 'react';
import type { EuiBasicTableColumn } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiIcon,
  EuiInMemoryTable,
  EuiScreenReaderOnly,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { FormattedStatus } from '../lib';
import { getLevelSortValue } from '../lib';
import { StatusExpandedRow } from './status_expanded_row';

interface StatusTableProps {
  statuses?: FormattedStatus[];
}

const expandLabel = i18n.translate('core.statusPage.statusTable.columns.expandRow.expandLabel', {
  defaultMessage: 'Expand',
});

const collapseLabel = i18n.translate(
  'core.statusPage.statusTable.columns.expandRow.collapseLabel',
  { defaultMessage: 'Collapse' }
);

export const StatusTable: FunctionComponent<StatusTableProps> = ({ statuses }) => {
  const [itemIdToExpandedRowMap, setItemIdToExpandedRowMap] = useState<
    Record<string, ReactElement>
  >({});
  if (!statuses) {
    return null;
  }

  const toggleDetails = (item: FormattedStatus) => {
    const newRowMap = { ...itemIdToExpandedRowMap };
    if (itemIdToExpandedRowMap[item.id]) {
      delete newRowMap[item.id];
    } else {
      newRowMap[item.id] = <StatusExpandedRow status={item} />;
    }
    setItemIdToExpandedRowMap(newRowMap);
  };

  const tableColumns: Array<EuiBasicTableColumn<FormattedStatus>> = [
    {
      field: 'state',
      name: i18n.translate('core.statusPage.statusTable.columns.statusHeader', {
        defaultMessage: 'Status',
      }),
      render: (state: FormattedStatus['state']) => (
        <EuiIcon type="dot" aria-hidden color={state.uiColor} title={state.title} />
      ),
      width: '100px',
      align: 'center' as const,
      sortable: (row: FormattedStatus) => getLevelSortValue(row),
    },
    {
      field: 'id',
      name: i18n.translate('core.statusPage.statusTable.columns.idHeader', {
        defaultMessage: 'ID',
      }),
      sortable: true,
    },
    {
      field: 'state',
      name: i18n.translate('core.statusPage.statusTable.columns.statusSummaryHeader', {
        defaultMessage: 'Status summary',
      }),
      render: (state: FormattedStatus['state']) => <span>{state.message}</span>,
    },
    {
      name: (
        <EuiScreenReaderOnly>
          <FormattedMessage
            id="core.statusPage.statusTable.columns.expandRowHeader"
            defaultMessage="Expand row"
          />
        </EuiScreenReaderOnly>
      ),
      align: 'right',
      width: '40px',
      isExpander: true,
      render: (item: FormattedStatus) => (
        <EuiToolTip
          content={itemIdToExpandedRowMap[item.id] ? collapseLabel : expandLabel}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            onClick={() => toggleDetails(item)}
            aria-label={itemIdToExpandedRowMap[item.id] ? collapseLabel : expandLabel}
            iconType={itemIdToExpandedRowMap[item.id] ? 'chevronSingleUp' : 'chevronSingleDown'}
          />
        </EuiToolTip>
      ),
    },
  ];

  return (
    <EuiInMemoryTable<FormattedStatus>
      columns={tableColumns}
      itemId={(item) => item.id}
      items={statuses}
      itemIdToExpandedRowMap={itemIdToExpandedRowMap}
      rowProps={({ state }) => ({
        className: `status-table-row-${state.uiColor}`,
      })}
      sorting={{
        sort: {
          direction: 'asc',
          field: 'state',
        },
      }}
      data-test-subj="statusBreakdown"
      tableCaption={i18n.translate('core.statusPage.statusTable.tableCaption', {
        defaultMessage: 'Status breakdown',
      })}
    />
  );
};
