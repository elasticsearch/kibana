/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  bulkResponseSchema,
  errorResponseSchema,
  type BulkCreateEpisodeAlertActionItemBody,
  type CreateEpisodeAlertActionBody,
} from '@kbn/alerting-v2-schemas';
import { Request, type RouteDefinition } from '@kbn/core-di-server';
import type {
  KibanaRequest,
  RouteConfigOptions,
  RouteMethod,
  RouteSecurity,
} from '@kbn/core-http-server';
import { inject, injectable } from 'inversify';
import type { z } from '@kbn/zod/v4';
import { AlertActionsClient } from '../../../lib/alert_actions_client';
import { ALERTING_V2_API_PRIVILEGES } from '../../../lib/security/privileges';
import { ALERTING_V2_EPISODES_API_PATH } from '../../constants';
import { BaseAlertingRoute } from '../../base_alerting_route';
import { AlertingRouteContext } from '../../alerting_route_context';
import { INVALID_SCHEMA_OR_PARAMETERS_DESCRIPTION } from '../../route_descriptions';

export interface BulkEpisodeActionBody<
  TAction extends CreateEpisodeAlertActionBody['action_type']
> {
  items: Array<
    Omit<Extract<CreateEpisodeAlertActionBody, { action_type: TAction }>, 'action_type'> & {
      episode_id: string;
    }
  >;
}

interface CreateBulkEpisodeActionRouteForTypeOptions<
  TAction extends CreateEpisodeAlertActionBody['action_type']
> {
  actionType: TAction;
  pathSuffix: string;
  summary: string;
  bodySchema: z.ZodType<BulkEpisodeActionBody<TAction>>;
  oasOperationObject?: RouteConfigOptions<RouteMethod>['oasOperationObject'];
}

export const createBulkEpisodeActionRouteForType = <
  TAction extends CreateEpisodeAlertActionBody['action_type']
>({
  actionType,
  pathSuffix,
  summary,
  bodySchema,
  oasOperationObject,
}: CreateBulkEpisodeActionRouteForTypeOptions<TAction>): RouteDefinition<
  unknown,
  unknown,
  BulkEpisodeActionBody<TAction>,
  'post'
> => {
  @injectable()
  class BulkTypedEpisodeActionRoute extends BaseAlertingRoute {
    static method = 'post' as const;
    static path = `${ALERTING_V2_EPISODES_API_PATH}/${pathSuffix}`;
    static security: RouteSecurity = {
      authz: {
        requiredPrivileges: [ALERTING_V2_API_PRIVILEGES.alerts.write],
      },
    };
    static routeOptions = {
      summary,
      description: 'Create the same action for multiple alert episodes in a single request.',
      oasOperationObject,
    } as const;
    static schemas = {
      request: {
        body: bodySchema,
      },
      response: {
        200: {
          body: () => bulkResponseSchema,
          description:
            'Returns the number of created actions and per-item errors for actions that were not created.',
        },
        400: {
          body: () => errorResponseSchema,
          description: INVALID_SCHEMA_OR_PARAMETERS_DESCRIPTION,
        },
      },
    };

    protected readonly routeName = `bulk episode ${pathSuffix} action`;

    constructor(
      @inject(AlertingRouteContext) ctx: AlertingRouteContext,
      @inject(Request)
      private readonly request: KibanaRequest<unknown, unknown, BulkEpisodeActionBody<TAction>>,
      @inject(AlertActionsClient) private readonly alertActionsClient: AlertActionsClient
    ) {
      super(ctx);
    }

    protected async execute() {
      const result = await this.alertActionsClient.createBulkEpisodeActions(
        this.request.body.items.map(
          (item) =>
            ({
              action_type: actionType,
              ...item,
            } as BulkCreateEpisodeAlertActionItemBody)
        )
      );

      return this.ctx.response.ok({ body: result });
    }
  }

  return BulkTypedEpisodeActionRoute as RouteDefinition<
    unknown,
    unknown,
    BulkEpisodeActionBody<TAction>,
    'post'
  >;
};
