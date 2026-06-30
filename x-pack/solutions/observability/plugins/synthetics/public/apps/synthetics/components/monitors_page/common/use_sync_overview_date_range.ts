/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setOverviewPageStateAction } from '../../../state';
import { useOverviewDateRange } from './use_overview_date_range';

/**
 * Mirror the page-level date picker (URL params) into `MonitorOverviewState`.
 *
 * The overview always scopes each monitor's status to this window, so the range
 * has to live in `pageState` where the overview-status fetch can read it. Copying
 * it here (and letting `useOverviewStatus` re-fetch on the resulting pageState
 * change) keeps the URL as the single source of truth.
 *
 * This lives in its own hook — and not inside the grid/toolbar — because the grid
 * early-returns `<NoMonitorsFound />` when the list is empty, which would unmount
 * any sync placed there and strand later picker changes. Mounting it higher in
 * the tree (above the empty-state early return) keeps the sync alive regardless
 * of the visible UI state.
 */
export function useSyncOverviewDateRange() {
  const dispatch = useDispatch();
  const { dateRangeStart, dateRangeEnd } = useOverviewDateRange();

  useEffect(() => {
    dispatch(setOverviewPageStateAction({ dateRangeStart, dateRangeEnd }));
  }, [dispatch, dateRangeStart, dateRangeEnd]);
}
