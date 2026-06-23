/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { TimeRange } from '@kbn/es-query';
import type { ISearchGeneric } from '@kbn/search-types';
import type { ESQLControlVariable, EsqlFieldType, ESQLFieldWithMetadata } from '@kbn/esql-types';
import { getESQLQueryColumnsRaw } from '../run_query';

/**
 * Gets the columns of an ESQL query, formatted as ESQLFieldWithMetadata
 * @param esqlQuery The ESQL query to execute
 * @param search The search service to use
 * @param variables Optional ESQL control variables to substitute in the query
 * @param signal Optional AbortSignal to cancel the request
 * @param timeRange Optional time range for the query
 * @returns A promise that resolves to an array of ESQLFieldWithMetadata
 */
export const getEsqlColumns = async ({
  esqlQuery,
  search,
  variables,
  signal,
  timeRange,
}: {
  search: ISearchGeneric;
  esqlQuery?: string;
  variables?: ESQLControlVariable[];
  signal?: AbortSignal;
  timeRange?: TimeRange;
}): Promise<ESQLFieldWithMetadata[]> => {
  if (esqlQuery) {
    try {
      const columns = await getESQLQueryColumnsRaw({
        esqlQuery,
        search,
        dropNullColumns: true,
        variables: variables ?? [],
        signal,
        timeRange,
      });
      return columns.map(({ name, type, original_types: originalTypes }) => {
        const hasConflict = type === 'unsupported' && (originalTypes?.length ?? 0) > 1;
        return {
          name,
          type: type as EsqlFieldType,
          hasConflict,
          originalTypes: hasConflict ? originalTypes : undefined,
          userDefined: false,
        };
      });
    } catch (error) {
      // Handle error
      return [];
    }
  }
  return [];
};
