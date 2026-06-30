/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { PvalueImpactLevel } from './get_pvalue_impact';

/** Converts a raw ES change-point type string to a human-readable label.
 *  e.g. `"step_change"` → `"Step change"`. */
export const humaniseType = (type: string): string => {
  const withSpaces = type.replace(/_/g, ' ');
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
};

/** Returns a plain-English description for a change-point type at the given significance level.
 *  Returns `undefined` for unknown types. */
export const getChangePointTypeDescription = (
  type: string,
  impactLevel: PvalueImpactLevel
): string | undefined => {
  switch (type) {
    case 'dip':
      return i18n.translate('changePointChartViewer.badge.tooltip.dipWithSignificance', {
        defaultMessage:
          'A dip with {impactLevel} statistical significance occurs at this change point.',
        values: { impactLevel },
      });
    case 'distribution_change':
      return i18n.translate(
        'changePointChartViewer.badge.tooltip.distributionChangeWithSignificance',
        {
          defaultMessage:
            'The overall distribution of the values has changed with {impactLevel} statistical significance.',
          values: { impactLevel },
        }
      );
    case 'non_stationary':
      return i18n.translate('changePointChartViewer.badge.tooltip.nonStationary', {
        defaultMessage:
          'There is no change point, but the values are not from a stationary distribution.',
      });
    case 'spike':
      return i18n.translate('changePointChartViewer.badge.tooltip.spikeWithSignificance', {
        defaultMessage:
          'A spike with {impactLevel} statistical significance occurs at this change point.',
        values: { impactLevel },
      });
    case 'stationary':
      return i18n.translate('changePointChartViewer.badge.tooltip.stationary', {
        defaultMessage: 'No change point found.',
      });
    case 'step_change':
      return i18n.translate('changePointChartViewer.badge.tooltip.stepChangeWithSignificance', {
        defaultMessage:
          'The change indicates a step up or down in value distribution with {impactLevel} statistical significance.',
        values: { impactLevel },
      });
    case 'trend_change':
      return i18n.translate('changePointChartViewer.badge.tooltip.trendChangeWithSignificance', {
        defaultMessage:
          'There is an overall trend change occurring at this point with {impactLevel} statistical significance.',
        values: { impactLevel },
      });
    default:
      return undefined;
  }
};
