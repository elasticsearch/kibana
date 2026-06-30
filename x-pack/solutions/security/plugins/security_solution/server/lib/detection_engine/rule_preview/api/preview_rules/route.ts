/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { transformError } from '@kbn/securitysolution-es-utils';
import type { Logger, StartServicesAccessor, IKibanaResponse } from '@kbn/core/server';
import type { IRuleDataClient } from '@kbn/rule-registry-plugin/server';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { asSpaceId } from '@kbn/core-spaces-common';
import { RULES_API_READ } from '@kbn/security-solution-features/constants';
import { DETECTION_ENGINE_RULES_PREVIEW } from '../../../../../../common/constants';
import { validateCreateRuleProps } from '../../../../../../common/api/detection_engine/rule_management';
import type { RulePreviewResponse } from '../../../../../../common/api/detection_engine';
import {
  RulePreviewRequestBody,
  RulePreviewRequestQuery,
} from '../../../../../../common/api/detection_engine';

import type { StartPlugins, SetupPlugins } from '../../../../../plugin';
import { buildSiemResponse } from '../../../routes/utils';
import { routeLimitedConcurrencyTag } from '../../../../../utils/route_limited_concurrency_tag';
import type { SecuritySolutionPluginRouter } from '../../../../../types';

import type { ConfigType } from '../../../../../config';
import type { CreateSecurityRuleTypeWrapperProps } from '../../../rule_types/types';
import { runRulePreview } from './run_rule_preview';

const MAX_ROUTE_CONCURRENCY = 10;

export const previewRulesRoute = (
  router: SecuritySolutionPluginRouter,
  config: ConfigType,
  ml: SetupPlugins['ml'],
  security: SetupPlugins['security'],
  securityRuleTypeOptions: CreateSecurityRuleTypeWrapperProps,
  previewRuleDataClient: IRuleDataClient,
  getStartServices: StartServicesAccessor<StartPlugins>,
  logger: Logger,
  isServerless: boolean
) => {
  router.versioned
    .post({
      path: DETECTION_ENGINE_RULES_PREVIEW,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [RULES_API_READ],
        },
      },
      options: {
        tags: [routeLimitedConcurrencyTag(MAX_ROUTE_CONCURRENCY)],
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            body: buildRouteValidationWithZod(RulePreviewRequestBody),
            query: buildRouteValidationWithZod(RulePreviewRequestQuery),
          },
        },
      },
      async (context, request, response): Promise<IKibanaResponse<RulePreviewResponse>> => {
        const siemResponse = buildSiemResponse(response);
        const validationErrors = validateCreateRuleProps(request.body);
        const coreContext = await context.core;
        if (validationErrors.length) {
          return siemResponse.error({ statusCode: 400, body: validationErrors });
        }
        try {
          const siemClient = (await context.securitySolution).getAppClient();
          const actionsClient = (await context.actions).getActionsClient();
          const license = (await context.licensing).license;

          const previewResponse = await runRulePreview(
            {
              config,
              ml,
              security,
              securityRuleTypeOptions,
              previewRuleDataClient,
              getStartServices,
              logger,
              isServerless,
            },
            {
              body: request.body,
              enableLoggedRequests: request.query.enable_logged_requests,
              request,
              spaceId: asSpaceId(siemClient.getSpaceId()),
              actionsClient,
              license,
              savedObjectsClient: coreContext.savedObjects.client,
              uiSettingsClient: coreContext.uiSettings.client,
            }
          );

          return response.ok({ body: previewResponse });
        } catch (err) {
          const error = transformError(err as Error);
          return siemResponse.error({
            body: {
              errors: [error.message],
            },
            statusCode: error.statusCode,
          });
        }
      }
    );
};
