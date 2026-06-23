/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';

import type { SearchRequest } from '@elastic/elasticsearch/lib/api/types';
import { schema } from '@kbn/config-schema';
import type { CoreSetup, ElasticsearchClient } from '@kbn/core/server';
import { UI_SETTINGS } from '@kbn/data-plugin/common';
import { getKbnServerError, reportServerError } from '@kbn/kibana-utils-plugin/server';
import type { PluginSetup as KqlPluginSetup } from '@kbn/kql/server';

import { SELECTIONS_MAX } from '@kbn/controls-constants';
import type { StartDeps } from '../plugin';

import { getESQLSingleColumnValues } from '../../common/options_list/get_esql_single_column_values';
import type {
  OptionsListDSLFetchBody,
  OptionsListESQLFetchBody,
  OptionsListRequestBody,
  OptionsListResponse,
} from '../../common/options_list/types';
import { esqlColumnValuesToOptionsListResponse } from './options_list_esql_response';
import { getValidationAggregationBuilder } from './options_list_validation_queries';
import { getSuggestionAggregationBuilder } from './suggestion_queries';

const searchTechniqueSchema = schema.maybe(
  schema.oneOf([schema.literal('exact'), schema.literal('prefix'), schema.literal('wildcard')])
);

const selectedOptionsSchema = schema.maybe(
  schema.oneOf([
    schema.arrayOf(schema.string(), { maxSize: SELECTIONS_MAX }), // maxSize for DoS prevention
    schema.arrayOf(schema.number(), { maxSize: SELECTIONS_MAX }),
  ])
);

const optionsListFetchBodyCommonSchema = schema.object(
  {
    searchString: schema.maybe(schema.string()),
    searchTechnique: searchTechniqueSchema,
    selectedOptions: selectedOptionsSchema,
    ignoreValidations: schema.maybe(schema.boolean()),
    isReload: schema.maybe(schema.boolean()),
    sort: schema.maybe(schema.any()),
  },
  { unknowns: 'allow' }
);

const dslFetchBodySchema = optionsListFetchBodyCommonSchema.extends({
  kind: schema.literal('dsl'),
  index: schema.string(),
  size: schema.number(),
  fieldName: schema.string(),
  filters: schema.maybe(schema.any()),
  fieldSpec: schema.maybe(schema.any()),
  runtimeFieldMap: schema.maybe(schema.any()),
  runPastTimeout: schema.maybe(schema.boolean()),
});

const esqlFetchBodySchema = optionsListFetchBodyCommonSchema.extends({
  kind: schema.literal('esql'),
  esql: schema.string(),
  timeRange: schema.maybe(schema.any()),
  filter: schema.maybe(schema.any()),
  esqlVariables: schema.maybe(schema.arrayOf(schema.any(), { maxSize: 1000 })),
});

export const setupOptionsListSuggestionsRoute = (
  core: CoreSetup<StartDeps>,
  getAutocompleteSettings: KqlPluginSetup['autocomplete']['getAutocompleteSettings']
) => {
  const router = core.http.createRouter();

  router.versioned
    .post({
      access: 'internal',
      path: '/internal/controls/optionsList/fetch',
      security: {
        authz: {
          enabled: false,
          reason:
            'This route is opted out from authorization because permissions will be checked by elasticsearch.',
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: schema.oneOf([dslFetchBodySchema, esqlFetchBodySchema]),
          },
        },
      },
      async (context, request, response) => {
        try {
          const [, { data }] = await core.getStartServices();

          const suggestionsResponse =
            request.body.kind === 'dsl'
              ? await getOptionsListDslSuggestions({
                  abortedEvent$: request.events.aborted$,
                  request: request.body,
                  esClient: (await context.core).elasticsearch.client.asCurrentUser,
                  getAutocompleteSettings,
                })
              : await getOptionsListEsqlSuggestions({
                  abortedEvent$: request.events.aborted$,
                  request: request.body,
                  searchAsScoped: data.search.asScoped(request),
                  uiSettingsClient: (await context.core).uiSettings.client,
                });

          return response.ok({ body: suggestionsResponse });
        } catch (e) {
          const kbnErr = getKbnServerError(e as Error);
          return reportServerError(response, kbnErr);
        }
      }
    );
};

