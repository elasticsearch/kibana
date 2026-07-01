/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MouseEventHandler } from 'react';
import React from 'react';
import { css } from '@emotion/react';
import {
  EuiBadge,
  EuiToolTip,
  EuiIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  useEuiMinBreakpoint,
} from '@elastic/eui';
import type { EbtClickAttrs } from '@kbn/ebt-click';
import { getEbtProps } from '@kbn/ebt-click';
import { i18n } from '@kbn/i18n';
import type { SloStatus } from '../../../../common/service_inventory';

interface SloStatusConfig {
  id: string;
  color: 'danger' | 'warning' | 'success' | 'default' | 'hollow';
  showCount: boolean;
  tooltipContent: string;
  ariaLabel: (serviceName: string) => string;
  badgeLabel: (count?: number | string) => string;
}

export const SLO_COUNT_CAP = 50;

const SLO_STATUS_CONFIG: Record<SloStatus | 'noSLOs', SloStatusConfig> = {
  violated: {
    id: 'Violated',
    color: 'danger',
    showCount: true,
    tooltipContent: i18n.translate('xpack.apm.servicesTable.tooltip.sloViolated', {
      defaultMessage: 'One or more SLOs are violated. Click to view SLOs.',
    }),
    ariaLabel: (serviceName: string) =>
      i18n.translate('xpack.apm.servicesTable.sloViolatedAriaLabel', {
        defaultMessage: 'View violated SLOs for {serviceName}',
        values: { serviceName },
      }),
    badgeLabel: (count?: number | string) =>
      i18n.translate('xpack.apm.servicesTable.sloViolated', {
        defaultMessage: '{count} Violated',
        values: { count },
      }),
  },
  degrading: {
    id: 'Degrading',
    color: 'warning',
    showCount: true,
    tooltipContent: i18n.translate('xpack.apm.servicesTable.tooltip.sloDegrading', {
      defaultMessage: 'One or more SLOs are degrading. Click to view SLOs.',
    }),
    ariaLabel: (serviceName: string) =>
      i18n.translate('xpack.apm.servicesTable.sloDegradingAriaLabel', {
        defaultMessage: 'View degrading SLOs for {serviceName}',
        values: { serviceName },
      }),
    badgeLabel: (count?: number | string) =>
      i18n.translate('xpack.apm.servicesTable.sloDegrading', {
        defaultMessage: '{count} Degrading',
        values: { count },
      }),
  },
  noData: {
    id: 'NoData',
    color: 'default',
    showCount: false,
    tooltipContent: i18n.translate('xpack.apm.servicesTable.tooltip.sloNoData', {
      defaultMessage: 'One or more SLOs have no data. Click to view SLOs.',
    }),
    ariaLabel: (serviceName: string) =>
      i18n.translate('xpack.apm.servicesTable.sloNoDataAriaLabel', {
        defaultMessage: 'View SLOs with no data for {serviceName}',
        values: { serviceName },
      }),
    badgeLabel: () =>
      i18n.translate('xpack.apm.servicesTable.sloNoData', {
        defaultMessage: 'No data',
      }),
  },
  healthy: {
    id: 'Healthy',
    color: 'success',
    showCount: false,
    tooltipContent: i18n.translate('xpack.apm.servicesTable.tooltip.sloHealthy', {
      defaultMessage: 'All SLOs are healthy. Click to view details.',
    }),
    ariaLabel: (serviceName: string) =>
      i18n.translate('xpack.apm.servicesTable.sloHealthyAriaLabel', {
        defaultMessage: 'View healthy SLOs for {serviceName}',
        values: { serviceName },
      }),
    badgeLabel: () =>
      i18n.translate('xpack.apm.servicesTable.sloHealthy', {
        defaultMessage: 'Healthy',
      }),
  },
  noSLOs: {
    id: 'NoSLOs',
    color: 'hollow',
    showCount: false,
    tooltipContent: i18n.translate('xpack.apm.servicesTable.tooltip.noSLOs', {
      defaultMessage: 'No SLOs are defined for this service. Click to create a new SLO.',
    }),
    ariaLabel: (serviceName: string) =>
      i18n.translate('xpack.apm.servicesTable.noSLOsAriaLabel', {
        defaultMessage: 'Create a new SLO for {serviceName}',
        values: { serviceName },
      }),
    badgeLabel: () =>
      i18n.translate('xpack.apm.servicesTable.noSLOs', {
        defaultMessage: 'No SLOs',
      }),
  },
};

