/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createSelector } from 'reselect';

import type { SyntheticsAppState } from '../root_reducer';

export const selectOverviewState = (state: SyntheticsAppState) => state.overview;
export const selectOverviewPageState = (state: SyntheticsAppState) => state.overview.pageState;
export const selectOverviewGroupBy = (state: SyntheticsAppState) => state.overview.groupBy;
export const selectOverviewView = (state: SyntheticsAppState) => state.overview.view;
export const selectOverviewShowLastRun = (state: SyntheticsAppState) => state.overview.showLastRun;
export const selectOverviewFlyoutConfig = (state: SyntheticsAppState) =>
  state.overview.flyoutConfig;
export const selectErrorPopoverState = createSelector(
  selectOverviewState,
  (state) => state.isErrorPopoverOpen
);
export const selectOverviewTrends = createSelector(
  selectOverviewState,
  ({ trendStats }) => trendStats
);
