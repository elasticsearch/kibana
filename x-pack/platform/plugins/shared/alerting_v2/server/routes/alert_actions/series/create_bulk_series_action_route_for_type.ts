/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  bulkResponseSchema,
  errorResponseSchema,
  type BulkCreateSeriesAlertActionItemBody,
  type CreateSeriesAlertActionBody,
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
import { ALERTING_V2_SERIES_API_PATH } from '../../constants';
import { BaseAlertingRoute } from '../../base_alerting_route';
import { AlertingRouteContext } from '../../alerting_route_context';
import { INVALID_SCHEMA_OR_PARAMETERS_DESCRIPTION } from '../../route_descriptions';

export interface BulkSeriesActionBody<TAction extends CreateSeriesAlertActionBody['action_type']> {
  items: Array<
    Omit<Extract<CreateSeriesAlertActionBody, { action_type: TAction }>, 'action_type'> & {
      group_hash: string;
    }
  >;
}

interface CreateBulkSeriesActionRouteForTypeOptions<
  TAction extends CreateSeriesAlertActionBody['action_type']
> {
  actionType: TAction;
  pathSuffix: string;
  summary: string;
  bodySchema: z.ZodType<BulkSeriesActionBody<TAction>>;
  oasOperationObject?: RouteConfigOptions<RouteMethod>['oasOperationObject'];
}

export const createBulkSeriesActionRouteForType = <
  TAction extends CreateSeriesAlertActionBody['action_type']
>({
  actionType,
  pathSuffix,
  summary,
  bodySchema,
  oasOperationObject,
}: CreateBulkSeriesActionRouteForTypeOptions<TAction>): RouteDefinition<
  unknown,
  unknown,
  BulkSeriesActionBody<TAction>,
  'post'
> => {
  @injectable()
  class BulkTypedSeriesActionRoute extends BaseAlertingRoute {
    static method = 'post' as const;
    static path = `${ALERTING_V2_SERIES_API_PATH}/${pathSuffix}`;
    static security: RouteSecurity = {
      authz: {
        requiredPrivileges: [ALERTING_V2_API_PRIVILEGES.alerts.write],
      },
    };
    static routeOptions = {
      summary,
      description: 'Create the same action for multiple alert episode series in a single request.',
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

    protected readonly routeName = `bulk series ${pathSuffix} action`;

    constructor(
      @inject(AlertingRouteContext) ctx: AlertingRouteContext,
      @inject(Request)
      private readonly request: KibanaRequest<unknown, unknown, BulkSeriesActionBody<TAction>>,
      @inject(AlertActionsClient) private readonly alertActionsClient: AlertActionsClient
    ) {
      super(ctx);
    }

    protected async execute() {
      const result = await this.alertActionsClient.createBulkSeriesActions(
        this.request.body.items.map(
          (item) =>
            ({
              action_type: actionType,
              ...item,
            } as BulkCreateSeriesAlertActionItemBody)
        )
      );

      return this.ctx.response.ok({ body: result });
    }
  }

  return BulkTypedSeriesActionRoute as RouteDefinition<
    unknown,
    unknown,
    BulkSeriesActionBody<TAction>,
    'post'
  >;
};
