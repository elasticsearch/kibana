/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import type { ILicenseState } from '../lib';
import type { GetAlertSummaryParams } from '../rules_client';
import type { RewriteRequestCase, RewriteResponseCase } from './lib';
import { verifyAccessAndContext } from './lib';
import type { AlertingRequestHandlerContext, AlertSummary } from '../types';
import { INTERNAL_BASE_ALERTING_API_PATH } from '../types';
import { DEFAULT_ALERTING_ROUTE_SECURITY } from './constants';
import {
  MAX_ID_LENGTH,
  MAX_NUMBER_OF_EXECUTIONS,
  ISO_DATE_MAX_LENGTH,
} from '../../common/constants';

const paramSchema = schema.object({
  id: schema.string({ maxLength: MAX_ID_LENGTH }),
});

const querySchema = schema.object({
  date_start: schema.maybe(schema.string({ maxLength: ISO_DATE_MAX_LENGTH })),
  number_of_executions: schema.maybe(schema.number({ min: 1, max: MAX_NUMBER_OF_EXECUTIONS })),
});

const rewriteReq: RewriteRequestCase<GetAlertSummaryParams> = ({
  date_start: dateStart,
  number_of_executions: numberOfExecutions,
  ...rest
}) => ({
  ...rest,
  numberOfExecutions,
  dateStart,
});

const rewriteBodyRes: RewriteResponseCase<AlertSummary> = ({
  ruleTypeId,
  muteAll,
  statusStartDate,
  statusEndDate,
  errorMessages,
  lastRun,
  executionDuration: { valuesWithTimestamp, ...executionDuration },
  ...rest
}) => ({
  ...rest,
  rule_type_id: ruleTypeId,
  mute_all: muteAll,
  status_start_date: statusStartDate,
  status_end_date: statusEndDate,
  error_messages: errorMessages,
  last_run: lastRun,
  execution_duration: {
    ...executionDuration,
    values_with_timestamp: valuesWithTimestamp,
  },
});

export const getRuleAlertSummaryRoute = (
  router: IRouter<AlertingRequestHandlerContext>,
  licenseState: ILicenseState
) => {
  router.get(
    {
      path: `${INTERNAL_BASE_ALERTING_API_PATH}/rule/{id}/_alert_summary`,
      security: DEFAULT_ALERTING_ROUTE_SECURITY,
      options: {
        access: 'internal',
      },
      validate: {
        params: paramSchema,
        query: querySchema,
      },
    },
    router.handleLegacyErrors(
      verifyAccessAndContext(licenseState, async function (context, req, res) {
        const alertingContext = await context.alerting;
        const rulesClient = await alertingContext.getRulesClient();
        const { id } = req.params;
        const summary = await rulesClient.getAlertSummary(rewriteReq({ id, ...req.query }));
        return res.ok({ body: rewriteBodyRes(summary) });
      })
    )
  );
};
