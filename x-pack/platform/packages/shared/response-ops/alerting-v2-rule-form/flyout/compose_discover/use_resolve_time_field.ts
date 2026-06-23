/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useMemo } from 'react';
import { useQuery } from '@kbn/react-query';
import type { HttpStart } from '@kbn/core/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import { getESQLTimeFieldFromQuery } from '@kbn/esql-utils';
import { useDataFields } from '../../form/hooks/use_data_fields';
import { ruleFormKeys } from '../../form/hooks/query_key_factory';
import { extractFromSourceQuery } from './extract_from_source_query';

interface UseResolveTimeFieldParams {
  /** Full ES|QL query or FROM-only query used to resolve index date fields. */
  query: string;
  timeField: string;
  onTimeFieldChange?: (timeField: string) => void;
  http: HttpStart;
  dataViews: DataViewsPublicPluginStart;
  /** When false, skips field resolution and auto-correction. Defaults to true. */
  enabled?: boolean;
}

/**
 * Resolves the correct time field for an ES|QL rule by inspecting the source
 * index (FROM-only query). Falls back to the ES|QL timefield API when field
 * caps return no date fields. Auto-corrects `timeField` when it does not
 * exist on the index (e.g. default `@timestamp` on `kibana_sample_data_flights`).
 */
export const useResolveTimeField = ({
  query,
  timeField,
  onTimeFieldChange,
  http,
  dataViews,
  enabled = true,
}: UseResolveTimeFieldParams) => {
  const fromSourceQuery = useMemo(() => extractFromSourceQuery(query), [query]);
  const resolutionQuery = enabled ? fromSourceQuery : '';

  const { data: fieldMap, isLoading: isLoadingFields } = useDataFields({
    query: resolutionQuery,
    http,
    dataViews,
  });

  const dateFields = useMemo(
    () =>
      Object.values(fieldMap)
        .filter((f) => f.type === 'date')
        .map((f) => f.name)
        .sort(),
    [fieldMap]
  );

  const needsApiTimeField =
    enabled && Boolean(fromSourceQuery) && !isLoadingFields && dateFields.length === 0;

  const { data: apiTimeField, isLoading: isLoadingApiTimeField } = useQuery({
    queryKey: ruleFormKeys.composeDiscoverApiTimeField(fromSourceQuery),
    queryFn: () => getESQLTimeFieldFromQuery({ query: fromSourceQuery, http }),
    enabled: needsApiTimeField,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const resolvedTimeField = dateFields[0] ?? apiTimeField;

  const timeFieldOptions = useMemo(() => {
    if (dateFields.length > 0) {
      return dateFields.map((name) => ({ value: name, text: name }));
    }
    if (apiTimeField) {
      return [{ value: apiTimeField, text: apiTimeField }];
    }
    return [{ value: '@timestamp', text: '@timestamp' }];
  }, [dateFields, apiTimeField]);

  const isTimeFieldResolved = useMemo(() => {
    if (!enabled || !fromSourceQuery) {
      return true;
    }
    if (isLoadingFields || (needsApiTimeField && isLoadingApiTimeField)) {
      return false;
    }
    if (resolvedTimeField) {
      return timeField === resolvedTimeField;
    }
    return true;
  }, [
    enabled,
    fromSourceQuery,
    isLoadingFields,
    needsApiTimeField,
    isLoadingApiTimeField,
    resolvedTimeField,
    timeField,
  ]);

  useEffect(() => {
    if (!enabled || !onTimeFieldChange || !fromSourceQuery) {
      return;
    }
    if (dateFields.length > 0 && !dateFields.includes(timeField)) {
      onTimeFieldChange(dateFields[0]);
    } else if (apiTimeField && timeField !== apiTimeField) {
      onTimeFieldChange(apiTimeField);
    } else if (dateFields.length === 0 && !apiTimeField && timeField !== '@timestamp') {
      onTimeFieldChange('@timestamp');
    }
  }, [enabled, fromSourceQuery, dateFields, apiTimeField, timeField, onTimeFieldChange]);

  return {
    timeFieldOptions,
    isTimeFieldResolved,
  };
};
