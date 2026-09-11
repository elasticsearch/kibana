/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import { ALERT_EPISODE_ACTION_TYPE, bulkTagSeriesActionBodySchema } from '@kbn/alerting-v2-schemas';
import type { AlertActionsClient } from '../../../lib/alert_actions_client';
import { createAlertActionsClientMock } from '../../../lib/alert_actions_client/alert_actions_client.mock';
import { createBulkSeriesActionRouteForType } from './create_bulk_series_action_route_for_type';
import { createRouteDependencies } from '../../test_utils';

const makeRouteClass = () =>
  createBulkSeriesActionRouteForType({
    actionType: ALERT_EPISODE_ACTION_TYPE.TAG,
    pathSuffix: '_bulk_tag',
    summary: 'Bulk tag alert episode series',
    bodySchema: bulkTagSeriesActionBodySchema,
  });

describe('createBulkSeriesActionRouteForType', () => {
  it('creates a route class with expected static metadata', () => {
    const RouteClass = makeRouteClass();

    expect(RouteClass.method).toBe('post');
    expect(RouteClass.path).toBe('/api/alerting/v2/series/_bulk_tag');
    expect(RouteClass.options?.summary).toBe('Bulk tag alert episode series');
    expect(RouteClass.validate).toBeDefined();
    expect(RouteClass.validate).toEqual(
      expect.objectContaining({
        onRequestValidationError: expect.any(Function),
      })
    );
  });

  it('injects the fixed action_type into every bulk item', async () => {
    const RouteClass = makeRouteClass();
    const { ctx } = createRouteDependencies();
    const request = {
      body: {
        items: [
          { group_hash: 'group-1', tags: ['p1'] },
          { group_hash: 'group-2', tags: ['p2'] },
        ],
      },
    } as unknown as KibanaRequest;
    const alertActionsClient = createAlertActionsClientMock();
    alertActionsClient.createBulkSeriesActions.mockResolvedValueOnce({
      affected_count: 2,
      errors: [],
    });
    const route = new RouteClass(ctx, request, alertActionsClient as unknown as AlertActionsClient);

    await route.handle();

    expect(alertActionsClient.createBulkSeriesActions).toHaveBeenCalledWith([
      { action_type: 'tag', group_hash: 'group-1', tags: ['p1'] },
      { action_type: 'tag', group_hash: 'group-2', tags: ['p2'] },
    ]);
    expect(ctx.response.ok).toHaveBeenCalledWith({
      body: { affected_count: 2, errors: [] },
    });
  });

  it('maps thrown error to customError response', async () => {
    const RouteClass = makeRouteClass();
    const { ctx } = createRouteDependencies();
    const request = {
      body: { items: [{ group_hash: 'group-1', tags: ['p1'] }] },
    } as unknown as KibanaRequest;
    const alertActionsClient = createAlertActionsClientMock();
    alertActionsClient.createBulkSeriesActions.mockRejectedValueOnce(new Error('boom'));
    const route = new RouteClass(ctx, request, alertActionsClient as unknown as AlertActionsClient);

    await route.handle();

    expect(ctx.response.customError).toHaveBeenCalledTimes(1);
  });
});
