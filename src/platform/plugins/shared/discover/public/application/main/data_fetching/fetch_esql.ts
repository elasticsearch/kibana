/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { pluck } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { i18n } from '@kbn/i18n';
import {
  type Query,
  type AggregateQuery,
  type Filter,
  type TimeRange,
  type ProjectRouting,
  isOfAggregateQueryType,
} from '@kbn/es-query';
import type { Adapters } from '@kbn/inspector-plugin/common';
import type { ESQLControlVariable } from '@kbn/esql-types';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { ExpressionsStart } from '@kbn/expressions-plugin/public';
import type { Datatable } from '@kbn/expressions-plugin/public';
import type { DataView } from '@kbn/data-views-plugin/common';
import { textBasedQueryStateToAstWithValidation } from '@kbn/data-plugin/common';
import { getDocId, type DataTableRecord } from '@kbn/discover-utils';
import type { SearchResponseWarning } from '@kbn/search-response-warnings';
import moment from 'moment';
import type { ESQLColumnsWithHighlights } from '@kbn/esql-utils';
import { getColumnsWithHighlights } from '@kbn/esql-utils';
import type { RecordsFetchResponse } from '../../types';
import type { ScopedProfilesManager } from '../../../context_awareness';

interface EsqlErrorResponse {
  error: {
    message: string;
  };
  type: 'error';
}

export interface FetchEsqlParams {
  query: Query | AggregateQuery;
  inputQuery?: Query;
  filters?: Filter[];
  timeRange?: TimeRange;
  dataView: DataView;
  abortSignal?: AbortSignal;
  inspectorAdapters: Adapters;
  data: DataPublicPluginStart;
  expressions: ExpressionsStart;
  scopedProfilesManager: ScopedProfilesManager;
  esqlVariables?: ESQLControlVariable[];
  searchSessionId?: string;
  projectRouting?: ProjectRouting;
  useApproximation?: boolean;
  inspectorConfig?: {
    title: string;
    description: string;
  };
}

export function fetchEsql({
  query,
  inputQuery,
  filters,
  timeRange,
  dataView,
  abortSignal,
  inspectorAdapters,
  data,
  expressions,
  scopedProfilesManager,
  esqlVariables,
  searchSessionId,
  projectRouting,
  useApproximation,
  inspectorConfig,
}: FetchEsqlParams): Promise<RecordsFetchResponse> {
  const props = getTextBasedQueryStateToAstProps({
    query,
    inputQuery,
    filters,
    timeRange,
    dataView,
    data,
    inspectorConfig,
  });
  return textBasedQueryStateToAstWithValidation(props)
    .then((ast) => {
      if (ast) {
        const contract = expressions.execute(ast, null, {
          inspectorAdapters,
          searchContext: {
            timeRange,
            esqlVariables,
            projectRouting,
            useApproximation,
          },
          searchSessionId,
        });
        abortSignal?.addEventListener('abort', (e) => {
          contract.cancel((e.target as AbortSignal)?.reason);
        });
        const execution = contract.getData();
        let finalData: DataTableRecord[] = [];
        let esqlQueryColumns: Datatable['columns'] | undefined;
        let error: string | undefined;
        let esqlHeaderWarning: string | undefined;
        execution.pipe(pluck('result')).subscribe((resp) => {
          const response = resp as Datatable | EsqlErrorResponse;
          if (response.type === 'error') {
            error = response.error.message;
          } else {
            const table = response as Datatable;
            const rows = table?.rows ?? [];
            const responseTime = moment().format('YYYY-MM-DD_HH_mm_ss');
            esqlQueryColumns = table?.columns ?? undefined;
            esqlHeaderWarning = table.warning ?? undefined;
            let inlineHighlights: ESQLColumnsWithHighlights | undefined;
            if (isOfAggregateQueryType(query)) {
              try {
                inlineHighlights = getColumnsWithHighlights(query.esql);
              } catch (_e) {
                inlineHighlights = undefined;
              }
            }
            finalData = rows.map((row, idx) => {
              const raw = Object.keys(inlineHighlights ?? {}).length
                ? { ...row, inline_highlights: inlineHighlights }
                : row;
              const record: DataTableRecord = {
                id: row._index && row._id ? getDocId(row) : `${idx + 1}@${responseTime}`,
                raw,
                flattened: row,
              };

              return scopedProfilesManager.resolveDocumentProfile({ record });
            });
          }
        });
        return lastValueFrom(execution).then(() => {
          if (error) {
            throw new Error(error);
          } else {
            const adapter = inspectorAdapters.requests;
            const interceptedWarnings: SearchResponseWarning[] = [];
            if (adapter) {
              data.search.showWarnings(adapter, (warning) => {
                interceptedWarnings.push(warning);
                return true; // suppress the default behaviour
              });
            }
            return {
              records: finalData || [],
              interceptedWarnings,
              esqlQueryColumns,
              esqlHeaderWarning,
            };
          }
        });
      }
      return {
        records: [],
        interceptedWarnings: [],
        esqlQueryColumns: [],
        esqlHeaderWarning: undefined,
      };
    })
    .catch((err) => {
      throw new Error(err.message);
    });
}
export function getTextBasedQueryStateToAstProps({
  query,
  inputQuery,
  filters,
  timeRange,
  dataView,
  data,
  inspectorConfig,
}: {
  query: Query | AggregateQuery;
  inputQuery?: Query;
  filters?: Filter[];
  timeRange?: TimeRange;
  dataView: DataView;
  data: DataPublicPluginStart;
  inspectorConfig?: {
    title: string;
    description: string;
  };
}) {
  return {
    filters,
    query,
    time: timeRange ?? data.query.timefilter.timefilter.getAbsoluteTime(),
    timeFieldName: dataView.timeFieldName,
    inputQuery,
    titleForInspector:
      inspectorConfig?.title ??
      i18n.translate('discover.inspectorEsqlRequestTitle', {
        defaultMessage: 'Table',
      }),
    descriptionForInspector:
      inspectorConfig?.description ??
      i18n.translate('discover.inspectorEsqlRequestDescription', {
        defaultMessage: 'This request queries Elasticsearch to fetch results for the table.',
      }),
  };
}
