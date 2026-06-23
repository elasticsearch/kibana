/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  OptionsListSearchTechnique,
  OptionsListSelection,
  OptionsListSortingType,
} from '@kbn/controls-schemas';
import { ControlValuesSource } from '@kbn/controls-constants';
import type { DataView, DataViewField } from '@kbn/data-views-plugin/public';
import type { FetchContext } from '@kbn/presentation-publishing';

import { isValidSearch } from '../../../../common/options_list/is_valid_search';
import type {
  OptionsListESQLFetchBody,
  OptionsListSuccessResponse,
  OptionsListUnifiedFetchBody,
} from '../../../../common/options_list/types';
import {
  buildESQLPreFilter,
  buildOptionsListDashboardFilters,
  getFetchContextTimeRange,
} from '../utils';

export type BuildOptionsListFetchBodyResult =
  | {
      outcome: 'fetch';
      body: OptionsListUnifiedFetchBody;
      showLoadingSuggestions: boolean;
    }
  | {
      outcome: 'empty';
      response: OptionsListSuccessResponse | Pick<OptionsListSuccessResponse, 'suggestions'>;
    };

export function buildOptionsListFetchBody({
  valuesSource,
  esqlQuery,
  dataViews,
  field,
  fetchContext,
  useGlobalFilters,
  searchString,
  sort,
  searchTechnique,
  requestSize,
  runPastTimeout,
  selectedOptions,
  ignoreValidations,
}: {
  valuesSource: ControlValuesSource;
  esqlQuery?: string;
  dataViews?: DataView[];
  field?: DataViewField;
  fetchContext: FetchContext;
  useGlobalFilters: boolean | undefined;
  searchString: string;
  sort: OptionsListSortingType;
  searchTechnique: OptionsListSearchTechnique;
  requestSize: number;
  runPastTimeout: boolean;
  selectedOptions: OptionsListSelection[];
  ignoreValidations: boolean | undefined;
}): BuildOptionsListFetchBodyResult {
  if (valuesSource === ControlValuesSource.ESQL) {
    if (!esqlQuery) {
      return { outcome: 'empty', response: { suggestions: [] } };
    }

    const timeRange = getFetchContextTimeRange(fetchContext, useGlobalFilters);
    const dataView = dataViews?.[0];

    const body: OptionsListESQLFetchBody = {
      kind: 'esql',
      esql: esqlQuery,
      timeRange,
      filter: buildESQLPreFilter({
        fetchContext,
        useGlobalFilters,
        dataView,
        timeRange,
        esqlQuery,
      }),
      sort,
      searchString,
      searchTechnique,
      selectedOptions,
      esqlVariables: fetchContext.esqlVariables,
      ignoreValidations,
      isReload: fetchContext.isReload,
    };

    return { outcome: 'fetch', body, showLoadingSuggestions: false };
  }

  const dataView = dataViews?.[0];
  if (
    !dataView ||
    !field ||
    !isValidSearch({ searchString, fieldType: field.type, searchTechnique })
  ) {
    return { outcome: 'empty', response: { suggestions: [], totalCardinality: 0 } };
  }

  const filters = buildOptionsListDashboardFilters(dataView, fetchContext, useGlobalFilters);

  return {
    outcome: 'fetch',
    showLoadingSuggestions: true,
    body: {
      kind: 'dsl',
      index: dataView.getIndexPattern(),
      sort,
      searchString,
      runPastTimeout,
      searchTechnique,
      selectedOptions,
      fieldName: field.name,
      fieldSpec: field.toSpec(),
      size: requestSize,
      ignoreValidations,
      filters,
      runtimeFieldMap: dataView.toSpec?.(false).runtimeFieldMap,
      isReload: fetchContext.isReload,
    },
  };
}
