/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  seriesAlertActionParamsSchema,
  errorResponseSchema,
  type CreateSeriesAlertActionBody,
  type SeriesAlertActionParams,
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

interface CreateSeriesActionRouteForTypeOptions<
  TAction extends CreateSeriesAlertActionBody['action_type']
> {
  actionType: TAction;
  pathSuffix: string;
  summary: string;
  bodySchema: z.ZodType<
    Omit<Extract<CreateSeriesAlertActionBody, { action_type: TAction }>, 'action_type'>
  >;
  oasOperationObject?: RouteConfigOptions<RouteMethod>['oasOperationObject'];
}

export const createSeriesActionRouteForType = <
  TAction extends CreateSeriesAlertActionBody['action_type']
>({
  actionType,
  pathSuffix,
  summary,
  bodySchema,
  oasOperationObject,
}: CreateSeriesActionRouteForTypeOptions<TAction>): RouteDefinition<
  SeriesAlertActionParams,
  unknown,
  Omit<Extract<CreateSeriesAlertActionBody, { action_type: TAction }>, 'action_type'>,
  'post'
> => {
  type ActionBody = Omit<
    Extract<CreateSeriesAlertActionBody, { action_type: TAction }>,
    'action_type'
  >;

  @injectable()
  class CreateTypedSeriesActionRoute extends BaseAlertingRoute {
    static method = 'post' as const;
    static path = `${ALERTING_V2_SERIES_API_PATH}/{group_hash}/${pathSuffix}`;
    static security: RouteSecurity = {
      authz: {
        requiredPrivileges: [ALERTING_V2_API_PRIVILEGES.alerts.write],
      },
    };
    static routeOptions = {
      summary,
      description: 'Create an action for a specific alert episode series.',
      oasOperationObject,
    } as const;
    static schemas = {
      request: {
        params: seriesAlertActionParamsSchema,
        body: bodySchema,
      },
      response: {
        204: {
          description: 'Indicates the action was created.',
        },
        400: {
          body: () => errorResponseSchema,
          description: INVALID_SCHEMA_OR_PARAMETERS_DESCRIPTION,
        },
        404: {
          body: () => errorResponseSchema,
          description: 'Indicates the alert episode series was not found.',
        },
      },
    };

    protected readonly routeName = `create series ${pathSuffix} action`;

    constructor(
      @inject(AlertingRouteContext) ctx: AlertingRouteContext,
      @inject(Request)
      private readonly request: KibanaRequest<SeriesAlertActionParams, unknown, ActionBody>,
      @inject(AlertActionsClient) private readonly alertActionsClient: AlertActionsClient
    ) {
      super(ctx);
    }

    protected async execute() {
      await this.alertActionsClient.createSeriesAction({
        groupHash: this.request.params.group_hash,
        action: {
          action_type: actionType,
          ...this.request.body,
        } as Extract<CreateSeriesAlertActionBody, { action_type: TAction }>,
      });

      return this.ctx.response.noContent();
    }
  }

  return CreateTypedSeriesActionRoute as RouteDefinition<
    SeriesAlertActionParams,
    unknown,
    ActionBody,
    'post'
  >;
};
