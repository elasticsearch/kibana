/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import type { ILicenseState } from '../lib';
import type { ActionsRequestHandlerContext } from '../types';
import type { GetGlobalExecutionLogParams, RewriteRequestCase } from '../../common';
import {
  INTERNAL_BASE_ACTION_API_PATH,
  ISO_DATE_MAX_LENGTH,
  MAX_EXECUTION_FILTER_LENGTH,
} from '../../common';
import { verifyAccessAndContext } from './verify_access_and_context';
import { rewriteNamespaces } from './rewrite_namespaces';
import { DEFAULT_ACTION_ROUTE_SECURITY } from './constants';

const sortOrderSchema = schema.oneOf([schema.literal('asc'), schema.literal('desc')]);

const sortFieldSchema = schema.oneOf([
  schema.object({ timestamp: schema.object({ order: sortOrderSchema }) }),
  schema.object({ execution_duration: schema.object({ order: sortOrderSchema }) }),
  schema.object({ schedule_delay: schema.object({ order: sortOrderSchema }) }),
]);

const sortFieldsSchema = schema.arrayOf(sortFieldSchema, {
  defaultValue: [{ timestamp: { order: 'desc' } }],
  maxSize: 10,
});

const bodySchema = schema.object({
  date_start: schema.string({ maxLength: ISO_DATE_MAX_LENGTH }),
  date_end: schema.maybe(schema.string({ maxLength: ISO_DATE_MAX_LENGTH })),
  filter: schema.maybe(schema.string({ maxLength: MAX_EXECUTION_FILTER_LENGTH })),
  per_page: schema.number({ defaultValue: 10, min: 1, max: 100 }),
  page: schema.number({ defaultValue: 1, min: 1, max: 1000 }),
  sort: sortFieldsSchema,
  namespaces: schema.maybe(schema.arrayOf(schema.string({ maxLength: 1000 }), { maxSize: 1000 })),
});

const rewriteBodyReq: RewriteRequestCase<GetGlobalExecutionLogParams> = ({
  date_start: dateStart,
  date_end: dateEnd,
  per_page: perPage,
  namespaces,
  ...rest
}) => ({ ...rest, namespaces: rewriteNamespaces(namespaces), dateStart, dateEnd, perPage });

export const getGlobalExecutionLogRoute = (
  router: IRouter<ActionsRequestHandlerContext>,
  licenseState: ILicenseState
) => {
  router.post(
    {
      path: `${INTERNAL_BASE_ACTION_API_PATH}/_global_connector_execution_logs`,
      security: DEFAULT_ACTION_ROUTE_SECURITY,
      validate: {
        body: bodySchema,
      },
      options: {
        access: 'internal',
      },
    },
    router.handleLegacyErrors(
      verifyAccessAndContext(licenseState, async function (context, req, res) {
        const actionsClient = (await context.actions).getActionsClient();
        return res.ok({
          body: await actionsClient.getGlobalExecutionLogWithAuth(rewriteBodyReq(req.body)),
        });
      })
    )
  );
};