const getOptionsListDslSuggestions = async ({
  abortedEvent$,
  esClient,
  request,
  getAutocompleteSettings,
}: {
  request: OptionsListDSLFetchBody;
  abortedEvent$: Observable<void>;
  esClient: ElasticsearchClient;
  getAutocompleteSettings: KqlPluginSetup['autocomplete']['getAutocompleteSettings'];
}): Promise<OptionsListResponse> => {
  const abortController = new AbortController();
  abortedEvent$.subscribe(() => abortController.abort());

  const { kind: _kind, index, ...rest } = request;
  const suggestionRequest = rest as OptionsListRequestBody;
  /**
   * Build ES Query
   */
  const { runPastTimeout, filters, runtimeFieldMap, ignoreValidations } = suggestionRequest;
  const { terminateAfter, timeout } = getAutocompleteSettings();
  const timeoutSettings = runPastTimeout
    ? {}
    : { timeout: `${timeout}ms`, terminate_after: terminateAfter };

  const suggestionBuilder = getSuggestionAggregationBuilder(suggestionRequest);
  const validationBuilder = getValidationAggregationBuilder();

  const suggestionAggregation: any = suggestionBuilder.buildAggregation(suggestionRequest) ?? {};
  const validationAggregation: any = ignoreValidations
    ? {}
    : validationBuilder.buildAggregation(suggestionRequest);

  const body: SearchRequest = {
    size: 0,
    ...timeoutSettings,
    query: {
      bool: {
        filter: filters,
      },
    },
    aggs: {
      ...suggestionAggregation,
      ...validationAggregation,
    },
    runtime_mappings: {
      ...runtimeFieldMap,
    },
  };

  /**
   * Run ES query
   */
  const rawEsResult = await esClient.search({ index, ...body }, { signal: abortController.signal });

  /**
   * Parse ES response into Options List Response
   */
  const results = suggestionBuilder.parse(rawEsResult, suggestionRequest);
  const totalCardinality = results.totalCardinality;
  const invalidSelections = ignoreValidations
    ? []
    : validationBuilder.parse(rawEsResult, suggestionRequest);

  return {
    suggestions: results.suggestions,
    totalCardinality,
    invalidSelections,
  };
};

const getOptionsListEsqlSuggestions = async ({
  abortedEvent$,
  request,
  searchAsScoped,
  uiSettingsClient,
}: {
  request: OptionsListESQLFetchBody;
  abortedEvent$: Observable<void>;
  searchAsScoped: { search: import('@kbn/search-types').ISearchGeneric };
  uiSettingsClient: { get: <T = unknown>(key: string) => Promise<T> };
}): Promise<OptionsListResponse> => {
  const abortController = new AbortController();
  abortedEvent$.subscribe(() => abortController.abort());

  const timezone = (await uiSettingsClient.get(UI_SETTINGS.DATEFORMAT_TZ)) as string | undefined;

  const result = await getESQLSingleColumnValues({
    query: request.esql,
    search: searchAsScoped.search,
    signal: abortController.signal,
    timeRange: request.timeRange,
    filter: request.filter,
    esqlVariables: request.esqlVariables ?? [],
    timezone,
  });

  if (getESQLSingleColumnValues.isSuccess(result)) {
    return esqlColumnValuesToOptionsListResponse(result, {
      searchString: request.searchString,
      searchTechnique: request.searchTechnique,
      selectedOptions: request.selectedOptions,
      ignoreValidations: request.ignoreValidations,
      sort: request.sort,
    });
  }

  return { error: result.errors[0] };
};
