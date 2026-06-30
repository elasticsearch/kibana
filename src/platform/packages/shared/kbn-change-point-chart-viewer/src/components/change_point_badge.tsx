/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiBadge, EuiToolTip, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import React from 'react';
import type { ChangePointCardModel } from '../utils/derive_change_point_cards';
import {
  getPvalueImpactLevel,
  formatPvalueLabel,
  PVALUE_IMPACT_COLORS,
} from '../utils/get_pvalue_impact';
import { humaniseType, getChangePointTypeDescription } from '../utils/change_point_type_utils';

export interface ChangePointBadgeProps {
  changePointTypes: ChangePointCardModel['changePointTypes'];
  minPvalue: ChangePointCardModel['minPvalue'];
}

/**
 * Badge showing the change-point type(s) for a chart card, colour-coded by the card's minimum
 * pvalue to match the significance colours in the Discover results table.
 *
 * Renders nothing when no type data is available (BY mode) or when minPvalue is undefined.
 * Positioning is handled by the parent — this component renders only the EuiBadge itself.
 */
export const ChangePointBadge: React.FC<ChangePointBadgeProps> = ({
  changePointTypes,
  minPvalue,
}) => {
  const { euiTheme } = useEuiTheme();

  if (changePointTypes.length === 0 || minPvalue === undefined) return null;

  const label = changePointTypes.map(humaniseType).join(', ');
  const impactLevel = getPvalueImpactLevel(minPvalue);
  const color = PVALUE_IMPACT_COLORS[impactLevel]; // 'danger' | 'warning' | 'primary'
  const iconColor = euiTheme.colors[color as keyof typeof euiTheme.colors] as string;

  const tooltipLines = changePointTypes
    .map((type) => getChangePointTypeDescription(type, impactLevel))
    .filter(Boolean);
  const tooltipContent =
    tooltipLines.length > 0
      ? tooltipLines.join('\n\n')
      : i18n.translate('changePointChartViewer.badge.tooltip.unknown', {
          defaultMessage: 'A statistically significant change was detected in this metric.',
        });

  return (
    <EuiToolTip content={tooltipContent} position="bottom">
      <EuiBadge
        color="hollow"
        iconType="dot"
        iconSide="left"
        title={formatPvalueLabel(minPvalue)}
        tabIndex={0}
        css={css`
          & .euiBadge__icon {
            color: ${iconColor};
          }
        `}
      >
        {label}
      </EuiBadge>
    </EuiToolTip>
  );
};
