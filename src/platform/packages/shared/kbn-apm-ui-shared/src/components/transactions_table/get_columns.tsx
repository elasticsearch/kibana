/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';
import type { ReactNode } from 'react';
import {
  EuiBadge,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPopover,
  EuiProgress,
  EuiText,
  EuiToolTip,
  euiPaletteColorBlind,
} from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { RIGHT_ALIGNMENT } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { LatencyAggregationType } from '@kbn/apm-types';
import { EBT_CLICK_ACTIONS, getEbtProps } from '@kbn/ebt-click';
import { TRANSACTIONS_TABLE_EBT_ACTIONS, TRANSACTIONS_TABLE_EBT_ELEMENTS } from './ebt_constants';
import { asMillisecondDuration, asTransactionRate } from '../../utils/formatters/duration';
import { asPercent } from '../../utils/formatters/numeric';
import { Sparkline } from '../sparkline';
import type { TransactionGroup, TransactionGroupInteraction } from './types';

const palette = euiPaletteColorBlind({ rotations: 2 });

const SPARKLINE_COLORS = {
  latency: { current: palette[2], comparison: palette[12] },
  throughput: { current: palette[0], comparison: palette[10] },
  errorRate: { current: palette[6], comparison: palette[16] },
};

const IMPACT_BAR_WIDTH = 96;

const truncationStyle = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
  display: 'block',
  width: '100%',
};

const outerStyle = { overflow: 'hidden', width: '100%' };

export type ColumnId = 'alerts' | 'name' | 'latency' | 'throughput' | 'errorRate';

export const DEFAULT_COLUMNS: ColumnId[] = ['name', 'latency', 'throughput', 'errorRate'];

function getLatencyColumnLabel(latencyAggregationType?: LatencyAggregationType) {
  switch (latencyAggregationType) {
    case LatencyAggregationType.avg:
      return i18n.translate('apmUiShared.transactionsTable.latencyColumnAvgLabel', {
        defaultMessage: 'Latency (avg.)',
      });
    case LatencyAggregationType.p95:
      return i18n.translate('apmUiShared.transactionsTable.latencyColumnP95Label', {
        defaultMessage: 'Latency (95th)',
      });
    case LatencyAggregationType.p99:
      return i18n.translate('apmUiShared.transactionsTable.latencyColumnP99Label', {
        defaultMessage: 'Latency (99th)',
      });
    default:
      return i18n.translate('apmUiShared.transactionsTable.latencyColumnDefaultLabel', {
        defaultMessage: 'Latency',
      });
  }
}

