/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiThemeComputed } from '@elastic/eui';
import { ExecutionStatus } from '@kbn/workflows';

/**
 * Pure status → color/icon mapping for graph nodes/edges.
 * Mirrors the plugin's `getExecutionStatusColors` so the canvas does not need
 * to depend on plugin-internal modules. Update both if status colors change.
 */
export interface StatusVisual {
  color: string;
  bg: string;
  iconType: string;
  isSpinner?: boolean;
}

export function getExecutionStatusVisual(
  euiTheme: EuiThemeComputed,
  status: ExecutionStatus | null | undefined
): StatusVisual {
  switch (status) {
    case ExecutionStatus.COMPLETED:
      return {
        color: euiTheme.colors.vis.euiColorVisSuccess0,
        bg: euiTheme.colors.backgroundBaseSuccess,
        iconType: 'checkInCircleFilled',
      };
    case ExecutionStatus.FAILED:
    case ExecutionStatus.TIMED_OUT:
      return {
        color: euiTheme.colors.danger,
        bg: euiTheme.colors.backgroundBaseDanger,
        iconType: 'crossInACircleFilled',
      };
    case ExecutionStatus.RUNNING:
      return {
        color: euiTheme.colors.accent,
        bg: euiTheme.colors.backgroundBaseAccent,
        iconType: 'play',
        isSpinner: true,
      };
    case ExecutionStatus.SKIPPED:
      return {
        color: euiTheme.colors.textSubdued,
        bg: euiTheme.colors.backgroundBaseSubdued,
        iconType: 'minusInCircle',
      };
    case ExecutionStatus.WAITING:
    case ExecutionStatus.WAITING_FOR_INPUT:
      return {
        color: euiTheme.colors.warning,
        bg: euiTheme.colors.backgroundBaseWarning,
        iconType: 'clock',
      };
    case ExecutionStatus.CANCELLED:
      return {
        color: euiTheme.colors.textSubdued,
        bg: euiTheme.colors.backgroundBaseSubdued,
        iconType: 'crossInACircleFilled',
      };
    case ExecutionStatus.PENDING:
      return {
        color: euiTheme.colors.textSubdued,
        bg: euiTheme.colors.backgroundBaseSubdued,
        iconType: 'clock',
      };
    default:
      return {
        color: euiTheme.colors.borderBaseFloating,
        bg: euiTheme.colors.backgroundBasePlain,
        iconType: 'empty',
      };
  }
}
