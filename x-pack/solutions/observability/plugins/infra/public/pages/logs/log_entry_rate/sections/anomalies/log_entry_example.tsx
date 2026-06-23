/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useCallback, useState } from 'react';
import moment from 'moment';
import { encode } from '@kbn/rison';
import { i18n } from '@kbn/i18n';
import { useMlHref, ML_PAGES } from '@kbn/ml-plugin/public';
import { useLinkProps, shouldHandleLinkEvent } from '@kbn/observability-shared-plugin/public';
import type { EuiThemeComputed } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiPopover,
  EuiScreenReaderOnly,
  EuiTable,
  EuiTableBody,
  EuiTableHeader,
  EuiTableHeaderCell,
  EuiTableRow,
  EuiTableRowCell,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { useKibanaContextForPlugin } from '../../../../../hooks/use_kibana';
import { getFriendlyNameForPartitionId } from '../../../../../../common/log_analysis';
import { partitionField } from '../../../../../../common/log_analysis/job_parameters';
import type { LogEntryExample } from '../../../../../../common/log_analysis';
import { isCategoryAnomaly } from '../../../../../../common/log_analysis';
import { localizedDate } from '../../../../../../common/formatters/datetime';
import type { LogEntryAnomaly } from '../../../../../../common/log_analysis';
import { useLogEntryFlyoutContext } from '../../../../../containers/logs/log_flyout';
import type { TimeRange } from '../../../../../../common/time/time_range';

const VIEW_DETAILS_LABEL = i18n.translate(
  'xpack.infra.logs.analysis.logEntryExamplesViewDetailsLabel',
  { defaultMessage: 'View details' }
);

const VIEW_IN_DISCOVER_LABEL = i18n.translate(
  'xpack.infra.logs.analysis.logEntryExamplesViewInDiscoverLabel',
  { defaultMessage: 'View in Discover' }
);

const VIEW_ANOMALY_IN_ML_LABEL = i18n.translate(
  'xpack.infra.logs.analysis.logEntryExamplesViewAnomalyInMlLabel',
  { defaultMessage: 'View anomaly in machine learning' }
);

const MENU_LABEL = i18n.translate('xpack.infra.logAnomalies.logEntryExamplesMenuLabel', {
  defaultMessage: 'View actions for log entry',
});

interface Props extends LogEntryExample {
  timeRange: TimeRange;
  anomaly: LogEntryAnomaly;
  euiTheme: EuiThemeComputed;
}

