/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { debounce } from 'lodash';
import {
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiInMemoryTable,
  EuiLink,
  EuiTitle,
  useIsWithinMaxBreakpoint,
} from '@elastic/eui';
import { getEbtProps } from '@kbn/ebt-click';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { LatencyAggregationType } from '@kbn/apm-types';
import type {
  TransactionGroup,
  TransactionGroupInteraction,
  TransactionsTableHeaderAction,
} from './types';
import { getBuiltInColumns, DEFAULT_COLUMNS } from './get_columns';
import type { ColumnId } from './get_columns';

export type { TransactionGroup, TransactionGroupInteraction, TransactionsTableHeaderAction };
export type { ColumnId };

interface TransactionsTableProps {
  items: TransactionGroup[];
  isLoading: boolean;
  maxCountExceeded: boolean;
  title?: string;
  headerActions?: TransactionsTableHeaderAction[];
  latencyAggregationType?: LatencyAggregationType;
  columns?: Array<ColumnId | EuiBasicTableColumn<TransactionGroup>>;
  showMaxTransactionGroupsExceededWarning?: boolean;
  columnInteractions?: {
    name?: TransactionGroupInteraction;
    alerts?: TransactionGroupInteraction;
  };
  onSearchQueryChange?: (query: string) => void;
  remainingTransactionsCellTooltipContent?: React.ReactNode;
  showSparklines?: boolean;
  errorMessage?: string;
}

function shouldFetchServer({
  maxCountExceeded,
  newSearchQuery,
  oldSearchQuery,
}: {
  maxCountExceeded: boolean;
  newSearchQuery: string;
  oldSearchQuery: string;
}) {
  return maxCountExceeded || !newSearchQuery.includes(oldSearchQuery);
}

export function TransactionsTable({
  items,
  isLoading,
  maxCountExceeded,
  title = i18n.translate('apmUiShared.transactionsTable.title', {
    defaultMessage: 'Transactions',
  }),
  headerActions,
  latencyAggregationType,
  columns,
  showMaxTransactionGroupsExceededWarning = false,
  columnInteractions,
  onSearchQueryChange,
  remainingTransactionsCellTooltipContent,
  showSparklines: showSparklinesProp,
  errorMessage,
}: TransactionsTableProps) {
  const searchQueryRef = useRef('');

  const onSearchQueryChangeRef = useRef(onSearchQueryChange);
  onSearchQueryChangeRef.current = onSearchQueryChange;

  const debouncedSearchQueryChange = useRef(
    debounce((query: string) => onSearchQueryChangeRef.current?.(query), 300)
  );

  useEffect(() => () => debouncedSearchQueryChange.current.cancel(), []);

  const isWithinLBreakpoint = useIsWithinMaxBreakpoint('l');
  const resolvedShowSparklines = showSparklinesProp ?? !isWithinLBreakpoint;

  const resolvedColumns = useMemo(() => {
    const builtIn = getBuiltInColumns({
      latencyAggregationType,
      nameInteraction: columnInteractions?.name,
      alertsInteraction: columnInteractions?.alerts,
      showSparklines: resolvedShowSparklines,
      remainingTransactionsCellTooltipContent,
    });
    return (columns ?? DEFAULT_COLUMNS).map((col) =>
      typeof col === 'string' ? builtIn[col] : col
    );
  }, [
    latencyAggregationType,
    columnInteractions,
    resolvedShowSparklines,
    columns,
    remainingTransactionsCellTooltipContent,
  ]);

  const onSearchChange = useCallback(
    ({ queryText }: { queryText: string }) => {
      const oldSearchQuery = searchQueryRef.current;
      searchQueryRef.current = queryText;

      if (shouldFetchServer({ maxCountExceeded, newSearchQuery: queryText, oldSearchQuery })) {
        debouncedSearchQueryChange.current(queryText);
      }
      return true;
    },
    [maxCountExceeded]
  );

  return (
    <EuiFlexGroup direction="column" gutterSize="s">
      <EuiFlexItem>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiTitle size="xs">
              <h2>{title}</h2>
            </EuiTitle>
          </EuiFlexItem>
          {headerActions && headerActions.length > 0 && (
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                {headerActions.map((action) => (
                  <EuiFlexItem grow={false} key={action.label}>
                    <EuiLink
                      {...(action.href ? { href: action.href } : { onClick: action.onClick })}
                      {...getEbtProps(action.ebt)}
                    >
                      {action.icon && (
                        <EuiIcon
                          type={action.icon}
                          size="s"
                          style={{ marginRight: 4 }}
                          aria-hidden={true}
                        />
                      )}
                      {action.label}
                    </EuiLink>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFlexItem>

      {showMaxTransactionGroupsExceededWarning && maxCountExceeded && (
        <EuiFlexItem>
          <EuiCallOut
            announceOnMount
            title={i18n.translate('apmUiShared.transactionsTable.cardinalityWarning.title', {
              defaultMessage:
                'Number of transaction groups exceed the allowed maximum (1,000) that are displayed.',
            })}
            color="warning"
            iconType="warning"
          >
            <p>
              <FormattedMessage
                id="apmUiShared.transactionsTable.transactionGroupLimit.exceeded"
                defaultMessage="The maximum number of transaction groups displayed in Kibana has been reached. Try narrowing down results by using the query bar."
              />
            </p>
          </EuiCallOut>
        </EuiFlexItem>
      )}

      <EuiFlexItem>
        {errorMessage ? (
          <EuiCallOut announceOnMount size="s" color="danger" title={errorMessage} />
        ) : (
          <EuiInMemoryTable
            tableCaption={title}
            items={items}
            columns={resolvedColumns}
            loading={isLoading}
            noItemsMessage={
              isLoading
                ? i18n.translate('apmUiShared.transactionsTable.loading', {
                    defaultMessage: 'Loading...',
                  })
                : i18n.translate('apmUiShared.transactionsTable.noResults', {
                    defaultMessage: 'No transactions found',
                  })
            }
            pagination={{
              initialPageSize: 10,
              showPerPageOptions: true,
              pageSizeOptions: [10, 25, 50],
            }}
            sorting={{ sort: { field: 'latency' as keyof TransactionGroup, direction: 'desc' } }}
            search={{
              box: { incremental: true },
              onChange: onSearchChange,
            }}
          />
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
