/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import type {
  FindMutedAlertInstancesRequestBodyV1,
  FindMutedAlertInstancesResponseV1,
} from '../../../../../common/routes/rule/apis/find_muted_alert_instances';
import { findMutedAlertInstancesRequestBodySchemaV1 } from '../../../../../common/routes/rule/apis/find_muted_alert_instances';
import type { ILicenseState } from '../../../../lib';
import type { AlertingRequestHandlerContext } from '../../../../types';
import { INTERNAL_ALERTING_API_FIND_MUTED_ALERT_INSTANCES_PATH } from '../../../../types';
import { verifyAccessAndContext } from '../../../lib';
import {
  transformFindMutedAlertInstancesBodyV1,
  transformFindMutedAlertInstancesResponseV1,
} from './transforms';
import { DEFAULT_ALERTING_ROUTE_SECURITY } from '../../../constants';

export const findMutedAlertInstancesRoute = (
  router: IRouter<AlertingRequestHandlerContext>,
  licenseState: ILicenseState
) => {
  router.post(
    {
      path: INTERNAL_ALERTING_API_FIND_MUTED_ALERT_INSTANCES_PATH,
      security: DEFAULT_ALERTING_ROUTE_SECURITY,
      options: { access: 'internal' },
      validate: {
        body: findMutedAlertInstancesRequestBodySchemaV1,
      },
    },
    router.handleLegacyErrors(
      verifyAccessAndContext(licenseState, async function (context, req, res) {
        const rulesClient = await (await context.alerting).getRulesClient();

        const body: FindMutedAlertInstancesRequestBodyV1 = req.body;

        const options = transformFindMutedAlertInstancesBodyV1(body);

        const findResult = await rulesClient.findMutedAlerts({
          options,
        });

        const responseBody: FindMutedAlertInstancesResponseV1 =
          transformFindMutedAlertInstancesResponseV1(findResult);

        return res.ok({
          body: responseBody,
        });
      })
    )
  );
};
