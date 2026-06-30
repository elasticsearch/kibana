/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useQuery } from '@kbn/react-query';
import { getESQLQueryColumnsRaw } from '@kbn/esql-utils';
import type { ISearchGeneric } from '@kbn/search-types';

interface UseIndexFieldsProps {
  indexPatterns: string[];
  search: ISearchGeneric;
}

/**
 * Fetches available field names from the given index patterns using the same
 * ES|QL column introspection approach as the platform GroupFieldSelect.
 *
 * Must be rendered inside a QueryClientProvider (the platform form provides one).
 */
export const useIndexFields = ({ indexPatterns, search }: UseIndexFieldsProps) => {
  const positivePatterns = useMemo(
    () => indexPatterns.filter((p) => !p.startsWith('-')),
    [indexPatterns]
  );

  const fromQuery = useMemo(
    () => (positivePatterns.length > 0 ? `FROM ${positivePatterns.join(', ')}` : ''),
    [positivePatterns]
  );

  const { data, isLoading } = useQuery({
    queryKey: ['rulesV2IndexFields', fromQuery],
    queryFn: async ({ signal }) =>
      getESQLQueryColumnsRaw({
        esqlQuery: fromQuery,
        search,
        signal,
        dropNullColumns: true,
      }),
    enabled: Boolean(fromQuery),
    refetchOnWindowFocus: false,
    retry: false,
    select: (cols) =>
      cols.map(({ name }) => ({ label: name })).sort((a, b) => a.label.localeCompare(b.label)),
  });

  return { fieldOptions: data ?? [], isLoading };
};