function MetricCell({
  valueLabel,
  series,
  color,
  comparisonColor,
  showSparkline,
}: {
  valueLabel: string;
  series?: TransactionGroup['latency']['series'];
  color: string;
  comparisonColor: string;
  showSparkline: boolean;
}) {
  if (!series || !showSparkline) {
    return <>{valueLabel}</>;
  }

  return (
    <EuiFlexGroup
      justifyContent="flexEnd"
      gutterSize="xs"
      alignItems="flexEnd"
      responsive={false}
      style={{ overflow: 'hidden', paddingRight: 8 }}
    >
      <EuiFlexItem>
        <EuiText size="s" textAlign="right">
          {valueLabel}
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <Sparkline
          color={color}
          series={series?.value ?? null}
          comparisonSeries={series?.comparison}
          comparisonSeriesColor={comparisonColor}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}

const DEFAULT_REMAINING_TRANSACTIONS_TOOLTIP = (
  <EuiText size="s" style={{ maxWidth: 448 }}>
    {i18n.translate('apmUiShared.transactionsTable.remainingTransactionsDefaultTooltip', {
      defaultMessage:
        'The maximum number of transaction groups has been reached. Try narrowing down your query.',
    })}
  </EuiText>
);

function RemainingTransactionsRow({ tooltipContent }: { tooltipContent?: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const content = tooltipContent ?? DEFAULT_REMAINING_TRANSACTIONS_TOOLTIP;
  return (
    <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
      <EuiFlexItem grow={false}>
        <span style={{ fontStyle: 'italic' }}>
          {i18n.translate('apmUiShared.transactionsTable.remainingTransactionsLabel', {
            defaultMessage: 'Remaining Transactions',
          })}
        </span>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiPopover
          aria-label={i18n.translate(
            'apmUiShared.transactionsTable.remainingTransactionsPopoverAriaLabel',
            { defaultMessage: 'Remaining transactions information' }
          )}
          button={
            <EuiToolTip
              content={i18n.translate(
                'apmUiShared.transactionsTable.remainingTransactionsAriaLabel',
                { defaultMessage: 'More information about remaining transactions' }
              )}
              disableScreenReaderOutput
            >
              <EuiButtonIcon
                iconType="warning"
                color="primary"
                size="xs"
                aria-label={i18n.translate(
                  'apmUiShared.transactionsTable.remainingTransactionsAriaLabel',
                  { defaultMessage: 'More information about remaining transactions' }
                )}
                onClick={() => setIsOpen(true)}
              />
            </EuiToolTip>
          }
          isOpen={isOpen}
          closePopover={() => setIsOpen(false)}
          anchorPosition="upCenter"
        >
          {content}
        </EuiPopover>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}

export function getBuiltInColumns({
  latencyAggregationType,
  nameInteraction,
  alertsInteraction,
  showSparklines = true,
  remainingTransactionsCellTooltipContent,
}: {
  latencyAggregationType?: LatencyAggregationType;
  nameInteraction?: TransactionGroupInteraction;
  alertsInteraction?: TransactionGroupInteraction;
  showSparklines?: boolean;
  remainingTransactionsCellTooltipContent?: ReactNode;
}): Record<ColumnId, EuiBasicTableColumn<TransactionGroup>> {
  return {
    alerts: {
      field: 'alertsCount',
      sortable: true,
      name: i18n.translate('apmUiShared.transactionsTable.alertsColumnLabel', {
        defaultMessage: 'Active alerts',
      }),
      width: '7em',
      render: (_: unknown, item: TransactionGroup) => {
        if (!item.alertsCount) return null;
        const alertsHref = alertsInteraction?.href?.(item);
        const isAlertsInteractive = alertsHref != null || alertsInteraction?.onClick != null;
        const badge = isAlertsInteractive ? (
          <EuiBadge
            iconType="warning"
            color="danger"
            {...(alertsHref != null
              ? { href: alertsHref }
              : {
                  onClick: () => alertsInteraction!.onClick!(item),
                  onClickAriaLabel: i18n.translate(
                    'apmUiShared.transactionsTable.alertsBadgeAriaLabel',
                    { defaultMessage: 'View active alerts' }
                  ),
                })}
            {...getEbtProps({
              action: EBT_CLICK_ACTIONS.VIEW_ALERTS,
              element:
                alertsInteraction?.ebt?.element ?? TRANSACTIONS_TABLE_EBT_ELEMENTS.ROW_ALERTS_BADGE,
            })}
          >
            {item.alertsCount}
          </EuiBadge>
        ) : (
          <EuiBadge tabIndex={0} iconType="warning" color="danger">
            {item.alertsCount}
          </EuiBadge>
        );
        return (
          <EuiToolTip
            position="bottom"
            content={i18n.translate('apmUiShared.transactionsTable.alertsTooltip', {
              defaultMessage: 'Active alerts',
            })}
          >
            {badge}
          </EuiToolTip>
        );
      },
    },
    name: {
      field: 'name',
      sortable: true,
      name: i18n.translate('apmUiShared.transactionsTable.nameColumnLabel', {
        defaultMessage: 'Name',
      }),
      render: (_: unknown, item: TransactionGroup) => {
        if (item.name === '_other') {
          return (
            <RemainingTransactionsRow tooltipContent={remainingTransactionsCellTooltipContent} />
          );
        }
        const nameHref = nameInteraction?.href?.(item);
        const ebtNameProps = getEbtProps({
          action: TRANSACTIONS_TABLE_EBT_ACTIONS.VIEW_TRANSACTION_GROUP,
          element: nameInteraction?.ebt?.element ?? TRANSACTIONS_TABLE_EBT_ELEMENTS.ROW_NAME,
        });
        if (nameHref) {
          return (
            <div style={outerStyle}>
              <EuiToolTip content={item.name} display="block">
                <a href={nameHref} style={truncationStyle} {...ebtNameProps}>
                  {item.name}
                </a>
              </EuiToolTip>
            </div>
          );
        }
        if (nameInteraction?.onClick) {
          return (
            <div style={outerStyle}>
              <EuiToolTip content={item.name} display="block">
                <EuiLink
                  onClick={() => nameInteraction.onClick!(item)}
                  {...ebtNameProps}
                  style={truncationStyle}
                >
                  {item.name}
                </EuiLink>
              </EuiToolTip>
            </div>
          );
        }
        return (
          <div style={outerStyle}>
            <EuiToolTip content={item.name} display="block">
              <span tabIndex={0} style={truncationStyle}>
                {item.name}
              </span>
            </EuiToolTip>
          </div>
        );
      },
    },
    latency: {
      field: 'latency',
      sortable: ({ latency }: TransactionGroup) => latency.value ?? -Infinity,
      name: getLatencyColumnLabel(latencyAggregationType),
      align: RIGHT_ALIGNMENT,
      width: showSparklines ? '15em' : '10em',
      maxWidth: showSparklines ? '15em' : '10em',
      className: 'eui-textNoWrap',
      render: (_: unknown, { latency }: TransactionGroup) => (
        <MetricCell
          valueLabel={asMillisecondDuration(latency.value)}
          series={latency.series}
          color={SPARKLINE_COLORS.latency.current}
          comparisonColor={SPARKLINE_COLORS.latency.comparison}
          showSparkline={showSparklines}
        />
      ),
    },
    throughput: {
      field: 'throughput',
      sortable: ({ throughput }: TransactionGroup) => throughput.value,
      name: i18n.translate('apmUiShared.transactionsTable.throughputColumnLabel', {
        defaultMessage: 'Throughput',
      }),
      align: RIGHT_ALIGNMENT,
      width: showSparklines ? '15em' : '10em',
      maxWidth: showSparklines ? '15em' : '10em',
      className: 'eui-textNoWrap',
      render: (_: unknown, { throughput }: TransactionGroup) => (
        <MetricCell
          valueLabel={asTransactionRate(throughput.value)}
          series={throughput.series}
          color={SPARKLINE_COLORS.throughput.current}
          comparisonColor={SPARKLINE_COLORS.throughput.comparison}
          showSparkline={showSparklines}
        />
      ),
    },
    errorRate: {
      field: 'errorRate',
      sortable: ({ errorRate }: TransactionGroup) => errorRate.value ?? -Infinity,
      align: RIGHT_ALIGNMENT,
      width: showSparklines ? '15em' : '10em',
      maxWidth: showSparklines ? '15em' : '10em',
      className: 'eui-textNoWrap',
      name: i18n.translate('apmUiShared.transactionsTable.errorRateColumnLabel', {
        defaultMessage: 'Failed transaction rate',
      }),
      nameTooltip: {
        content: i18n.translate('apmUiShared.transactionsTable.errorRateTooltip', {
          defaultMessage:
            "The percentage of failed transactions. HTTP server transactions with a 4xx status code (client error) aren't considered failures because the caller, not the server, caused the failure.",
        }),
        icon: 'question',
        iconProps: { color: 'subdued' },
      },
      render: (_: unknown, { errorRate }: TransactionGroup) => (
        <MetricCell
          valueLabel={asPercent(errorRate.value, 1)}
          series={errorRate.series}
          color={SPARKLINE_COLORS.errorRate.current}
          comparisonColor={SPARKLINE_COLORS.errorRate.comparison}
          showSparkline={showSparklines}
        />
      ),
    },
  };
}

export function ImpactColumn({
  impact,
}: {
  impact: TransactionGroup['impact'];
}): React.ReactElement | null {
  if (impact == null) return null;
  return (
    <EuiFlexGroup direction="column" gutterSize="xs">
      <EuiFlexItem>
        <EuiProgress
          value={impact.value}
          max={100}
          size="m"
          color="primary"
          style={{ width: IMPACT_BAR_WIDTH }}
        />
      </EuiFlexItem>
      {impact.comparison !== undefined && (
        <EuiFlexItem>
          <EuiProgress
            value={impact.comparison}
            max={100}
            size="s"
            color="subdued"
            style={{ width: IMPACT_BAR_WIDTH }}
          />
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
}
