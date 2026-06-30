/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { type CSSProperties, type ReactNode } from 'react';
import { EuiBetaBadge, EuiIcon, EuiToolTip, useEuiTheme, type IconColor } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { VisualizationListItem, VisualizationStage } from './types';

const typeColumnName = i18n.translate('visualizations.listing.table.typeColumnName', {
  defaultMessage: 'Type',
});

interface StageBadge {
  label: string;
  title: string;
  tooltip: string;
}

const stageBadges: Partial<Record<VisualizationStage, StageBadge>> = {
  beta: {
    label: 'B',
    title: i18n.translate('visualizations.listing.betaTitle', { defaultMessage: 'Beta' }),
    tooltip: i18n.translate('visualizations.listing.betaTooltip', {
      defaultMessage:
        'This visualization is in beta and is subject to change. The design and code is less mature than official GA ' +
        'features and is being provided as-is with no warranties. Beta features are not subject to the support SLA of official GA ' +
        'features',
    }),
  },
  experimental: {
    label: 'E',
    title: i18n.translate('visualizations.listing.experimentalTitle', {
      defaultMessage: 'Technical preview',
    }),
    tooltip: i18n.translate('visualizations.listing.experimentalTooltip', {
      defaultMessage:
        'This functionality is in technical preview and may be changed or removed completely in a future release. Elastic will work to fix any issues, but features in technical preview are not subject to the support SLA of official GA features.',
    }),
  },
};

interface ErrorVariant {
  color: IconColor;
  iconType: string;
  label: ReactNode;
}

const errorVariants = {
  unknown: {
    color: 'warning',
    iconType: 'warning',
    label: <FormattedMessage id="visualizations.listing.type.unknown" defaultMessage="Unknown" />,
  },
  error: {
    color: 'danger',
    iconType: 'error',
    label: <FormattedMessage id="visualizations.listing.type.error" defaultMessage="Error" />,
  },
} satisfies Record<string, ErrorVariant>;

/**
 * The listing's **Type** cell: a type icon plus the type title with an optional
 * beta/technical-preview badge, or a tooltipped error/unknown state when the
 * item failed to load. Spacing is owned by the cell (theme `gap`), so it renders
 * correctly in any container without an external stylesheet.
 */
const TypeCell = ({ item }: { item: VisualizationListItem }) => {
  const { euiTheme } = useEuiTheme();
  const rowStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: euiTheme.size.s,
  };

  if (item.error) {
    const { color, iconType, label } = errorVariants[item.typeTitle ? 'error' : 'unknown'];
    return (
      <EuiToolTip position="left" content={item.error}>
        <span tabIndex={0} style={rowStyle}>
          <EuiIcon aria-hidden="true" color={color} type={iconType} size="m" />
          {label}
        </span>
      </EuiToolTip>
    );
  }

  const badge = item.stage ? stageBadges[item.stage] : undefined;

  return (
    <span style={rowStyle}>
      {item.image ? (
        <img
          aria-hidden="true"
          alt=""
          src={item.image}
          style={{ inlineSize: euiTheme.size.base, blockSize: euiTheme.size.base }}
        />
      ) : (
        <EuiIcon aria-hidden="true" type={item.icon || 'empty'} size="m" />
      )}
      <span className="eui-textTruncate">{item.typeTitle}</span>
      {badge && (
        <EuiBetaBadge label={badge.label} title={badge.title} tooltipContent={badge.tooltip} />
      )}
    </span>
  );
};

export const getCustomColumn = () => {
  return {
    field: 'typeTitle',
    name: typeColumnName,
    sortable: true,
    className: 'eui-textNoWrap',
    minWidth: '6em',
    width: '6em',
    maxWidth: '11em',
    render: (field: string, record: VisualizationListItem) => <TypeCell item={record} />,
  };
};
