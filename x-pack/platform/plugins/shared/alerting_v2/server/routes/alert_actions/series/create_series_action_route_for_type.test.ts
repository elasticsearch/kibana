/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import {
  ALERT_EPISODE_ACTION_TYPE,
  createTagSeriesActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import type { AlertActionsClient } from '../../../lib/alert_actions_client';
import { createAlertActionsClientMock } from '../../../lib/alert_actions_client/alert_actions_client.mock';
import { createSeriesActionRouteForType } from './create_series_action_route_for_type';
import { createRouteDependencies } from '../../test_utils';

describe('createSeriesActionRouteForType', () => {
  it('creates a route class with expected static metadata', () => {
    const suffix = '_tag';
    const summary = 'Tag an alert series';
    const RouteClass = createSeriesActionRouteForType({
      actionType: ALERT_EPISODE_ACTION_TYPE.TAG,
      pathSuffix: suffix,
      summary,
      bodySchema: createTagSeriesActionBodySchema,
    });

    expect(RouteClass.method).toBe('post');
    expect(RouteClass.path).toBe(`/api/alerting/v2/series/{group_hash}/${suffix}`);
    expect(RouteClass.options?.summary).toBe(summary);
    expect(RouteClass.validate).toBeDefined();
    expect(RouteClass.validate).toEqual(
      expect.objectContaining({
        onRequestValidationError: expect.any(Function),
      })
    );
  });

  it('injects inferred action_type into createSeriesAction payload', async () => {
    const RouteClass = createSeriesActionRouteForType({
      actionType: ALERT_EPISODE_ACTION_TYPE.TAG,
      pathSuffix: '_tag',
      summary: 'Tag an alert series',
      bodySchema: createTagSeriesActionBodySchema,
    });
    const { ctx } = createRouteDependencies();
    const request = {
      params: { group_hash: 'group-1' },
      body: { tags: ['p1'] },
    } as unknown as KibanaRequest;
    const alertActionsClient = createAlertActionsClientMock();
    const route = new RouteClass(ctx, request, alertActionsClient as unknown as AlertActionsClient);

    await route.handle();

    expect(alertActionsClient.createSeriesAction).toHaveBeenCalledWith({
      groupHash: 'group-1',
      action: {
        action_type: 'tag',
        tags: ['p1'],
      },
    });
    expect(ctx.response.noContent).toHaveBeenCalled();
  });

  it('maps thrown error to customError response', async () => {
    const RouteClass = createSeriesActionRouteForType({
      actionType: ALERT_EPISODE_ACTION_TYPE.TAG,
      pathSuffix: '_tag',
      summary: 'Tag an alert series',
      bodySchema: createTagSeriesActionBodySchema,
    });
    const { ctx } = createRouteDependencies();
    const request = {
      params: { group_hash: 'group-1' },
      body: { tags: ['p1'] },
    } as unknown as KibanaRequest;
    const alertActionsClient = createAlertActionsClientMock();
    alertActionsClient.createSeriesAction.mockRejectedValueOnce(new Error('boom'));
    const route = new RouteClass(ctx, request, alertActionsClient as unknown as AlertActionsClient);

    await route.handle();

    expect(ctx.response.customError).toHaveBeenCalledTimes(1);
  });
});
