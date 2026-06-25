/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core/server';
import { esFieldTypeToKibanaFieldType, KBN_FIELD_TYPES } from '@kbn/field-types';
import { i18n } from '@kbn/i18n';
import type { estypes } from '@elastic/elasticsearch';
import type { ISearchMethods } from '@kbn/search-types';
import type {
  Datatable,
  DatatableColumn,
  ExpressionFunctionDefinition,
} from '@kbn/expressions-plugin/common';
import { RequestAdapter } from '@kbn/inspector-plugin/common';
import {
  getIndexPatternFromESQLQuery,
  fixESQLQueryWithVariables,
  getNamedParams,
  mapVariableToColumn,
  isComputedColumn,
  getQuerySummary,
  buildRenameSourceFieldMap,
} from '@kbn/esql-utils';
import { zipObject } from 'lodash';
import { buildEsQuery, type Filter, getTimeZoneFromSettings } from '@kbn/es-query';
import type { ESQLSearchParams, ESQLSearchResponse } from '@kbn/es-types';
import DateMath from '@kbn/datemath';
import { getEsQueryConfig } from '../../es_query';
import { getTime } from '../../query';
import { ESQL_TABLE_TYPE, getSideEffectFunction, type KibanaContext } from '..';
import type { UiSettingsCommon } from '../..';

declare global {
  interface Window {
    /**
     * Debug setting to make requests complete slower than normal. Only available on snapshots where `error_query` is enabled in ES.
     */
    ELASTIC_ESQL_DELAY_SECONDS?: number;
  }
}

type Input = KibanaContext | null;
type Output = Promise<Datatable>;

interface Arguments {
  query: string;
  timeField?: string;
  locale?: string;

  /**
   * Requests' meta for showing in Inspector
   */
  titleForInspector?: string;
  descriptionForInspector?: string;
  ignoreGlobalFilters?: boolean;
}

export type EsqlExpressionFunctionDefinition = ExpressionFunctionDefinition<
  'esql',
  Input,
  Arguments,
  Output
>;

interface EsqlFnArguments {
  getStartDependencies(getKibanaRequest: () => KibanaRequest): Promise<EsqlStartDependencies>;
}

interface EsqlStartDependencies {
  searchService: ISearchMethods;
  uiSettings: UiSettingsCommon;
}

function extractTypeAndReason(attributes: any): { type?: string; reason?: string } {
  if (['type', 'reason'].every((prop) => prop in attributes)) {
    return attributes;
  }
  if ('error' in attributes) {
    return extractTypeAndReason(attributes.error);
  }
  return {};
}

function mapResponseToDatatable(
  body: ESQLSearchResponse,
  query: string,
  input: Input,
  warning?: string
): Datatable {
  // all_columns in the response means that there is a separation between
  // columns with data and empty columns
  // columns contain only columns with data while all_columns everything
  const hasEmptyColumns = body.all_columns && body.all_columns?.length > body.columns.length;
  const lookup = new Set(hasEmptyColumns ? body.columns?.map(({ name }) => name) || [] : []);
  const indexPattern = getIndexPatternFromESQLQuery(query);

  const appliedTimeRange = input?.timeRange
    ? {
        from: DateMath.parse(input.timeRange.from)?.toISOString(),
        to: DateMath.parse(input.timeRange.to, { roundUp: true })?.toISOString(),
      }
    : undefined;

  // Normalize body.values: if all arrays are empty, convert to single empty array
  const normalizedValues = body.values.every((row) => Array.isArray(row) && row.length === 0)
    ? []
    : body.values;

  // Get query summary to identify computed columns
  const querySummary = getQuerySummary(query);

  const renameSourceFieldMap: Map<string, string> | null = querySummary.renamedColumnsPairs?.size
    ? buildRenameSourceFieldMap(query)
    : null;

  const allColumns =
    (body.all_columns ?? body.columns)?.map(({ name, type, original_types }) => {
      const originalTypes = original_types ?? [];
      const hasConflict = type === 'unsupported' && originalTypes.length > 1;
      const kibanaFieldType = hasConflict
        ? KBN_FIELD_TYPES.CONFLICT
        : esFieldTypeToKibanaFieldType(type);

      const sourceField = renameSourceFieldMap?.get(name) ?? name;

      return {
        id: name,
        name,
        meta: {
          type: kibanaFieldType,
          esType: type,
          sourceParams:
            type === 'date'
              ? {
                  appliedTimeRange,
                  params: {},
                  indexPattern,
                  sourceField,
                }
              : {
                  indexPattern,
                  sourceField,
                },
          params: {
            id: kibanaFieldType,
          },
        },
        isNull: hasEmptyColumns ? !lookup.has(name) : false,
        isComputedColumn: isComputedColumn(name, querySummary),
      };
    }) ?? [];

  const fixedQuery = fixESQLQueryWithVariables(query, input?.esqlVariables ?? []);
  const updatedWithVariablesColumns = mapVariableToColumn(
    fixedQuery,
    input?.esqlVariables ?? [],
    allColumns as DatatableColumn[]
  );

  // sort only in case of empty columns to correctly align columns to items in values array
  if (hasEmptyColumns) {
    updatedWithVariablesColumns.sort((a, b) => Number(a.isNull) - Number(b.isNull));
  }
  const columnNames = updatedWithVariablesColumns?.map(({ name }) => name);

  const rows = normalizedValues.map((row) => zipObject(columnNames, row));

  return {
    type: 'datatable',
    meta: {
      type: ESQL_TABLE_TYPE,
      query,
      statistics: {
        totalCount: normalizedValues.length,
      },
    },
    columns: updatedWithVariablesColumns,
    rows,
    warning,
  } as Datatable;
}

