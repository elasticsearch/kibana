/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import type { ILicenseState } from '../lib';
import type { GetActionErrorLogByIdParams } from '../rules_client';
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
  schema.object({ '@timestamp': schema.object({ order: sortOrderSchema }) }),
  schema.object({ 'event.duration': schema.object({ order: sortOrderSchema }) }),
]);

const sortFieldsSchema = schema.arrayOf(sortFieldSchema, {
  defaultValue: [{ '@timestamp': { order: 'desc' } }],
  maxSize: MAX_SORT_FIELDS,
});

const querySchema = schema.object({
  date_start: schema.string({ maxLength: ISO_DATE_MAX_LENGTH }),
  date_end: schema.maybe(schema.string({ maxLength: ISO_DATE_MAX_LENGTH })),
  filter: schema.maybe(schema.string({ maxLength: MAX_EXECUTION_FILTER_LENGTH })),
  per_page: schema.number({ defaultValue: 10, min: 1, max: MAX_PER_PAGE_LOGS }),
  page: schema.number({ defaultValue: 1, min: 1 }),
  sort: sortFieldsSchema,
  namespace: schema.maybe(schema.string({ maxLength: MAX_ID_LENGTH })),
  with_auth: schema.maybe(schema.boolean()),
});

const rewriteReq: RewriteRequestCase<GetActionErrorLogByIdParams> = ({
  date_start: dateStart,
  date_end: dateEnd,
  per_page: perPage,
  namespace,
  ...rest
}) => ({
  ...rest,
  namespace,
  dateStart,
  dateEnd,
  perPage,
});

export const getActionErrorLogRoute = (
  router: IRouter<AlertingRequestHandlerContext>,
  licenseState: ILicenseState
) => {
  router.get(
    {
      path: `${INTERNAL_BASE_ALERTING_API_PATH}/rule/{id}/_action_error_log`,
      security: DEFAULT_ALERTING_ROUTE_SECURITY,
      validate: {
        params: paramSchema,
        query: querySchema,
      },
      options: {
        access: 'internal',
      },
    },
    router.handleLegacyErrors(
      verifyAccessAndContext(licenseState, async function (context, req, res) {
        const alertingContext = await context.alerting;
        const rulesClient = await alertingContext.getRulesClient();
        const { id } = req.params;
        const withAuth = req.query.with_auth;
        const rewrittenReq = rewriteReq({ id, ...req.query });
        const getter = (
          withAuth ? rulesClient.getActionErrorLogWithAuth : rulesClient.getActionErrorLog
        ).bind(rulesClient);
        return res.ok({
          body: await getter(rewrittenReq),
        });
      })
    )
  );
};
