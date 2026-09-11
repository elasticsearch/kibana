/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import { createAssignEpisodeActionBodySchema } from '@kbn/alerting-v2-schemas';
import type { AlertActionsClient } from '../../../lib/alert_actions_client';
import { createAlertActionsClientMock } from '../../../lib/alert_actions_client/alert_actions_client.mock';
import { CreateAssignEpisodeActionRoute } from './create_assign_episode_action_route';
import { createRouteDependencies } from '../../test_utils';

describe('CreateAssignEpisodeActionRoute', () => {
  const episodeId = 'episode-1';

  it('injects action_type and returns noContent', async () => {
    const body = { assignee_uid: 'u_abc123' };
    const { ctx } = createRouteDependencies();
    const request = { params: { episode_id: episodeId }, body } as unknown as KibanaRequest;
    const alertActionsClient = createAlertActionsClientMock();
    const route = new CreateAssignEpisodeActionRoute(
      ctx,
      request,
      alertActionsClient as unknown as AlertActionsClient
    );

    await route.handle();

    expect(alertActionsClient.createEpisodeAction).toHaveBeenCalledWith({
      episodeId,
      action: { action_type: 'assign', ...body },
    });
    expect(ctx.response.noContent).toHaveBeenCalled();
  });

  it('returns customError on failure', async () => {
    const { ctx } = createRouteDependencies();
    const request = {
      params: { episode_id: episodeId },
      body: { assignee_uid: 'u_abc123' },
    } as unknown as KibanaRequest;
    const alertActionsClient = createAlertActionsClientMock();
    alertActionsClient.createEpisodeAction.mockRejectedValueOnce(new Error('boom'));
    const route = new CreateAssignEpisodeActionRoute(
      ctx,
      request,
      alertActionsClient as unknown as AlertActionsClient
    );

    await route.handle();

    expect(ctx.response.customError).toHaveBeenCalledTimes(1);
  });
});

describe('createAssignEpisodeActionBodySchema', () => {
  it('accepts a null assignee_uid', () => {
    expect(createAssignEpisodeActionBodySchema.safeParse({ assignee_uid: null }).success).toBe(
      true
    );
  });

  it('rejects payload with extra keys', () => {
    expect(
      createAssignEpisodeActionBodySchema.safeParse({ assignee_uid: null, episode_id: 'ep-1' })
        .success
    ).toBe(false);
    expect(
      createAssignEpisodeActionBodySchema.safeParse({ assignee_uid: null, action_type: 'assign' })
        .success
    ).toBe(false);
  });
});
