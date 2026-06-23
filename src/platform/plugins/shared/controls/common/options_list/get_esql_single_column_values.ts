/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ISearchGeneric } from '@kbn/search-types';
import type { TimeRange } from '@kbn/es-query';
import { getESQLResults, getIndexPatternFromESQLQuery } from '@kbn/esql-utils';
import type { ESQLControlVariable } from '@kbn/esql-types';
import type { ESQLColumn } from '@kbn/es-types';
import { isNumericType } from '@kbn/esql-language';

export interface GetESQLSingleColumnValuesSuccessString {
  values: string[];
  column: ESQLColumn;
  indexPattern: string;
}
export interface GetESQLSingleColumnValuesSuccessNumber {
  values: number[];
  column: ESQLColumn;
  indexPattern: string;
}

export interface GetESQLSingleColumnValuesSuccessNoResults {
  values: never[];
  column: ESQLColumn;
  indexPattern: string;
}

export type GetESQLSingleColumnValuesSuccess =
  | GetESQLSingleColumnValuesSuccessString
  | GetESQLSingleColumnValuesSuccessNumber
  | GetESQLSingleColumnValuesSuccessNoResults;

export interface GetESQLSingleColumnValuesFailure {
  errors: Error[];
  columns?: ESQLColumn[];
}

type GetESQLSingleColumnValuesMultiColumnFailure = Required<GetESQLSingleColumnValuesFailure>;

interface GetESQLSingleColumnValuesParams {
  query: string;
  search: ISearchGeneric;
  signal?: AbortSignal;
  timeRange?: TimeRange;
  /** ES DSL filter applied as `params.filter` on the ES|QL `_query` endpoint to pre-filter the pipeline. */
  filter?: unknown;
  esqlVariables: ESQLControlVariable[];
  /** From UI settings `dateFormat:tz` on either client or server. */
  timezone?: string;
}
export const getESQLSingleColumnValues = async ({
  query,
  search,
  signal,
  timeRange,
  filter,
  esqlVariables,
  timezone,
}: GetESQLSingleColumnValuesParams): Promise<
  GetESQLSingleColumnValuesSuccess | GetESQLSingleColumnValuesFailure
> => {
  try {
    const results = await getESQLResults({
      esqlQuery: query,
      search,
      signal,
      filter,
      dropNullColumns: true,
      timeRange,
      timezone,
      variables: esqlVariables,
    });
    const columns = results.response.columns;
    const allColumns = results.response.all_columns;

    const indexPattern = getIndexPatternFromESQLQuery(query);

    if (columns.length === 1) {
      const [column] = results.response.columns;
      const rawValues = results.response.values
        .map((value) => value[0])
        .filter((value) => value !== null && value !== undefined);
      return isNumericType(column.type)
        ? { values: rawValues.map((option) => Number(option)), column, indexPattern }
        : { values: rawValues.map((option) => String(option)), column, indexPattern };
    } else if (columns.length === 0 && allColumns?.length === 1) {
      const [column] = allColumns;
      return { values: [], column, indexPattern };
    }

    return { errors: [new Error('Query must return a single column')], columns };
  } catch (e) {
    return { errors: [e as Error] };
  }
};

getESQLSingleColumnValues.isSuccess = (
  result: unknown
): result is GetESQLSingleColumnValuesSuccess =>
  typeof result === 'object' && result !== null && 'values' in result && 'column' in result;

getESQLSingleColumnValues.isNumericResult = (
  result: unknown
): result is GetESQLSingleColumnValuesSuccessNumber =>
  getESQLSingleColumnValues.isSuccess(result) && isNumericType(result.column.type);

getESQLSingleColumnValues.isMultiColumnError = (
  result: unknown
): result is GetESQLSingleColumnValuesMultiColumnFailure =>
  'columns' in (result as GetESQLSingleColumnValuesMultiColumnFailure);

getESQLSingleColumnValues.hasNoResults = (
  result: unknown
): result is GetESQLSingleColumnValuesSuccessNoResults =>
  getESQLSingleColumnValues.isSuccess(result) && !result.values.length;
