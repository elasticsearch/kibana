/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { OverviewStatusService } from './overview_status_service';
import type { SyntheticsRestApiRouteFactory } from '../types';
import type { OverviewStaleStatus, OverviewStatusState } from '../../../common/runtime_types';
import { SYNTHETICS_API_URLS } from '../../../common/constants';
import { OverviewStatusSchema, OverviewStatusStaleBodySchema } from '../common';

export const createGetCurrentStatusRoute: SyntheticsRestApiRouteFactory = () => ({
  method: 'GET',
  path: SYNTHETICS_API_URLS.OVERVIEW_STATUS,
  validate: {
    query: OverviewStatusSchema,
  },
  handler: async (routeContext): Promise<OverviewStatusState> => {
    const statusOverview = new OverviewStatusService(routeContext);
    return await statusOverview.getOverviewStatus();
  },
});

/**
 * Supplementary lookup for the overview's "stale" classification. The main
 * status route only marks a monitor `stale` when it has an in-window run that
 * then went quiet; monitors that stopped reporting *before* the window land in
 * `pending`. The client calls this (passing the pending `monitorQueryIds`) to
 * resolve their last-known run before the window and promote the genuinely
 * stale ones — kept as a separate request so the main overview stays fast.
 */
export const createGetStaleStatusRoute: SyntheticsRestApiRouteFactory = () => ({
  method: 'POST',
  path: SYNTHETICS_API_URLS.OVERVIEW_STATUS_STALE,
  validate: {
    query: OverviewStatusSchema,
    body: OverviewStatusStaleBodySchema,
  },
  handler: async (routeContext): Promise<OverviewStaleStatus> => {
    const statusOverview = new OverviewStatusService(routeContext);
    return await statusOverview.getStaleStatusBeforeWindow();
  },
});