export const getEsqlFn = ({ getStartDependencies }: EsqlFnArguments) => {
  const essql: EsqlExpressionFunctionDefinition = {
    name: 'esql',
    type: 'datatable',
    inputTypes: ['kibana_context', 'null'],
    help: i18n.translate('data.search.esql.help', {
      defaultMessage: 'Queries Elasticsearch using ES|QL.',
    }),
    args: {
      query: {
        aliases: ['_', 'q'],
        types: ['string'],
        help: i18n.translate('data.search.esql.query.help', {
          defaultMessage: 'An ES|QL query.',
        }),
      },
      timeField: {
        aliases: ['timeField'],
        types: ['string'],
        help: i18n.translate('data.search.essql.timeField.help', {
          defaultMessage: 'The time field to use in the time range filter set in the context.',
        }),
      },
      locale: {
        aliases: ['locale'],
        types: ['string'],
        help: i18n.translate('data.search.essql.locale.help', {
          defaultMessage: 'The locale to use.',
        }),
      },
      titleForInspector: {
        aliases: ['titleForInspector'],
        types: ['string'],
        help: i18n.translate('data.search.esql.titleForInspector.help', {
          defaultMessage: 'The title to show in Inspector.',
        }),
      },
      descriptionForInspector: {
        aliases: ['descriptionForInspector'],
        types: ['string'],
        help: i18n.translate('data.search.esql.descriptionForInspector.help', {
          defaultMessage: 'The description to show in Inspector.',
        }),
      },
      ignoreGlobalFilters: {
        types: ['boolean'],
        default: false,
        help: i18n.translate('data.search.esql.ignoreGlobalFilters.help', {
          defaultMessage: 'Whether to ignore or use global query and filters',
        }),
      },
    },
    allowCache: {
      withSideEffects: (_, { inspectorAdapters }) => {
        return getSideEffectFunction(inspectorAdapters);
      },
    },
    async fn(
      input,
      { query, timeField, locale, titleForInspector, descriptionForInspector, ignoreGlobalFilters },
      { abortSignal, inspectorAdapters, getKibanaRequest, getSearchSessionId, getExecutionContext }
    ) {
      const { searchService, uiSettings } = await getStartDependencies(() => {
        const request = getKibanaRequest?.();
        if (!request) {
          throw new Error(
            'A KibanaRequest is required to run queries on the server. ' +
              'Please provide a request object to the expression execution params.'
          );
        }

        return request;
      });

      // this is for backward compatibility, if the query is of fields or functions type
      // and the query is not set with ?? in the query, we should set it
      // https://github.com/elastic/elasticsearch/pull/122459
      const fixedQuery = fixESQLQueryWithVariables(query, input?.esqlVariables ?? []);
      const esQueryConfigs = getEsQueryConfig(uiSettings as Parameters<typeof getEsQueryConfig>[0]);
      const params: ESQLSearchParams = {
        query: fixedQuery,
        time_zone: esQueryConfigs.dateFormatTZ
          ? getTimeZoneFromSettings(esQueryConfigs.dateFormatTZ)
          : 'UTC',
        locale,
        include_execution_metadata: true,
      };

      if (input) {
        const namedParams = getNamedParams(fixedQuery, input.timeRange, input.esqlVariables);

        if (namedParams.length) {
          params.params = namedParams;
        }

        const timeFilter =
          input.timeRange &&
          getTime(undefined, input.timeRange, {
            fieldName: timeField,
          });

        // Used for debugging & inside automated tests to simulate a slow query
        const delayFilter: Filter | undefined = window.ELASTIC_ESQL_DELAY_SECONDS
          ? {
              meta: {},
              query: {
                error_query: {
                  indices: [
                    {
                      name: '*',
                      error_type: 'warning',
                      stall_time_seconds: window.ELASTIC_ESQL_DELAY_SECONDS,
                    },
                  ],
                },
              },
            }
          : undefined;

        const filters = [
          ...(ignoreGlobalFilters ? [] : input.filters ?? []),
          ...(timeFilter ? [timeFilter] : []),
          ...(delayFilter ? [delayFilter] : []),
        ];

        const inputQuery = ignoreGlobalFilters ? [] : input.query || [];
        params.filter = buildEsQuery(undefined, inputQuery, filters, esQueryConfigs);
      }

      let startTime = Date.now();
      const logInspectorRequest = () => {
        if (!inspectorAdapters.requests) {
          inspectorAdapters.requests = new RequestAdapter();
        }

        const request = inspectorAdapters.requests.start(
          titleForInspector ??
            i18n.translate('data.search.dataRequest.title', {
              defaultMessage: 'Data',
            }),
          {
            description:
              descriptionForInspector ??
              i18n.translate('data.search.es_search.dataRequest.description', {
                defaultMessage:
                  'This request queries Elasticsearch to fetch the data for the visualization.',
              }),
          },
          startTime
        );
        startTime = Date.now();

        return request;
      };

      try {
        const { rawResponse, requestParams, warning } = await searchService.esql(
          {
            query: fixedQuery,
            params: params.params,
            filter: params.filter as estypes.QueryDslQueryContainer | undefined,
            timeZone: params.time_zone,
            locale: params.locale,
          },
          {
            abortSignal,
            sessionId: getSearchSessionId(),
            executionContext: getExecutionContext(),
            projectRouting: input?.projectRouting,
            dropNullColumns: true,
            includeExecutionMetadata: true,
          }
        );

        // Inspector logging on success
        logInspectorRequest()
          .stats({
            hits: {
              label: i18n.translate('data.search.es_search.hitsLabel', {
                defaultMessage: 'Hits',
              }),
              value: `${rawResponse.values.length}`,
              description: i18n.translate('data.search.es_search.hitsDescription', {
                defaultMessage: 'The number of documents returned by the query.',
              }),
            },
            ...(rawResponse?.took && {
              queryTime: {
                label: i18n.translate('data.search.es_search.queryTimeLabel', {
                  defaultMessage: 'Query time',
                }),
                value: i18n.translate('data.search.es_search.queryTimeValue', {
                  defaultMessage: '{queryTime}ms',
                  values: { queryTime: rawResponse.took },
                }),
                description: i18n.translate('data.search.es_search.queryTimeDescription', {
                  defaultMessage:
                    'The time it took to process the query. ' +
                    'Does not include the time to send the request or parse it in the browser.',
                }),
              },
            }),
            ...(rawResponse &&
              'documents_found' in rawResponse && {
                documentsProcessed: {
                  label: i18n.translate('data.search.es_search.documentsProcessedLabel', {
                    defaultMessage: 'Documents processed',
                  }),
                  value: rawResponse.documents_found,
                  description: i18n.translate(
                    'data.search.es_search.documentsProcessedDescription',
                    {
                      defaultMessage: 'The number of documents processed by the query.',
                    }
                  ),
                },
              }),
          })
          .json(params)
          .ok({ json: { rawResponse }, requestParams });

        // Map to Datatable
        return mapResponseToDatatable(rawResponse as any, query, input, warning);
      } catch (error) {
        // Inspector logging on error
        logInspectorRequest()
          .json(params)
          .error({
            json: 'attributes' in error ? error.attributes : { message: error.message },
          });

        // Error formatting
        if (!error.attributes) {
          error.message = `Unexpected error from Elasticsearch: ${error.message}`;
        } else {
          const { type, reason } = extractTypeAndReason(error.attributes);
          if (type === 'parsing_exception') {
            error.message = `Couldn't parse Elasticsearch ES|QL query. Check your query and try again. Error: ${reason}`;
          } else {
            error.message = `Unexpected error from Elasticsearch: ${type} - ${reason}`;
          }
        }
        throw error;
      }
    },
  };

  return essql;
};
