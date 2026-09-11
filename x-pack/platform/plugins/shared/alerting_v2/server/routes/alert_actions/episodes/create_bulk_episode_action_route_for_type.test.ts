/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import {
  ALERT_EPISODE_ACTION_TYPE,
  bulkAssignEpisodeActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import type { AlertActionsClient } from '../../../lib/alert_actions_client';
import { createAlertActionsClientMock } from '../../../lib/alert_actions_client/alert_actions_client.mock';
import { createBulkEpisodeActionRouteForType } from './create_bulk_episode_action_route_for_type';
import { createRouteDependencies } from '../../test_utils';

const makeRouteClass = () =>
  createBulkEpisodeActionRouteForType({
    actionType: ALERT_EPISODE_ACTION_TYPE.ASSIGN,
    pathSuffix: '_bulk_assign',
    summary: 'Bulk assign alert episodes',
    bodySchema: bulkAssignEpisodeActionBodySchema,
  });

describe('createBulkEpisodeActionRouteForType', () => {
  it('creates a route class with expected static metadata', () => {
    const RouteClass = makeRouteClass();

    expect(RouteClass.method).toBe('post');
    expect(RouteClass.path).toBe('/api/alerting/v2/episodes/_bulk_assign');
    expect(RouteClass.options?.summary).toBe('Bulk assign alert episodes');
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
          { episode_id: 'episode-1', assignee_uid: 'u_abc123' },
          { episode_id: 'episode-2', assignee_uid: null },
        ],
      },
    } as unknown as KibanaRequest;
    const alertActionsClient = createAlertActionsClientMock();
    alertActionsClient.createBulkEpisodeActions.mockResolvedValueOnce({
      affected_count: 2,
      errors: [],
    });
    const route = new RouteClass(ctx, request, alertActionsClient as unknown as AlertActionsClient);

    await route.handle();

    expect(alertActionsClient.createBulkEpisodeActions).toHaveBeenCalledWith([
      { action_type: 'assign', episode_id: 'episode-1', assignee_uid: 'u_abc123' },
      { action_type: 'assign', episode_id: 'episode-2', assignee_uid: null },
    ]);
    expect(ctx.response.ok).toHaveBeenCalledWith({
      body: { affected_count: 2, errors: [] },
    });
  });

  it('maps thrown error to customError response', async () => {
    const RouteClass = makeRouteClass();
    const { ctx } = createRouteDependencies();
    const request = {
      body: { items: [{ episode_id: 'episode-1', assignee_uid: null }] },
    } as unknown as KibanaRequest;
    const alertActionsClient = createAlertActionsClientMock();
    alertActionsClient.createBulkEpisodeActions.mockRejectedValueOnce(new Error('boom'));
    const route = new RouteClass(ctx, request, alertActionsClient as unknown as AlertActionsClient);

    await route.handle();

    expect(ctx.response.customError).toHaveBeenCalledTimes(1);
  });
});
