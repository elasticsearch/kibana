/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  errorResponseSchema,
  matchActionPoliciesForRuleBodySchema,
  matchActionPoliciesForRuleResponseSchema,
  type MatchActionPoliciesForRuleBody,
} from '@kbn/alerting-v2-schemas';
import { Request } from '@kbn/core-di-server';
import type { KibanaRequest, RouteSecurity } from '@kbn/core-http-server';
import { inject, injectable } from 'inversify';
import { ActionPolicyClient } from '../../lib/action_policy_client';
import { ALERTING_V2_API_PRIVILEGES } from '../../lib/security/privileges';
import { BaseAlertingRoute } from '../base_alerting_route';
import { matchActionPoliciesForRuleOasExamples } from './match_action_policies_for_rule_oas_example';
import { AlertingRouteContext } from '../alerting_route_context';
import { ALERTING_V2_ACTION_POLICY_API_PATH } from '../constants';
import { INVALID_SCHEMA_OR_PARAMETERS_DESCRIPTION } from '../route_descriptions';

@injectable()
export class MatchActionPoliciesForRuleRoute extends BaseAlertingRoute {
  static method = 'post' as const;
  static path = `${ALERTING_V2_ACTION_POLICY_API_PATH}/_match_for_rule`;
  static security: RouteSecurity = {
    authz: {
      requiredPrivileges: [ALERTING_V2_API_PRIVILEGES.actionPolicies.read],
    },
  };
  static routeOptions = {
    summary: 'Match action policies for a rule',
    description:
      "Returns the action policies that apply to a rule, based on the rule's tags. Each result includes a `category` with the reason it matched. This endpoint does not evaluate `matcher.expression`, because those queries need alert data that is only available once an alert exists. As a result, policies that match only by an expression are not returned, and a returned policy might not match every alert from the rule.",
    oasOperationObject: matchActionPoliciesForRuleOasExamples,
  } as const;
  static schemas = {
    request: {
      body: matchActionPoliciesForRuleBodySchema,
    },
    response: {
      200: {
        body: () => matchActionPoliciesForRuleResponseSchema,
        description: 'Indicates a successful call.',
      },
      400: {
        body: () => errorResponseSchema,
        description: INVALID_SCHEMA_OR_PARAMETERS_DESCRIPTION,
      },
    },
  };

  protected readonly routeName = 'match action policies for rule';

  constructor(
    @inject(AlertingRouteContext) ctx: AlertingRouteContext,
    @inject(Request)
    private readonly request: KibanaRequest<unknown, unknown, MatchActionPoliciesForRuleBody>,
    @inject(ActionPolicyClient)
    private readonly actionPolicyClient: ActionPolicyClient
  ) {
    super(ctx);
  }

  protected async execute() {
    const { rule } = this.request.body ?? {};
    const result = await this.actionPolicyClient.matchActionPoliciesForRule({
      ruleTags: rule?.tags,
    });
    return this.ctx.response.ok({ body: result });
  }
}
