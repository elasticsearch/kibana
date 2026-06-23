/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SearchResponse } from '@elastic/elasticsearch/lib/api/types';
import { schema } from '@kbn/config-schema';
import type {
  OptionsListRequestBody,
  OptionsListSuccessResponse,
} from '@kbn/controls-plugin/common/options_list/types';
import type { OptionsListSelection } from '@kbn/controls-schemas';
import { WORKFLOWS_EXECUTIONS_INDEX } from '../../../../common';
import { buildWorkflowExecutionsSpaceFilter } from '../../lib/build_workflow_executions_search_query';
import type { RouteDependencies } from '../types';
import { INTERNAL_API_VERSION, MAX_EXECUTION_FIELD_NAME_LENGTH } from '../utils/route_constants';
import { handleRouteError } from '../utils/route_error_handlers';
import { WORKFLOW_EXECUTION_READ_SECURITY } from '../utils/route_security';
import { withAvailabilityCheck } from '../utils/with_availability_check';

const getSearchFilter = (request: OptionsListRequestBody) => {
  const { searchString, searchTechnique, fieldName } = request;
  if (!searchString) {
    return undefined;
  }

  if (searchTechnique === 'exact') {
    return { term: { [fieldName]: searchString } };
  }

  if (searchTechnique === 'wildcard') {
    return { wildcard: { [fieldName]: `*${searchString}*` } };
  }

  return { prefix: { [fieldName]: searchString } };
};

interface OptionsListAggregations {
  validation?: { buckets?: Record<string, { doc_count: number }> };
  suggestions?: { buckets?: Array<{ key: OptionsListSelection; doc_count: number }> };
  totalCardinality?: { value?: number };
}

const getAggregations = (response: SearchResponse): OptionsListAggregations | undefined =>
  response.aggregations as unknown as OptionsListAggregations | undefined;

const parseInvalidSelections = (
  aggregations: OptionsListAggregations | undefined,
  selectedOptions: OptionsListSelection[] = []
): OptionsListSelection[] => {
  const buckets = aggregations?.validation?.buckets;

  if (!buckets || selectedOptions.length === 0) {
    return [];
  }

  return selectedOptions.filter((selection) => (buckets[String(selection)]?.doc_count ?? 0) === 0);
};

export function registerExecutionOptionsListRoute({ router, service, spaces }: RouteDependencies) {
  router.versioned
    .post({
      path: '/internal/workflows/executions/options_list',
      access: 'internal',
      security: WORKFLOW_EXECUTION_READ_SECURITY,
    })
    .addVersion(
      {
        version: INTERNAL_API_VERSION,
        validate: {
          request: {
            body: schema.object(
              {
                size: schema.number(),
                fieldName: schema.string({ maxLength: MAX_EXECUTION_FIELD_NAME_LENGTH }),
                sort: schema.maybe(schema.any()),
                filters: schema.maybe(schema.any()),
                fieldSpec: schema.maybe(schema.any()),
                ignoreValidations: schema.maybe(schema.boolean()),
                searchString: schema.maybe(schema.string({ maxLength: 1024 })),
                searchTechnique: schema.maybe(
                  schema.oneOf([
                    schema.literal('exact'),
                    schema.literal('prefix'),
                    schema.literal('wildcard'),
                  ])
                ),
                selectedOptions: schema.maybe(
                  schema.oneOf([
                    schema.arrayOf(schema.string({ maxLength: 1024 }), { maxSize: 10_000 }),
                    schema.arrayOf(schema.number(), { maxSize: 10_000 }),
                  ])
                ),
              },
              { unknowns: 'allow' }
            ),
          },
        },
      },
      withAvailabilityCheck(async (_context, request, response) => {
        try {
          const coreStart = await service.getCoreStart();
          const esClient = coreStart.elasticsearch.client.asInternalUser;
          const spaceId = spaces.getSpaceId(request);
          const optionsListRequest = request.body as OptionsListRequestBody;

          const searchFilter = getSearchFilter(optionsListRequest);
          const optionsListFilters = optionsListRequest.filters ?? [];
          const selectedOptions = optionsListRequest.selectedOptions;

          const esResponse = await esClient.search({
            index: WORKFLOWS_EXECUTIONS_INDEX,
            size: 0,
            query: {
              bool: {
                filter: [
                  ...optionsListFilters,
                  buildWorkflowExecutionsSpaceFilter(spaceId),
                  { bool: { must_not: { exists: { field: 'stepId' } } } },
                  ...(searchFilter ? [searchFilter] : []),
                ],
              },
            },
            aggs: {
              suggestions: {
                terms: {
                  field: optionsListRequest.fieldName,
                  size: optionsListRequest.size,
                  ...(optionsListRequest.sort
                    ? {
                        order: {
                          [optionsListRequest.sort.by]: optionsListRequest.sort.direction,
                        },
                      }
                    : {}),
                },
              },
              totalCardinality: {
                cardinality: {
                  field: optionsListRequest.fieldName,
                },
              },
              ...(optionsListRequest.ignoreValidations
                ? {}
                : {
                    validation: {
                      filters: {
                        filters: (selectedOptions ?? []).reduce<
                          Record<string, { match: Record<string, OptionsListSelection> }>
                        >((acc, option) => {
                          acc[String(option)] = {
                            match: {
                              [optionsListRequest.fieldName]: option,
                            },
                          };
                          return acc;
                        }, {}),
                      },
                    },
                  }),
            },
          });

          const aggregations = getAggregations(esResponse);
          const buckets = aggregations?.suggestions?.buckets ?? [];

          const body: OptionsListSuccessResponse = {
            suggestions: buckets.map((bucket) => ({
              value: bucket.key,
              docCount: bucket.doc_count,
            })),
            totalCardinality: Number(aggregations?.totalCardinality?.value ?? 0),
            invalidSelections: parseInvalidSelections(aggregations, selectedOptions),
          };

          return response.ok({ body });
        } catch (error) {
          return handleRouteError(response, error);
        }
      })
    );
}
