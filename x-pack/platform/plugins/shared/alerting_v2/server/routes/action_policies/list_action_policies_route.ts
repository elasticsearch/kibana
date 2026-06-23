/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errorResponseSchema, findActionPoliciesResponseSchema } from '@kbn/alerting-v2-schemas';
import { Request } from '@kbn/core-di-server';
import type { KibanaRequest, RouteSecurity } from '@kbn/core-http-server';
import { z } from '@kbn/zod/v4';
import { inject, injectable } from 'inversify';
import { ActionPolicyClient } from '../../lib/action_policy_client';
import { ALERTING_V2_API_PRIVILEGES } from '../../lib/security/privileges';
import { BaseAlertingRoute } from '../base_alerting_route';
import { AlertingRouteContext } from '../alerting_route_context';
import { ALERTING_V2_ACTION_POLICY_API_PATH } from '../constants';

const sortFieldSchema = z
  .enum(['name', 'createdAt', 'updatedAt'])
  .describe('The available fields to sort action policies by.');

const tagFilterItemSchema = z.string().min(1).max(128);

const listActionPoliciesQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().describe('The page number to return. Defaults to 1.'),
  perPage: z.coerce
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe('The number of action policies to return per page. Defaults to 20.'),
  search: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe('A text string to search across action policy fields.'),
  tags: z
    .union([tagFilterItemSchema, z.array(tagFilterItemSchema)])
    .transform((v) => (Array.isArray(v) ? v : [v]).map((t) => t.trim()).filter(Boolean))
    .pipe(z.array(tagFilterItemSchema).max(10))
    .optional()
    .describe('Filter by tags. Accepts a single string or an array.'),
  enabled: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional()
    .describe('Filter by enabled status. Accepts the strings true or false.'),
  sortField: sortFieldSchema.optional().describe('The field to sort action policies by.'),
  sortOrder: z.enum(['asc', 'desc']).optional().describe('The sort direction.'),
});

@injectable()
export class ListActionPoliciesRoute extends BaseAlertingRoute {
  static method = 'get' as const;
  static path = `${ALERTING_V2_ACTION_POLICY_API_PATH}`;
  static security: RouteSecurity = {
    authz: {
      requiredPrivileges: [ALERTING_V2_API_PRIVILEGES.actionPolicies.read],
    },
  };
  static routeOptions = {
    summary: 'List action policies',
    description: 'Get a paginated list of action policies with optional filtering and sorting.',
  } as const;
  static schemas = {
    request: {
      query: listActionPoliciesQuerySchema,
    },
    response: {
      200: {
        body: () => findActionPoliciesResponseSchema,
        description: 'Returns a paginated list of action policies.',
      },
      400: {
        body: () => errorResponseSchema,
        description: 'Indicates invalid query parameters.',
      },
    },
  };

  protected readonly routeName = 'list action policies';

  constructor(
    @inject(AlertingRouteContext) ctx: AlertingRouteContext,
    @inject(Request)
    private readonly request: KibanaRequest<
      unknown,
      z.infer<typeof listActionPoliciesQuerySchema>,
      unknown
    >,
    @inject(ActionPolicyClient)
    private readonly actionPolicyClient: ActionPolicyClient
  ) {
    super(ctx);
  }

  protected async execute() {
    const { page, perPage, search, tags, enabled, sortField, sortOrder } = this.request.query ?? {};
    const result = await this.actionPolicyClient.findActionPolicies({
      page,
      perPage,
      search,
      tags,
      enabled,
      sortField,
      sortOrder,
    });
    return this.ctx.response.ok({ body: result });
  }
}