export const LogEntryExampleMessageRow: React.FC<Props> = ({
  id,
  dataset,
  message,
  timestamp,
  tiebreaker,
  timeRange,
  anomaly,
  euiTheme,
}) => {
  const {
    services: { ml, http, application },
  } = useKibanaContextForPlugin();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { openFlyout: openLogEntryFlyout } = useLogEntryFlyoutContext();

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
      ...(dataset
        ? {
            logFilter: encode({
              expression: `${partitionField}: ${dataset}`,
              kind: 'kuery',
            }),
          }
        : {}),
    },
  });

  const viewAnomalyInMachineLearningLink = useMlHref(ml, http.basePath.get(), {
    page: ML_PAGES.SINGLE_METRIC_VIEWER,
    pageState: {
      jobIds: [anomaly.jobId],
      timeRange: {
        from: moment(timeRange.startTime).format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        to: moment(timeRange.endTime).format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        mode: 'absolute',
      },
      entities: {
        [partitionField]: dataset,
        ...(isCategoryAnomaly(anomaly) ? { mlcategory: anomaly.categoryId } : {}),
      },
    },
  });

  const handleMlLinkClick = useCallback(
    (e: React.MouseEvent) => {
      if (!viewAnomalyInMachineLearningLink || !shouldHandleLinkEvent(e)) return;
      application.navigateToUrl(viewAnomalyInMachineLearningLink);
    },
    [viewAnomalyInMachineLearningLink, application]
  );

  const menuItems = useMemo(() => {
    if (!viewInStreamLinkProps.onClick || !viewAnomalyInMachineLearningLink) {
      return undefined;
    }

    return [
      {
        label: VIEW_DETAILS_LABEL,
        onClick: () => {
          openLogEntryFlyout(id);
          setIsMenuOpen(false);
        },
      },
      {
        label: VIEW_IN_DISCOVER_LABEL,
        onClick: viewInStreamLinkProps.onClick,
        href: viewInStreamLinkProps.href,
      },
      {
        label: VIEW_ANOMALY_IN_ML_LABEL,
        onClick: handleMlLinkClick,
        href: viewAnomalyInMachineLearningLink,
      },
    ];
  }, [
    id,
    openLogEntryFlyout,
    viewInStreamLinkProps,
    viewAnomalyInMachineLearningLink,
    handleMlLinkClick,
  ]);

  const toggleMenu = useCallback(() => setIsMenuOpen(!isMenuOpen), [isMenuOpen]);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  return (
    <EuiTableRow>
      <EuiTableRowCell width="150px" css={{ color: euiTheme.colors.textSubdued }}>
        {moment(timestamp).format('HH:mm:ss.SSS')}
      </EuiTableRowCell>
      <EuiTableRowCell truncateText>{message}</EuiTableRowCell>

      <EuiTableRowCell width="250px">{humanFriendlyDataset}</EuiTableRowCell>

      <EuiTableRowCell width="48px">
        <EuiPopover
          aria-label={MENU_LABEL}
          button={
            <EuiToolTip content={MENU_LABEL} disableScreenReaderOutput>
              <EuiButtonIcon
                data-test-subj="infraLogEntryExampleMessageRowButton"
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
            items={menuItems?.map((item, index) => (
              <EuiContextMenuItem
                key={`menu-item-${index}`}
                onClick={(e) => {
                  item.onClick?.(e);
                  closeMenu();
                }}
                href={item.href}
              >
                {item.label}
              </EuiContextMenuItem>
            ))}
          />
        </EuiPopover>
      </EuiTableRowCell>
    </EuiTableRow>
  );
};

export const LogEntryExampleMessageTable: React.FC<{
  examples: LogEntryExample[];
  timeRange: TimeRange;
  anomaly: LogEntryAnomaly;
}> = ({ examples, timeRange, anomaly }) => {
  const { euiTheme } = useEuiTheme();

  const dateTime = examples.length > 0 ? examples[0].timestamp : Date.now();

  const columns = [
    {
      id: 'timestamp',
      header: localizedDate(dateTime),
      width: '122px',
    },
    {
      id: 'message',
      header: i18n.translate(
        'xpack.infra.logEntryExampleMessageHeaders.logColumnHeader.messageLabel',
        {
          defaultMessage: 'Message',
        }
      ),
    },
    {
      id: 'dataset',
      header: 'event.dataset',
      width: '250px',
    },
    {
      id: 'actions',
      header: (
        <EuiScreenReaderOnly>
          <span>
            {i18n.translate('xpack.infra.logEntryExampleMessageHeaders.actionsHeader', {
              defaultMessage: 'Actions',
            })}
          </span>
        </EuiScreenReaderOnly>
      ),
      width: '48px',
    },
  ];

  return (
    <EuiTable
      css={{
        backgroundColor: euiTheme.colors.borderBaseFloating,
        '& .euiTableHeaderCell': {
          paddingBottom: 5,
        },
        '& .euiTableRowCell': {
          borderColor: euiTheme.colors.borderBaseFloating,
          fontFamily: euiTheme.font.familyCode,
        },
        '& .euiTableCellContent': {
          padding: 0,
          height: '24px',
        },
      }}
    >
      <EuiTableHeader>
        {columns.map((column) => (
          <EuiTableHeaderCell key={column.id} width={column.width}>
            {column.header}
          </EuiTableHeaderCell>
        ))}
      </EuiTableHeader>

      <EuiTableBody>
        {examples.map((example, exampleIndex) => (
          <LogEntryExampleMessageRow
            key={exampleIndex}
            {...example}
            timeRange={timeRange}
            anomaly={anomaly}
            euiTheme={euiTheme}
          />
        ))}
      </EuiTableBody>
    </EuiTable>
  );
};
