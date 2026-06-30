/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { createAction } from '@reduxjs/toolkit';
import type { MonitorOverviewPageState } from '..';
import { createAsyncAction } from '../utils/actions';

import type { OverviewStaleStatus, OverviewStatus } from '../../../../../common/runtime_types';

export const fetchOverviewStatusAction = createAsyncAction<
  { pageState: MonitorOverviewPageState; scopeStatusByLocation?: boolean },
  OverviewStatus
>('fetchOverviewStatusAction');

export const quietFetchOverviewStatusAction = createAsyncAction<
  { pageState: MonitorOverviewPageState; scopeStatusByLocation?: boolean },
  OverviewStatus
>('quietFetchOverviewStatusAction');

/**
 * Supplementary lookup that promotes `pending` monitors which stopped reporting
 * before the overview window started to `stale`. Triggered automatically after
 * each overview status load (see `augmentStaleStatusEffect`).
 */
export const fetchStaleStatusAction = createAsyncAction<
  { pageState: MonitorOverviewPageState; monitorQueryIds: string[] },
  OverviewStaleStatus
>('fetchStaleStatusAction');

export const clearOverviewStatusErrorAction = createAction<void>('clearOverviewStatusErrorAction');
export const initialLoadReported = createAction<void>('initialLoadReported');
