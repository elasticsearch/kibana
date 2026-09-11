/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import { createUnsnoozeSeriesActionBodySchema } from '@kbn/alerting-v2-schemas';
import type { AlertActionsClient } from '../../../lib/alert_actions_client';
import { createAlertActionsClientMock } from '../../../lib/alert_actions_client/alert_actions_client.mock';
import { CreateUnsnoozeSeriesActionRoute } from './create_unsnooze_series_action_route';
import { createRouteDependencies } from '../../test_utils';

describe('CreateUnsnoozeSeriesActionRoute', () => {
  const groupHash = 'group-1';

  it('injects action_type and returns noContent', async () => {
    const { ctx } = createRouteDependencies();
    const request = {
      params: { group_hash: groupHash },
      body: {},
    } as unknown as KibanaRequest;
    const alertActionsClient = createAlertActionsClientMock();
    const route = new CreateUnsnoozeSeriesActionRoute(
      ctx,
      request,
      alertActionsClient as unknown as AlertActionsClient
    );

    await route.handle();

    expect(alertActionsClient.createSeriesAction).toHaveBeenCalledWith({
      groupHash,
      action: { action_type: 'unsnooze' },
    });
    expect(ctx.response.noContent).toHaveBeenCalled();
  });

  it('returns customError on failure', async () => {
    const { ctx } = createRouteDependencies();
    const request = {
      params: { group_hash: groupHash },
      body: {},
    } as unknown as KibanaRequest;
    const alertActionsClient = createAlertActionsClientMock();
    alertActionsClient.createSeriesAction.mockRejectedValueOnce(new Error('boom'));
    const route = new CreateUnsnoozeSeriesActionRoute(
      ctx,
      request,
      alertActionsClient as unknown as AlertActionsClient
    );

    await route.handle();

    expect(ctx.response.customError).toHaveBeenCalledTimes(1);
  });
});

describe('createUnsnoozeSeriesActionBodySchema', () => {
  it('accepts empty payload without action_type', () => {
    expect(createUnsnoozeSeriesActionBodySchema.safeParse({}).success).toBe(true);
  });

  it('rejects payload with action_type', () => {
    expect(
      createUnsnoozeSeriesActionBodySchema.safeParse({ action_type: 'unsnooze' }).success
    ).toBe(false);
  });
});
