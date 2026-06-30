/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import type { UnsnoozeAlertRequestParamsV1 } from '../../../../../common/routes/rule/apis/unsnooze_alert';
import { unsnoozeAlertParamsSchemaV1 } from '../../../../../common/routes/rule/apis/unsnooze_alert';
import type { ILicenseState } from '../../../../lib';
import { RuleTypeDisabledError } from '../../../../lib/errors/rule_type_disabled';
import type { AlertingRequestHandlerContext } from '../../../../types';
import { BASE_ALERTING_API_PATH } from '../../../../types';
import { verifyAccessAndContext } from '../../../lib';
import { DEFAULT_ALERTING_ROUTE_SECURITY } from '../../../constants';
import { transformRequestParamsToApplicationV1 } from './transforms';

export const unsnoozeAlertRoute = (
  router: IRouter<AlertingRequestHandlerContext>,
  licenseState: ILicenseState
) => {
  router.post(
    {
      path: `${BASE_ALERTING_API_PATH}/rule/{rule_id}/alert/{alert_id}/_unsnooze`,
      security: DEFAULT_ALERTING_ROUTE_SECURITY,
      options: {
        access: 'public',
        summary: `Unsnooze an alert`,
        tags: ['oas-tag:alerting'],
        availability: {
          since: '9.5.0',
          stability: 'stable',
        },
      },
      validate: {
        request: {
          params: unsnoozeAlertParamsSchemaV1,
        },
        response: {
          204: {
            description: 'Indicates a successful call.',
          },
          400: {
            description: 'Indicates an invalid schema or parameters.',
          },
          403: {
            description: 'Indicates that this call is forbidden.',
          },
          404: {
            description: `Indicates the specified rule or alert doesn't exist.`,
          },
        },
      },
    },
    router.handleLegacyErrors(
      verifyAccessAndContext(licenseState, async function (context, req, res) {
        const rulesClient = await (await context.alerting).getRulesClient();
        const params: UnsnoozeAlertRequestParamsV1 = req.params;

        try {
          await rulesClient.unsnoozeAlertInstance(transformRequestParamsToApplicationV1(params));
          return res.noContent();
        } catch (e) {
          if (e instanceof RuleTypeDisabledError) {
            return e.sendResponse(res);
          }
          throw e;
        }
      })
    )
  );
};
