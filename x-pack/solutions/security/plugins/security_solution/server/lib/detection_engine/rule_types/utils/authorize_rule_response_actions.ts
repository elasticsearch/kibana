/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { isEqual } from 'lodash';
import type { KibanaRequest } from '@kbn/core/server';
import type { RuleTypeParamsAuthorizer } from '@kbn/alerting-plugin/server';
import { transformAlertToRuleResponseAction } from '../../../../../common/detection_engine/transform_actions';
import {
  READ_AUTH_PARAM_FIELDS,
  type DetectionRulesAuthz,
} from '../../../../../common/detection_engine/rule_management/authz';
import type { EndpointAppContextService } from '../../../../endpoint/endpoint_app_context_services';
import type { CheckOsqueryResponseActionAuthz } from '../../../../endpoint/services/actions/utils/rule_response_actions_validators';
import { validateRuleResponseActions } from '../../../../endpoint/services';
import type { RuleAlertType, RuleParams } from '../../rule_schema';

interface CreateSecurityRuleParamsAuthorizerDeps {
  endpointAppContextService: EndpointAppContextService;
  /**
   * Resolves the acting user's detection-rules authorization for a request.
   */
  getRulesAuthz: (request: KibanaRequest) => Promise<DetectionRulesAuthz>;
  /**
   * Returns a request-scoped osquery response action authorization checker.
   * Optional because osquery is not guaranteed to be available; when omitted,
   * osquery response actions are not authorized here (matching the behavior of
   * {@link validateRuleResponseActions} when no checker is provided).
   */
  getOsqueryResponseActionsAuthzChecker?: (
    request: KibanaRequest
  ) => CheckOsqueryResponseActionAuthz;
}

/**
 * Builds the alerting params authorizer for security rule types. Authorizes
 * response actions and read-auth-editable params (exception lists, etc.) on the
 * generic Alerting write paths, matching the checks the Detection Engine routes run.
 */
export const createSecurityRuleParamsAuthorizer = <TParams extends RuleParams>({
  endpointAppContextService,
  getRulesAuthz,
  getOsqueryResponseActionsAuthzChecker,
}: CreateSecurityRuleParamsAuthorizerDeps): RuleTypeParamsAuthorizer<TParams> => ({
  authorize: async (params, { request, previousParams }) => {
    await authorizeResponseActions({
      params,
      previousParams,
      request,
      endpointAppContextService,
      getOsqueryResponseActionsAuthzChecker,
    });

    await authorizeReadAuthParamFields({ params, previousParams, request, getRulesAuthz });
  },
});

/**
 * Enforces the response-actions privilege for `params.responseActions`.
 */
const authorizeResponseActions = async <TParams extends RuleParams>({
  params,
  previousParams,
  request,
  endpointAppContextService,
  getOsqueryResponseActionsAuthzChecker,
}: {
  params: TParams;
  previousParams: TParams | undefined;
  request: KibanaRequest;
  endpointAppContextService: EndpointAppContextService;
  getOsqueryResponseActionsAuthzChecker?: (
    request: KibanaRequest
  ) => CheckOsqueryResponseActionAuthz;
}): Promise<void> => {
  const responseActions = params.responseActions?.map(transformAlertToRuleResponseAction);

  try {
    await validateRuleResponseActions({
      endpointService: endpointAppContextService,
      endpointAuthz: await endpointAppContextService.getEndpointAuthz(request),
      spaceId: endpointAppContextService.getActiveSpaceId(request),
      rulePayload: { response_actions: responseActions },
      // `validateRuleResponseActions` only reads `existingRule.params.responseActions`,
      // so a minimal object is sufficient here.
      existingRule: previousParams
        ? ({ params: previousParams } as unknown as RuleAlertType)
        : null,
      checkOsqueryResponseActionAuthz: getOsqueryResponseActionsAuthzChecker?.(request),
    });
  } catch (err) {
    // Preserve the HTTP status code (403 for authz failures, 400 for invalid
    // payloads) as a Boom error so the generic Alerting APIs surface it
    // correctly. Route-driven paths already translate both error shapes.
    if (Boom.isBoom(err)) {
      throw err;
    }
    // Both the Endpoint and osquery validators throw `CustomHttpRequestError`,
    // but from different plugin-local classes, so duck-type on `statusCode`
    // rather than `instanceof` to preserve 403 (authz) vs 400 (invalid payload).
    const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 400;
    throw new Boom.Boom(err.message, { statusCode });
  }
};

/**
 * Authorizes changed read-auth-editable params (exception lists, investigation
 * fields, investigation guide) when modifying an existing rule. Create (no
 * previous params) is not gated, matching the Detection Engine routes.
 */
const authorizeReadAuthParamFields = async <TParams extends RuleParams>({
  params,
  previousParams,
  request,
  getRulesAuthz,
}: {
  params: TParams;
  previousParams: TParams | undefined;
  request: KibanaRequest;
  getRulesAuthz: (request: KibanaRequest) => Promise<DetectionRulesAuthz>;
}): Promise<void> => {
  // Create path (no previous params): not gated, matching the DE routes.
  if (!previousParams) {
    return;
  }

  const changedFields = READ_AUTH_PARAM_FIELDS.filter(({ param }) => {
    const nextValue = params[param];
    const previousValue = previousParams[param];
    // Any change to the field's value is privileged: adding, replacing, and
    // removing (unsetting, e.g. clearing an exception list or omitting a note on a
    // PUT) all require the privilege. Only genuinely unchanged fields are skipped.
    return !isEqual(nextValue, previousValue);
  });

  // Nothing privileged changed, so skip resolving capabilities entirely.
  if (changedFields.length === 0) {
    return;
  }

  const rulesAuthz = await getRulesAuthz(request);

  const forbiddenFields = changedFields
    .filter(({ capability }) => !rulesAuthz[capability])
    .map(({ field }) => field);

  if (forbiddenFields.length > 0) {
    throw new Boom.Boom(
      `The current user does not have the permissions to edit the following fields: ${forbiddenFields.join(
        ','
      )}`,
      { statusCode: 403 }
    );
  }
};
