/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, RouteSecurity } from '@kbn/core/server';
import { Request } from '@kbn/core-di-server';
import type { z } from '@kbn/zod/v4';
import { injectable, inject } from 'inversify';
import {
  errorResponseSchema,
  listPolicyExecutionHistoryQuerySchema,
  listPolicyExecutionHistoryResponseSchema,
} from '@kbn/alerting-v2-schemas';
import { ActionPolicyExecutionHistoryClient } from '../../lib/action_policy_execution_history_client';
import { ALERTING_V2_API_PRIVILEGES } from '../../lib/security/privileges';
import { BaseAlertingRoute } from '../base_alerting_route';
import { AlertingRouteContext } from '../alerting_route_context';
import { ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_API_PATH } from '../constants';

@injectable()
export class ListExecutionHistoryRoute extends BaseAlertingRoute {
  static method = 'get' as const;
  static path = ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_API_PATH;
  static security: RouteSecurity = {
    authz: {
      requiredPrivileges: [ALERTING_V2_API_PRIVILEGES.executionHistory.read],
    },
  };
  static routeOptions = {
    summary: 'List action policy execution history',
    description:
      'Get a paginated list of dispatcher summary events for action policies in the current space.',
  } as const;
  static schemas = {
    request: {
      query: listPolicyExecutionHistoryQuerySchema,
    },
    response: {
      200: {
        body: () => listPolicyExecutionHistoryResponseSchema,
        description: 'Returns a paginated list of execution history events.',
      },
      400: {
        body: () => errorResponseSchema,
        description: 'Indicates invalid query parameters.',
      },
    },
  };

  protected readonly routeName = 'list action policy execution history';

  constructor(
    @inject(AlertingRouteContext) ctx: AlertingRouteContext,
    @inject(Request)
    private readonly request: KibanaRequest<
      unknown,
      z.infer<typeof listPolicyExecutionHistoryQuerySchema>,
      unknown
    >,
    @inject(ActionPolicyExecutionHistoryClient)
    private readonly executionHistoryClient: ActionPolicyExecutionHistoryClient
  ) {
    super(ctx);
  }

  protected async execute() {
    const { page, perPage, search, outcome } = this.request.query ?? {};

    const result = await this.executionHistoryClient.listExecutionHistory({
      request: this.request,
      page,
      perPage,
      search,
      outcome,
    });

    return this.ctx.response.ok({ body: result });
  }
}
