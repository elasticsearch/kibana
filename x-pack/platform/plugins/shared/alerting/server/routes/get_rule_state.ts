/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import type { ILicenseState } from '../lib';
import type { RewriteResponseCase } from './lib';
import { verifyAccessAndContext } from './lib';
import type { AlertingRequestHandlerContext, RuleTaskState } from '../types';
import { INTERNAL_BASE_ALERTING_API_PATH } from '../types';
import { DEFAULT_ALERTING_ROUTE_SECURITY } from './constants';
import { MAX_ID_LENGTH } from '../../common/constants';

const paramSchema = schema.object({
  id: schema.string({ maxLength: MAX_ID_LENGTH }),
});

const rewriteBodyRes: RewriteResponseCase<RuleTaskState> = ({
  alertTypeState,
  alertInstances,
  previousStartedAt,
  ...rest
}) => ({
  ...rest,
  rule_type_state: alertTypeState,
  alerts: alertInstances,
  previous_started_at: previousStartedAt,
});

export const getRuleStateRoute = (
  router: IRouter<AlertingRequestHandlerContext>,
  licenseState: ILicenseState
) => {
  router.get(
    {
      path: `${INTERNAL_BASE_ALERTING_API_PATH}/rule/{id}/state`,
      security: DEFAULT_ALERTING_ROUTE_SECURITY,
      options: {
        access: 'internal',
      },
      validate: {
        params: paramSchema,
      },
    },
    router.handleLegacyErrors(
      verifyAccessAndContext(licenseState, async function (context, req, res) {
        const alertingContext = await context.alerting;
        const rulesClient = await alertingContext.getRulesClient();
        const { id } = req.params;
        const state = await rulesClient.getAlertState({ id });
        return state ? res.ok({ body: rewriteBodyRes(state) }) : res.noContent();
      })
    )
  );
};
