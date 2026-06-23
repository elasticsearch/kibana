/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { LogEntry, LogEntryContext } from '@kbn/logs-shared-plugin/common';
import { useLinkProps, useUiTracker } from '@kbn/observability-shared-plugin/public';
import { encode } from '@kbn/rison';
import moment from 'moment';
import React, { useCallback, useState } from 'react';
import {
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiPopover,
  EuiTable,
  EuiTableBody,
  EuiTableRow,
  EuiTableRowCell,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import {
  getFriendlyNameForPartitionId,
  partitionField,
} from '../../../../../../common/log_analysis';
import type { TimeRange } from '../../../../../../common/time';
import { useViewLogInProviderContext } from '../../../../../containers/logs/view_log_in_context';

const MENU_LABEL = i18n.translate('xpack.infra.logs.categoryExample.menuLabel', {
  defaultMessage: 'View actions for log entry',
});

interface CategoryExampleMessageRowProps {
  id: string;
  dataset: string;
  message: string;
  timeRange: TimeRange;
  timestamp: number;
  tiebreaker: number;
  context: LogEntryContext;
  euiTheme: ReturnType<typeof useEuiTheme>['euiTheme'];
}

const CategoryExampleMessageRow: React.FC<CategoryExampleMessageRowProps> = ({
  id,
  dataset,
  message,
  timestamp,
  timeRange,
  tiebreaker,
  context,
  euiTheme,
}) => {
  const trackMetric = useUiTracker({ app: 'infra_logs' });
  const [, { setContextEntry }] = useViewLogInProviderContext();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const humanFriendlyDataset = getFriendlyNameForPartitionId(dataset);
  const time = moment(timestamp).toISOString();

  const viewInStreamLinkProps = useLinkProps({
    app: 'logs',
    pathname: 'stream',
    search: {
      logPosition: encode({
        end: moment(timeRange.endTime).format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        position: { tiebreaker, time },
        start: moment(timeRange.startTime).format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        streamLive: false,
      }),
      flyoutOptions: encode({
        surroundingLogsId: id,
      }),
      logFilter: encode({
        expression: `${partitionField}: ${dataset}`,
        kind: 'kuery',
      }),
    },
  });

  const toggleMenu = useCallback(() => setIsMenuOpen(!isMenuOpen), [isMenuOpen]);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  const handleViewInContext = useCallback(() => {
    const logEntry: LogEntry = {
      id,
      index: '', // TODO: use real index when loading via async search
      context,
      cursor: {
        time: moment(timestamp).toISOString(),
        tiebreaker,
      },
      columns: [],
    };
    trackMetric({ metric: 'view_in_context__categories' });
    setContextEntry(logEntry);
    closeMenu();
  }, [closeMenu, context, id, setContextEntry, tiebreaker, timestamp, trackMetric]);

  return (
    <EuiTableRow>
      <EuiTableRowCell
        width="332px"
        css={{
          color: euiTheme.colors.textSubdued,
        }}
      >
        {moment(timestamp).format('MMM D, YYYY @ HH:mm:ss.SSS')}
      </EuiTableRowCell>
      <EuiTableRowCell
        width="auto"
        css={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {message}
      </EuiTableRowCell>
      <EuiTableRowCell width="400px">{humanFriendlyDataset}</EuiTableRowCell>
      <EuiTableRowCell width="32px">
        <EuiPopover
          aria-label={MENU_LABEL}
          button={
            <EuiToolTip content={MENU_LABEL} disableScreenReaderOutput>
              <EuiButtonIcon
                data-test-subj="infraCategoryExampleMessageRowButton"
                aria-label={MENU_LABEL}
                iconType="boxesVertical"
                size="s"
                onClick={toggleMenu}
              />
            </EuiToolTip>
          }
          isOpen={isMenuOpen}
          closePopover={closeMenu}
          panelPaddingSize="none"
          anchorPosition="leftCenter"
        >
          <EuiContextMenuPanel
            items={[
              <EuiContextMenuItem
                key="viewInDiscover"
                onClick={viewInStreamLinkProps.onClick}
                href={viewInStreamLinkProps.href}
              >
                {i18n.translate('xpack.infra.logs.categoryExample.viewInDiscoverText', {
                  defaultMessage: 'View in Discover',
                })}
              </EuiContextMenuItem>,
              <EuiContextMenuItem key="viewInContext" onClick={handleViewInContext}>
                {i18n.translate('xpack.infra.logs.categoryExample.viewInContextText', {
                  defaultMessage: 'View in context',
                })}
              </EuiContextMenuItem>,
            ]}
          />
        </EuiPopover>
      </EuiTableRowCell>
    </EuiTableRow>
  );
};

export const CategoryExampleMessageTable: React.FC<{
  examples: Array<{
    id: string;
    dataset: string;
    message: string;
    timestamp: number;
    tiebreaker: number;
    context: LogEntryContext;
  }>;
  timeRange: TimeRange;
}> = ({ examples, timeRange }) => {
  const { euiTheme } = useEuiTheme();

  return (
    <EuiTable
      css={{
        tableLayout: 'fixed',
        backgroundColor: euiTheme.colors.borderBaseFloating,
        '& .euiTableRowCell': {
          borderColor: euiTheme.colors.borderBaseFloating,
          padding: '0px 8px',
          fontFamily: euiTheme.font.familyCode,
        },
        '& .euiTableCellContent': {
          padding: 0,
          height: '24px',
        },
      }}
    >
      <EuiTableBody>
        {examples.map((example, index) => (
          <CategoryExampleMessageRow
            key={index}
            {...example}
            timeRange={timeRange}
            euiTheme={euiTheme}
          />
        ))}
      </EuiTableBody>
    </EuiTable>
  );
};
