/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { DataViewsServicePublic } from '@kbn/data-views-plugin/public/types';
import type { LensPublicStart, TypedLensByValueInput } from '@kbn/lens-plugin/public';
import type { ChartType } from '@kbn/visualization-utils';
import { getLensAttributesFromSuggestion } from '@kbn/visualization-utils';
import { getESQLAdHocDataview } from '@kbn/esql-utils';
import type { EsqlResults } from '@kbn/agent-builder-common/tools/tool_result';
import type { TimeRange } from '@kbn/agent-builder-common';
import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import { esFieldTypeToKibanaFieldType } from '@kbn/field-types';
import useAsync from 'react-use/lib/useAsync';

interface Params {
  esqlQuery: string;
  dataViews: DataViewsServicePublic;
  lens: LensPublicStart;
  esqlColumns: EsqlResults['data']['columns'] | undefined;
  preferredChartType?: ChartType;
  timeRange?: TimeRange;
}

interface ReturnValue {
  lensInput: TypedLensByValueInput | undefined;
  setLensInput: (v: TypedLensByValueInput) => void;
  isLoading: boolean;
  error?: Error;
}

export function useLensInput({
  esqlQuery,
  dataViews,
  lens,
  esqlColumns,
  preferredChartType,
  timeRange,
}: Params): ReturnValue {
  const [lensInput, setLensInput] = useState<TypedLensByValueInput>();

  const columns = useMemo(
    () =>
      esqlColumns?.map(
        (c) =>
          ({
            id: c.name,
            name: c.name,
            meta: { type: esFieldTypeToKibanaFieldType(c.type) },
          } as DatatableColumn)
      ),
    [esqlColumns]
  );

  const lensHelpersAsync = useAsync(() => lens.stateHelperApi(), [lens]);
  const dataViewAsync = useAsync(
    () =>
      getESQLAdHocDataview({
        dataViewsService: dataViews,
        query: esqlQuery,
        options: { skipFetchFields: true },
      }),
    [esqlQuery, dataViews]
  );
  const error = lensHelpersAsync.error || dataViewAsync.error;

  useEffect(() => {
    if (!lensInput && lensHelpersAsync.value && dataViewAsync.value && !error) {
      const context = {
        dataViewSpec: dataViewAsync.value.toSpec(),
        fieldName: '',
        textBasedColumns: columns,
        query: { esql: esqlQuery },
      };

      const suggestions = lensHelpersAsync.value.suggestions(
        context,
        dataViewAsync.value,
        [],
        preferredChartType
      );

      if (suggestions?.length) {
        const [suggestion] = suggestions;
        const attributes = getLensAttributesFromSuggestion({
          filters: [],
          query: { esql: esqlQuery },
          suggestion,
          dataView: dataViewAsync.value,
        }) as TypedLensByValueInput['attributes'];
        setLensInput({ attributes, id: uuidv4(), timeRange });
      }
    }
  }, [
    lensInput,
    lensHelpersAsync.value,
    dataViewAsync.value,
    columns,
    esqlQuery,
    preferredChartType,
    timeRange,
    error,
  ]);

  return {
    lensInput,
    setLensInput,
    isLoading: !lensInput || lensHelpersAsync.loading || dataViewAsync.loading,
    error: error || undefined,
  };
}
