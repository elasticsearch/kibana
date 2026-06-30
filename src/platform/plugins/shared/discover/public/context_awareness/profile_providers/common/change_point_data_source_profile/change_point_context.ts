/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { BehaviorSubject } from 'rxjs';
import type { UnifiedChangePointGridProps } from '@kbn/change-point-chart-viewer';

export const CHANGE_POINT_DATA_SOURCE_PROFILE_ID = 'change-point-data-source-profile';

/**
 * Snapshot of the chart section props shared from `getChartSectionConfiguration` to
 * `getDocViewer` via the profile context. Contains only the fields the flyout tab needs.
 */
export type ChangePointChartSectionSnapshot = Pick<
  UnifiedChangePointGridProps,
  'fetchParams' | 'fetch$' | 'services' | 'onBrushEnd' | 'onFilter'
>;

export type ChangePointChartSectionProps$ = BehaviorSubject<
  ChangePointChartSectionSnapshot | undefined
>;
