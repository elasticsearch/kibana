/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect } from 'react';
import { LazyChangePointExperienceGrid } from '@kbn/change-point-chart-viewer';
import type {
  ChangePointChartSectionActions,
  UnifiedChangePointGridProps,
} from '@kbn/change-point-chart-viewer';
import type { ChangePointChartSectionProps$ } from './change_point_context';

interface ChangePointChartSectionSyncProps {
  gridProps: UnifiedChangePointGridProps;
  actions: ChangePointChartSectionActions;
  chartSectionProps$: ChangePointChartSectionProps$;
}

/**
 * Thin wrapper around {@link LazyChangePointExperienceGrid} that synchronises the
 * chart section's runtime props into a profile-scoped BehaviorSubject so the flyout
 * doc viewer tab can access them without prop-drilling through the doc viewer API.
 *
 * The `useEffect` fires only when `fetchParams` changes (i.e. on each Discover
 * refetch), not on every render, because `fetchParams` is a stable object between
 * fetches.
 */
export const ChangePointChartSectionSync: React.FC<ChangePointChartSectionSyncProps> = ({
  gridProps,
  actions,
  chartSectionProps$,
}) => {
  const { fetchParams, fetch$, services, onBrushEnd, onFilter } = gridProps;

  useEffect(() => {
    chartSectionProps$.next({ fetchParams, fetch$, services, onBrushEnd, onFilter });
  }, [chartSectionProps$, fetchParams, fetch$, services, onBrushEnd, onFilter]);

  return <LazyChangePointExperienceGrid {...gridProps} actions={actions} />;
};
