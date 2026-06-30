/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { createAction } from '@reduxjs/toolkit';
import type { GetTrendPayload, TrendRequest, TrendTable } from '../../../../../common/types';
import { createAsyncAction } from '../utils/actions';

import type {
  MonitorOverviewFlyoutConfig,
  MonitorOverviewPageState,
  MonitorOverviewState,
} from './models';

export const setOverviewPageStateAction = createAction<Partial<MonitorOverviewPageState>>(
  'setOverviewPageStateAction'
);

export const setOverviewGroupByAction = createAction<MonitorOverviewState['groupBy']>(
  'setOverviewGroupByAction'
);
export const setFlyoutConfig = createAction<MonitorOverviewFlyoutConfig>('setFlyoutConfig');
export const toggleErrorPopoverOpen = createAction<string | null>('setErrorPopoverOpen');

export const refreshOverviewTrends = createAsyncAction<void, TrendTable, any>(
  'refreshOverviewTrendStats'
);

export const trendStatsBatch = createAsyncAction<TrendRequest[], GetTrendPayload, TrendRequest[]>(
  'batchTrendStats'
);
export const setOverviewViewAction =
  createAction<MonitorOverviewState['view']>('setOverviewViewAction');

export const setOverviewShowLastRunAction = createAction<boolean>('setOverviewShowLastRunAction');
