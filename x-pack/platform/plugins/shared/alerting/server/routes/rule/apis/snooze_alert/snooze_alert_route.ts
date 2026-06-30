/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import {
  transformRequestBodyToApplicationV1,
  transformRequestParamsToApplicationV1,
  transformRequestQueryToApplicationV1,
} from './transforms';
import type { ILicenseState } from '../../../../lib';
import { RuleTypeDisabledError } from '../../../../lib';
import { verifyAccessAndContext } from '../../../lib';
import type { AlertingRequestHandlerContext } from '../../../../types';
import { BASE_ALERTING_API_PATH } from '../../../../types';
import type {
  SnoozeAlertRequestBodyV1,
  SnoozeAlertRequestQueryV1,
  SnoozeAlertRequestParamsV1,
} from '../../../../../common/routes/rule/apis/snooze_alert';
import {
  snoozeAlertBodySchemaV1,
  snoozeAlertParamsSchemaV1,
  snoozeAlertQuerySchemaV1,
} from '../../../../../common/routes/rule/apis/snooze_alert';
import { DEFAULT_ALERTING_ROUTE_SECURITY } from '../../../constants';

export const snoozeAlertRoute = (
  router: IRouter<AlertingRequestHandlerContext>,
  licenseState: ILicenseState
) => {
  router.post(
    {
      path: `${BASE_ALERTING_API_PATH}/rule/{rule_id}/alert/{alert_id}/_snooze`,
      security: DEFAULT_ALERTING_ROUTE_SECURITY,
      options: {
        access: 'public',
        summary: `Snooze an alert`,
        tags: ['oas-tag:alerting'],
        availability: {
          since: '9.5.0',
          stability: 'stable',
        },
      },
      validate: {
        request: {
          params: snoozeAlertParamsSchemaV1,
          query: snoozeAlertQuerySchemaV1,
          body: snoozeAlertBodySchemaV1,
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
        const alertingContext = await context.alerting;
        const rulesClient = await alertingContext.getRulesClient();
        const params: SnoozeAlertRequestParamsV1 = req.params;
        const query: SnoozeAlertRequestQueryV1 = req.query || {};
        const body: SnoozeAlertRequestBodyV1 = req.body;

        try {
          await rulesClient.snoozeAlertInstance({
            params: transformRequestParamsToApplicationV1(params),
            query: transformRequestQueryToApplicationV1(query),
            body: transformRequestBodyToApplicationV1(body),
          });
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
