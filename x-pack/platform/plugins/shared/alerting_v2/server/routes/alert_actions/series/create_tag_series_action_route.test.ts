/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import { createTagSeriesActionBodySchema } from '@kbn/alerting-v2-schemas';
import type { AlertActionsClient } from '../../../lib/alert_actions_client';
import { createAlertActionsClientMock } from '../../../lib/alert_actions_client/alert_actions_client.mock';
import { CreateTagSeriesActionRoute } from './create_tag_series_action_route';
import { createRouteDependencies } from '../../test_utils';

describe('CreateTagSeriesActionRoute', () => {
  const groupHash = 'group-1';

  it('injects action_type and returns noContent', async () => {
    const body = { tags: ['p1', 'p2'] };
    const { ctx } = createRouteDependencies();
    const request = { params: { group_hash: groupHash }, body } as unknown as KibanaRequest;
    const alertActionsClient = createAlertActionsClientMock();
    const route = new CreateTagSeriesActionRoute(
      ctx,
      request,
      alertActionsClient as unknown as AlertActionsClient
    );

    await route.handle();

    expect(alertActionsClient.createSeriesAction).toHaveBeenCalledWith({
      groupHash,
      action: { action_type: 'tag', ...body },
    });
    expect(ctx.response.noContent).toHaveBeenCalled();
  });

  it('returns customError on failure', async () => {
    const { ctx } = createRouteDependencies();
    const request = {
      params: { group_hash: groupHash },
      body: { tags: ['x'] },
    } as unknown as KibanaRequest;
    const alertActionsClient = createAlertActionsClientMock();
    alertActionsClient.createSeriesAction.mockRejectedValueOnce(new Error('boom'));
    const route = new CreateTagSeriesActionRoute(
      ctx,
      request,
      alertActionsClient as unknown as AlertActionsClient
    );

    await route.handle();

    expect(ctx.response.customError).toHaveBeenCalledTimes(1);
  });
});

describe('createTagSeriesActionBodySchema', () => {
  it('accepts payload without action_type', () => {
    expect(createTagSeriesActionBodySchema.safeParse({ tags: ['foo'] }).success).toBe(true);
  });

  it('rejects payload with action_type', () => {
    expect(
      createTagSeriesActionBodySchema.safeParse({ action_type: 'tag', tags: ['foo'] }).success
    ).toBe(false);
  });
});
