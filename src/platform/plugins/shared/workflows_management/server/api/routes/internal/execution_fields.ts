/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import { IndexPatternsFetcher } from '@kbn/data-views-plugin/server';
import { WORKFLOWS_EXECUTIONS_INDEX } from '../../../../common';
import { buildUnmanagedWorkflowExecutionsFilter } from '../../lib/build_workflow_executions_search_query';
import type { RouteDependencies } from '../types';
import { INTERNAL_API_VERSION, MAX_EXECUTION_FIELD_NAME_LENGTH } from '../utils/route_constants';
import { handleRouteError } from '../utils/route_error_handlers';
import {
  canReadManagedWorkflowExecutions,
  hasWorkflowExecutionReadPrivilege,
  WORKFLOW_EXECUTION_READ_WITH_MANAGED_SECURITY,
} from '../utils/route_security';
import { withAvailabilityCheck } from '../utils/with_availability_check';

const fieldNameSchema = schema.string({ maxLength: MAX_EXECUTION_FIELD_NAME_LENGTH });

const parseFields = (value: string | string[] | undefined): string[] => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
};

export function registerExecutionFieldsRoute({ router }: RouteDependencies) {
  router.versioned
    .get({
      path: '/internal/workflows/executions/fields',
      access: 'internal',
      security: WORKFLOW_EXECUTION_READ_WITH_MANAGED_SECURITY,
    })
    .addVersion(
      {
        version: INTERNAL_API_VERSION,
        validate: {
          request: {
            query: schema.object(
              {
                meta_fields: schema.oneOf(
                  [fieldNameSchema, schema.arrayOf(fieldNameSchema, { maxSize: 100 })],
                  {
                    defaultValue: [],
                  }
                ),
                allow_no_index: schema.maybe(schema.boolean()),
                include_unmapped: schema.maybe(schema.boolean()),
                fields: schema.maybe(
                  schema.oneOf([
                    fieldNameSchema,
                    schema.arrayOf(fieldNameSchema, { maxSize: 50_000 }),
                  ])
                ),
                field_types: schema.maybe(
                  schema.oneOf(
                    [fieldNameSchema, schema.arrayOf(fieldNameSchema, { maxSize: 60 })],
                    {
                      defaultValue: [],
                    }
                  )
                ),
                allow_hidden: schema.maybe(schema.boolean()),
              },
              { unknowns: 'allow' }
            ),
          },
        },
      },
      withAvailabilityCheck(async (context, request, response) => {
        try {
          if (!hasWorkflowExecutionReadPrivilege(request)) {
            return response.forbidden();
          }
          const core = await context.core;
          const esClient = core.elasticsearch.client.asInternalUser;
          const indexPatternsFetcher = new IndexPatternsFetcher(esClient, {
            uiSettingsClient: core.uiSettings.client,
            rollupsEnabled: false,
          });

          const { fields, indices } = await indexPatternsFetcher.getFieldsForWildcard({
            pattern: WORKFLOWS_EXECUTIONS_INDEX,
            metaFields: parseFields(request.query.meta_fields),
            fieldCapsOptions: {
              allow_no_indices: request.query.allow_no_index || false,
              includeUnmapped: request.query.include_unmapped,
            },
            ...(canReadManagedWorkflowExecutions(request)
              ? {}
              : { indexFilter: buildUnmanagedWorkflowExecutionsFilter() }),
            fieldTypes: parseFields(request.query.field_types),
            allowHidden: request.query.allow_hidden,
            ...(parseFields(request.query.fields).length > 0
              ? { fields: parseFields(request.query.fields) }
              : {}),
          });

          return response.ok({
            body: {
              fields,
              indices,
            },
          });
        } catch (error) {
          return handleRouteError(response, error);
        }
      })
    );
}
