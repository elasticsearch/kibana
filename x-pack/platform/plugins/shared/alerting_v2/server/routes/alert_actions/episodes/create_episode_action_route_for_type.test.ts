/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import {
  ALERT_EPISODE_ACTION_TYPE,
  createAssignEpisodeActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import type { AlertActionsClient } from '../../../lib/alert_actions_client';
import { createAlertActionsClientMock } from '../../../lib/alert_actions_client/alert_actions_client.mock';
import { createEpisodeActionRouteForType } from './create_episode_action_route_for_type';
import { createRouteDependencies } from '../../test_utils';

describe('createEpisodeActionRouteForType', () => {
  it('creates a route class with expected static metadata', () => {
    const suffix = '_assign';
    const summary = 'Assign an alert episode to a user';
    const RouteClass = createEpisodeActionRouteForType({
      actionType: ALERT_EPISODE_ACTION_TYPE.ASSIGN,
      pathSuffix: suffix,
      summary,
      bodySchema: createAssignEpisodeActionBodySchema,
    });

    expect(RouteClass.method).toBe('post');
    expect(RouteClass.path).toBe(`/api/alerting/v2/episodes/{episode_id}/${suffix}`);
    expect(RouteClass.options?.summary).toBe(summary);
    expect(RouteClass.validate).toBeDefined();
    expect(RouteClass.validate).toEqual(
      expect.objectContaining({
        onRequestValidationError: expect.any(Function),
      })
    );
  });

  it('injects inferred action_type into createEpisodeAction payload', async () => {
    const RouteClass = createEpisodeActionRouteForType({
      actionType: ALERT_EPISODE_ACTION_TYPE.ASSIGN,
      pathSuffix: '_assign',
      summary: 'Assign an alert episode to a user',
      bodySchema: createAssignEpisodeActionBodySchema,
    });
    const { ctx } = createRouteDependencies();
    const request = {
      params: { episode_id: 'episode-1' },
      body: { assignee_uid: 'u_abc123' },
    } as unknown as KibanaRequest;
    const alertActionsClient = createAlertActionsClientMock();
    const route = new RouteClass(ctx, request, alertActionsClient as unknown as AlertActionsClient);

    await route.handle();

    expect(alertActionsClient.createEpisodeAction).toHaveBeenCalledWith({
      episodeId: 'episode-1',
      action: {
        action_type: 'assign',
        assignee_uid: 'u_abc123',
      },
    });
    expect(ctx.response.noContent).toHaveBeenCalled();
  });

  it('maps thrown error to customError response', async () => {
    const RouteClass = createEpisodeActionRouteForType({
      actionType: ALERT_EPISODE_ACTION_TYPE.ASSIGN,
      pathSuffix: '_assign',
      summary: 'Assign an alert episode to a user',
      bodySchema: createAssignEpisodeActionBodySchema,
    });
    const { ctx } = createRouteDependencies();
    const request = {
      params: { episode_id: 'episode-1' },
      body: { assignee_uid: 'u_abc123' },
    } as unknown as KibanaRequest;
    const alertActionsClient = createAlertActionsClientMock();
    alertActionsClient.createEpisodeAction.mockRejectedValueOnce(new Error('boom'));
    const route = new RouteClass(ctx, request, alertActionsClient as unknown as AlertActionsClient);

    await route.handle();

    expect(ctx.response.customError).toHaveBeenCalledTimes(1);
  });
});
