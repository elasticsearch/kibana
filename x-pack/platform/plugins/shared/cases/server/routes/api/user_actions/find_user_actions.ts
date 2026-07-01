/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { castArray } from 'lodash';
import { schema } from '@kbn/config-schema';
import type { userActionApiV1 } from '../../../../common/types/api';
import { UserActionFindRequestRt } from '../../../../common/types/api';

import { CASE_FIND_USER_ACTIONS_URL } from '../../../../common/constants';
import { createCaseError } from '../../../common/error';
import { decodeWithExcessOrThrow } from '../../../common/runtime_types';
import { createCasesRoute } from '../create_cases_route';
import { DEFAULT_CASES_ROUTE_SECURITY } from '../constants';

export const findUserActionsRoute = createCasesRoute({
  method: 'get',
  path: CASE_FIND_USER_ACTIONS_URL,
  security: DEFAULT_CASES_ROUTE_SECURITY,
  params: {
    params: schema.object({
      case_id: schema.string(),
    }),
  },
  routerOptions: {
    access: 'public',
    summary: `Find case activity`,
    tags: ['oas-tag:cases'],
    description: 'Returns a paginated list of user activity for a case.',
    // You must have `read` privileges for the **Cases** feature in the
    // **Management**, **Observability**, or **Security** section of the Kibana
    // feature privileges, depending on the owner of the case you're seeking.
  },
  handler: async ({ context, request, response }) => {
    try {
      const caseContext = await context.cases;
      const casesClient = await caseContext.getCasesClient();
      const caseId = request.params.case_id;
      const query = request.query as Record<string, unknown>;
      const { types, ...restQuery } = query;
      const options = decodeWithExcessOrThrow(UserActionFindRequestRt)({
        ...restQuery,
        ...(types != null ? { types: castArray(types) } : {}),
      });

      const res: userActionApiV1.UserActionFindResponse = await casesClient.userActions.find({
        caseId,
        params: options,
      });

      return response.ok({
        body: res,
      });
    } catch (error) {
      throw createCaseError({
        message: `Failed to find user actions in route for case id: ${request.params.case_id}: ${error}`,
        error,
      });
    }
  },
});
