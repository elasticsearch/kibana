/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import type { ILicenseState } from '../lib';
import type { GetExecutionLogByIdParams } from '../rules_client';
import type { RewriteRequestCase } from './lib';
import { verifyAccessAndContext } from './lib';
import type { AlertingRequestHandlerContext } from '../types';
import { INTERNAL_BASE_ALERTING_API_PATH } from '../types';
import { DEFAULT_ALERTING_ROUTE_SECURITY } from './constants';
import {
  MAX_PER_PAGE_LOGS,
  MAX_EXECUTION_FILTER_LENGTH,
  MAX_ID_LENGTH,
  MAX_SORT_FIELDS,
  ISO_DATE_MAX_LENGTH,
} from '../../common/constants';

const paramSchema = schema.object({
  id: schema.string({ maxLength: MAX_ID_LENGTH }),
});

const sortOrderSchema = schema.oneOf([schema.literal('asc'), schema.literal('desc')]);

const sortFieldSchema = schema.oneOf([
  schema.object({ timestamp: schema.object({ order: sortOrderSchema }) }),
  schema.object({ execution_duration: schema.object({ order: sortOrderSchema }) }),
  schema.object({ total_search_duration: schema.object({ order: sortOrderSchema }) }),
  schema.object({ es_search_duration: schema.object({ order: sortOrderSchema }) }),
  schema.object({ schedule_delay: schema.object({ order: sortOrderSchema }) }),
  schema.object({ num_triggered_actions: schema.object({ order: sortOrderSchema }) }),
  schema.object({ num_generated_actions: schema.object({ order: sortOrderSchema }) }),
  schema.object({ num_active_alerts: schema.object({ order: sortOrderSchema }) }),
  schema.object({ num_recovered_alerts: schema.object({ order: sortOrderSchema }) }),
  schema.object({ num_new_alerts: schema.object({ order: sortOrderSchema }) }),
]);

const sortFieldsSchema = schema.arrayOf(sortFieldSchema, {
  defaultValue: [{ timestamp: { order: 'desc' } }],
  maxSize: MAX_SORT_FIELDS,
});

const querySchema = schema.object({
  date_start: schema.string({ maxLength: ISO_DATE_MAX_LENGTH }),
  date_end: schema.maybe(schema.string({ maxLength: ISO_DATE_MAX_LENGTH })),
  filter: schema.maybe(schema.string({ maxLength: MAX_EXECUTION_FILTER_LENGTH })),
  per_page: schema.number({ defaultValue: 10, min: 1, max: MAX_PER_PAGE_LOGS }),
  page: schema.number({ defaultValue: 1, min: 1 }),
  sort: sortFieldsSchema,
});

const rewriteReq: RewriteRequestCase<GetExecutionLogByIdParams> = ({
  date_start: dateStart,
  date_end: dateEnd,
  per_page: perPage,
  ...rest
}) => ({
  ...rest,
  dateStart,
  dateEnd,
  perPage,
});

export const getRuleExecutionLogRoute = (
  router: IRouter<AlertingRequestHandlerContext>,
  licenseState: ILicenseState
) => {
  router.get(
    {
      path: `${INTERNAL_BASE_ALERTING_API_PATH}/rule/{id}/_execution_log`,
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
        return res.ok({
          body: await rulesClient.getExecutionLogForRule(rewriteReq({ id, ...req.query })),
        });
      })
    )
  );
};
