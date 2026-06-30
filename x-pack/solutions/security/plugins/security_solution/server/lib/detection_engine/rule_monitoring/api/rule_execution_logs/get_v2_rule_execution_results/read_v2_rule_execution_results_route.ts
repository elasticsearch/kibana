/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import { schema } from '@kbn/config-schema';
import type { IKibanaResponse } from '@kbn/core/server';
import { transformError } from '@kbn/securitysolution-es-utils';
import { RULES_API_READ } from '@kbn/security-solution-features/constants';
import type { SecuritySolutionPluginRouter } from '../../../../../../types';
import { buildSiemResponse } from '../../../../routes/utils';

import type { ReadRuleExecutionResultsResponse } from '../../../../../../../common/api/detection_engine/rule_monitoring';
import { READ_V2_RULE_EXECUTION_RESULTS_URL } from '../../../../../../../common/api/detection_engine/rule_monitoring';

export const readV2RuleExecutionResultsRoute = (router: SecuritySolutionPluginRouter) => {
  router.versioned
    .post({
      access: 'internal',
      path: READ_V2_RULE_EXECUTION_RESULTS_URL,
      security: {
        authz: {
          requiredPrivileges: [RULES_API_READ],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({
              ruleId: schema.string(),
            }),
            body: schema.object({
              filter: schema.maybe(
                schema.object({
                  from: schema.maybe(schema.string()),
                  to: schema.maybe(schema.string()),
                  outcome: schema.maybe(schema.arrayOf(schema.string())),
                })
              ),
              sort: schema.maybe(
                schema.object({
                  field: schema.maybe(
                    schema.oneOf([
                      schema.literal('execution_start'),
                      schema.literal('execution_duration_ms'),
                    ])
                  ),
                  order: schema.maybe(
                    schema.oneOf([schema.literal('asc'), schema.literal('desc')])
                  ),
                })
              ),
              page: schema.maybe(schema.number()),
              per_page: schema.maybe(schema.number()),
            }),
          },
        },
      },
      async (
        context,
        request,
        response
      ): Promise<IKibanaResponse<ReadRuleExecutionResultsResponse>> => {
        const { ruleId } = request.params;
        const { filter, sort, page, per_page: perPage } = request.body;

        const siemResponse = buildSiemResponse(response);

        try {
          const ctx = await context.resolve(['securitySolution']);
          const v2Client = ctx.securitySolution.getRuleExecutionLogV2();

          const effectiveFilter = {
            from: filter?.from ?? moment().subtract(2, 'hours').toISOString(),
            to: filter?.to ?? moment().toISOString(),
            outcome: filter?.outcome ?? [],
          };

          const executionResultsResponse = await v2Client.getV2ExecutionResults({
            ruleId,
            filter: effectiveFilter,
            sort: sort ? { field: sort.field, order: sort.order } : undefined,
            page,
            perPage,
          });

          return response.ok({ body: executionResultsResponse });
        } catch (err) {
          const error = transformError(err);
          return siemResponse.error({
            body: error.message,
            statusCode: error.statusCode,
          });
        }
      }
    );
};