export function SloStatusBadge({
  sloStatus,
  sloCount,
  serviceName,
  onClick,
  ebt,
  hideTooltip = false,
  compactLabelOnNarrowScreens = false,
}: {
  sloStatus: SloStatus | 'noSLOs';
  sloCount?: number;
  serviceName: string;
  /** When omitted, the badge is display-only (e.g. service map static badges). */
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** EBT click attributes; only applied when `onClick` is provided. */
  ebt?: EbtClickAttrs;
  /** When true, no EuiToolTip (e.g. service map). Inventory and other callers omit this. */
  hideTooltip?: boolean;
  /**
   * When true and the status shows a numeric count, xs/s viewports show icon + count only
   * (full label from `m` breakpoint up) to avoid wrapping on the service map.
   */
  compactLabelOnNarrowScreens?: boolean;
}) {
  /** Min-width `m` only — avoid `useEuiBreakpoint(['m','l','xl'])`, which can cap at `xl` and hide the wide label on larger viewports. */
  const mUpMedia = useEuiMinBreakpoint('m');
  const config = SLO_STATUS_CONFIG[sloStatus];
  const cappedCount =
    config.showCount && sloCount
      ? sloCount >= SLO_COUNT_CAP
        ? `${SLO_COUNT_CAP}+`
        : sloCount
      : undefined;

  const useNarrowCompact =
    compactLabelOnNarrowScreens && config.showCount && cappedCount !== undefined;

  const ebtProps = onClick && ebt ? getEbtProps(ebt) : {};

  const responsiveCompactRowStyles = useNarrowCompact
    ? css`
        .apmSloBadgeNarrowCount {
          display: block;
          ${mUpMedia} {
            display: none;
          }
        }
        .apmSloBadgeWideLabel {
          display: none;
          ${mUpMedia} {
            display: block;
          }
        }
      `
    : undefined;

  const badge = (
    <EuiBadge
      data-test-subj="apmSloBadge"
      data-slo-status={sloStatus}
      color={config.color}
      {...ebtProps}
      {...(onClick
        ? { onClick, onClickAriaLabel: config.ariaLabel(serviceName) }
        : { 'aria-label': config.ariaLabel(serviceName) })}
    >
      <EuiFlexGroup
        alignItems="center"
        gutterSize="s"
        responsive={false}
        wrap={false}
        css={responsiveCompactRowStyles}
      >
        {sloStatus !== 'noSLOs' && (
          <EuiFlexItem grow={false}>
            <EuiIcon type="chartGauge" aria-hidden={true} />
          </EuiFlexItem>
        )}
        {useNarrowCompact ? (
          <>
            <EuiFlexItem grow={false} className="apmSloBadgeNarrowCount">
              <EuiText size="xs">{cappedCount}</EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false} className="apmSloBadgeWideLabel">
              <EuiText size="xs">{config.badgeLabel(cappedCount)}</EuiText>
            </EuiFlexItem>
          </>
        ) : (
          <EuiFlexItem grow={false}>
            <EuiText size="xs">{config.badgeLabel(cappedCount)}</EuiText>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </EuiBadge>
  );

  if (hideTooltip) {
    return badge;
  }

  if (onClick) {
    return (
      <EuiToolTip position="bottom" content={config.tooltipContent}>
        {badge}
      </EuiToolTip>
    );
  }

  return (
    <EuiToolTip position="bottom" content={config.tooltipContent}>
      <span tabIndex={0}>{badge}</span>
    </EuiToolTip>
  );
}
