/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { IRouter } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import type { GetGlobalExecutionKPIParams, RewriteRequestCase } from '../../common';
import {
  INTERNAL_BASE_ACTION_API_PATH,
  ISO_DATE_MAX_LENGTH,
  MAX_EXECUTION_FILTER_LENGTH,
} from '../../common';
import { verifyAccessAndContext } from './verify_access_and_context';
import type { ActionsRequestHandlerContext } from '../types';
import type { ILicenseState } from '../lib';
import { rewriteNamespaces } from './rewrite_namespaces';
import { DEFAULT_ACTION_ROUTE_SECURITY } from './constants';

const bodySchema = schema.object({
  date_start: schema.string({ maxLength: ISO_DATE_MAX_LENGTH }),
  date_end: schema.maybe(schema.string({ maxLength: ISO_DATE_MAX_LENGTH })),
  filter: schema.maybe(schema.string({ maxLength: MAX_EXECUTION_FILTER_LENGTH })),
  namespaces: schema.maybe(schema.arrayOf(schema.string({ maxLength: 1000 }), { maxSize: 1000 })),
});

const rewriteReq: RewriteRequestCase<GetGlobalExecutionKPIParams> = ({
  date_start: dateStart,
  date_end: dateEnd,
  namespaces,
  ...rest
}) => ({
  ...rest,
  namespaces: rewriteNamespaces(namespaces),
  dateStart,
  dateEnd,
});

export const getGlobalExecutionKPIRoute = (
  router: IRouter<ActionsRequestHandlerContext>,
  licenseState: ILicenseState
) => {
  router.post(
    {
      path: `${INTERNAL_BASE_ACTION_API_PATH}/_global_connector_execution_kpi`,
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
          body: await actionsClient.getGlobalExecutionKpiWithAuth(rewriteReq(req.body)),
        });
      })
    )
  );
};
