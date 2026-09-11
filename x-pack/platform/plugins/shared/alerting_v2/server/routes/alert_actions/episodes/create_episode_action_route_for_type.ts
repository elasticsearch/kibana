/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  episodeAlertActionParamsSchema,
  errorResponseSchema,
  type CreateEpisodeAlertActionBody,
  type EpisodeAlertActionParams,
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

interface CreateEpisodeActionRouteForTypeOptions<
  TAction extends CreateEpisodeAlertActionBody['action_type']
> {
  actionType: TAction;
  pathSuffix: string;
  summary: string;
  bodySchema: z.ZodType<
    Omit<Extract<CreateEpisodeAlertActionBody, { action_type: TAction }>, 'action_type'>
  >;
  oasOperationObject?: RouteConfigOptions<RouteMethod>['oasOperationObject'];
  /**
   * Extra context for the 404 description: lifecycle actions (activate /
   * deactivate) also return 404 when the episode is not the latest of its
   * series.
   */
  notFoundDescription?: string;
}

export const createEpisodeActionRouteForType = <
  TAction extends CreateEpisodeAlertActionBody['action_type']
>({
  actionType,
  pathSuffix,
  summary,
  bodySchema,
  oasOperationObject,
  notFoundDescription,
}: CreateEpisodeActionRouteForTypeOptions<TAction>): RouteDefinition<
  EpisodeAlertActionParams,
  unknown,
  Omit<Extract<CreateEpisodeAlertActionBody, { action_type: TAction }>, 'action_type'>,
  'post'
> => {
  type ActionBody = Omit<
    Extract<CreateEpisodeAlertActionBody, { action_type: TAction }>,
    'action_type'
  >;

  @injectable()
  class CreateTypedEpisodeActionRoute extends BaseAlertingRoute {
    static method = 'post' as const;
    static path = `${ALERTING_V2_EPISODES_API_PATH}/{episode_id}/${pathSuffix}`;
    static security: RouteSecurity = {
      authz: {
        requiredPrivileges: [ALERTING_V2_API_PRIVILEGES.alerts.write],
      },
    };
    static routeOptions = {
      summary,
      description: 'Create an action for a specific alert episode.',
      oasOperationObject,
    } as const;
    static schemas = {
      request: {
        params: episodeAlertActionParamsSchema,
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
          description: notFoundDescription ?? 'Indicates the alert episode was not found.',
        },
      },
    };

    protected readonly routeName = `create episode ${pathSuffix} action`;

    constructor(
      @inject(AlertingRouteContext) ctx: AlertingRouteContext,
      @inject(Request)
      private readonly request: KibanaRequest<EpisodeAlertActionParams, unknown, ActionBody>,
      @inject(AlertActionsClient) private readonly alertActionsClient: AlertActionsClient
    ) {
      super(ctx);
    }

    protected async execute() {
      await this.alertActionsClient.createEpisodeAction({
        episodeId: this.request.params.episode_id,
        action: {
          action_type: actionType,
          ...this.request.body,
        } as Extract<CreateEpisodeAlertActionBody, { action_type: TAction }>,
      });

      return this.ctx.response.noContent();
    }
  }

  return CreateTypedEpisodeActionRoute as RouteDefinition<
    EpisodeAlertActionParams,
    unknown,
    ActionBody,
    'post'
  >;
};
