/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CSSProperties, MouseEvent } from 'react';
import React from 'react';
import { EuiBadge } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormMonitorType, MonitorTypeEnum } from '../../../../../../common/runtime_types';

// EuiBadge doesn't expose a `size` prop, but its default is too tall for dense
// table rows. Apply a compact style override when `size="s"` so callers (e.g.
// the compact monitors table) get a slimmer badge without affecting the
// detail/management UIs that use the default presentation.
const COMPACT_BADGE_STYLE: CSSProperties = {
  fontSize: 11,
  lineHeight: '16px',
  padding: '0 4px',
};

export function MonitorTypeBadge({
  monitorType,
  onClick,
  size = 'm',
}: {
  monitorType: string;
  onClick?: () => void;
  size?: 's' | 'm';
}) {
  const style = size === 's' ? COMPACT_BADGE_STYLE : undefined;
  const badgeTitle = getMonitorTypeBadgeTitle(monitorType);
  return onClick ? (
    <EuiBadge
      onClick={onClick}
      onClickAriaLabel={getFilterTitle(badgeTitle)}
      iconType={getMonitorTypeBadgeIcon(monitorType)}
      style={style}
      onMouseDown={(e: MouseEvent) => {
        // Prevents the click event from being propagated to the @elastic/chart metric
        e.stopPropagation();
      }}
    >
      {badgeTitle}
    </EuiBadge>
  ) : (
    <EuiBadge
      iconType={getMonitorTypeBadgeIcon(monitorType)}
      style={style}
      onMouseDown={(e: MouseEvent) => {
        // Prevents the click event from being propagated to the @elastic/chart metric
        e.stopPropagation();
      }}
    >
      {badgeTitle}
    </EuiBadge>
  );
}

const getFilterTitle = (type: string) => {
  return i18n.translate('xpack.synthetics.management.monitorList.monitorTypeBadge.filterByType', {
    defaultMessage: '{type}. Click to filter monitors for this type',
    values: {
      type,
    },
  });
};

function getMonitorTypeBadgeTitle(monitorType: string) {
  switch (monitorType) {
    case FormMonitorType.TCP:
    case FormMonitorType.HTTP:
    case FormMonitorType.ICMP:
      return monitorType.toUpperCase();
    case FormMonitorType.SINGLE:
      return i18n.translate('xpack.synthetics.monitorTypeBadge.page', {
        defaultMessage: 'Page',
      });
    case FormMonitorType.MULTISTEP:
    case MonitorTypeEnum.BROWSER:
      return i18n.translate('xpack.synthetics.monitorTypeBadge.browser', {
        defaultMessage: 'Browser',
      });
    case FormMonitorType.API:
    case MonitorTypeEnum.API:
      return i18n.translate('xpack.synthetics.monitorTypeBadge.apiJourney', {
        defaultMessage: 'API Journey',
      });
    default:
      return monitorType.toUpperCase();
  }
}

function getMonitorTypeBadgeIcon(monitorType: string) {
  switch (monitorType) {
    case MonitorTypeEnum.API:
    case FormMonitorType.API:
      return 'inputOutput';
    case FormMonitorType.SINGLE:
      return 'inspect';
    case MonitorTypeEnum.BROWSER:
    case FormMonitorType.MULTISTEP:
      return 'display';
    case FormMonitorType.HTTP:
    case MonitorTypeEnum.HTTP:
      return 'globe';
    case FormMonitorType.TCP:
    case MonitorTypeEnum.TCP:
      return 'ip';
    case FormMonitorType.ICMP:
    case MonitorTypeEnum.ICMP:
      return 'bolt';
    default:
      return 'wifi';
  }
}
