/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { combineLatest, from } from 'rxjs';
import { map, tap, switchMap } from 'rxjs';
import type { IUiSettingsClient, KibanaExecutionContext } from '@kbn/core/public';
import type { IEsSearchResponse } from '@kbn/search-types';
import type { SearchRequest, DataPublicPluginStart } from '@kbn/data-plugin/public';
import { getSearchParamsFromRequest } from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import { search as dataPluginSearch } from '@kbn/data-plugin/public';
import type { RequestResponder } from '@kbn/inspector-plugin/public';
import type { ProjectRouting } from '@kbn/es-query';
import type { VegaInspectorAdapters } from '../vega_inspector';

/** @internal **/
export const extendSearchParamsWithRuntimeFields = async (
  indexPatterns: SearchAPIDependencies['indexPatterns'],
  requestParams: ReturnType<typeof getSearchParamsFromRequest>,
  indexPatternString?: string
) => {
  if (indexPatternString) {
    if (requestParams.runtime_mappings) {
      return requestParams;
    }

    const indexPattern = (await indexPatterns.find(indexPatternString, 1)).find(
      (index) => index.title === indexPatternString
    );

    return {
      ...requestParams,
      runtime_mappings: indexPattern?.getRuntimeMappings(),
    };
  }

  return requestParams;
};

export interface SearchAPIDependencies {
  uiSettings: IUiSettingsClient;
  search: DataPublicPluginStart['search'];
  indexPatterns: DataViewsPublicPluginStart;
}

export class SearchAPI {
  constructor(
    private readonly dependencies: SearchAPIDependencies,
    private readonly abortSignal?: AbortSignal,
    public readonly inspectorAdapters?: VegaInspectorAdapters,
    private readonly searchSessionId?: string,
    private readonly executionContext?: KibanaExecutionContext,
    public readonly projectRouting?: ProjectRouting
  ) {}

  search(searchRequests: SearchRequest[]) {
    const { search, indexPatterns } = this.dependencies;
    const requestResponders: Record<string, RequestResponder> = {};

    return combineLatest(
      searchRequests.map((request) => {
        const { name: requestId, body, ...restRequest } = request;

        // Vega flattens body params to the top level so that getSearchParamsFromRequest
        // passes them directly to the ES client (which expects e.g. runtime_mappings at
        // the top level, not nested under body). Root-level params take precedence.
        const requestParams = getSearchParamsFromRequest(
          {
            ...body,
            ...restRequest,
          } as SearchRequest,
          {
            getConfig: this.dependencies.uiSettings.get.bind(this.dependencies.uiSettings),
          }
        );

        return from(
          extendSearchParamsWithRuntimeFields(indexPatterns, requestParams, `${request.index}`)
        ).pipe(
          tap((params) => {
            /** inspect request data **/
            if (this.inspectorAdapters) {
              requestResponders[requestId] = this.inspectorAdapters.requests.start(requestId, {
                ...request,
                searchSessionId: this.searchSessionId,
              });
              requestResponders[requestId].json(params);
            }
          }),
          switchMap((params) => {
            return search
              .search(
                { params },
                {
                  abortSignal: this.abortSignal,
                  sessionId: this.searchSessionId,
                  executionContext: this.executionContext,
                  projectRouting: this.projectRouting,
                }
              )
              .pipe(
                tap(
                  (data) => this.inspectSearchResult(data, requestResponders[requestId]),
                  (err) =>
                    this.inspectSearchResult(
                      {
                        rawResponse: err?.err,
                      },
                      requestResponders[requestId]
                    )
                ),
                map((data) => ({
                  name: requestId,
                  rawResponse: structuredClone(data.rawResponse),
                }))
              );
          })
        );
      })
    );
  }

  public resetSearchStats() {
    if (this.inspectorAdapters) {
      this.inspectorAdapters.requests.reset();
    }
  }

  searchEsql(
    esqlRequests: Array<{
      query: string;
      filter?: unknown;
      params?: Array<Record<string, unknown>>;
      dropNullColumns?: boolean;
      name: string;
    }>
  ) {
    const { search } = this.dependencies;
    const requestResponders: Record<string, RequestResponder> = {};

    return combineLatest(
      esqlRequests.map((request) => {
        const { name: requestId, ...restRequest } = request;

        return from(Promise.resolve()).pipe(
          tap(() => {
            /** inspect request data **/
            if (this.inspectorAdapters) {
              requestResponders[requestId] = this.inspectorAdapters.requests.start(requestId, {
                ...request,
                searchSessionId: this.searchSessionId,
              });
              requestResponders[requestId].json(restRequest);
            }
          }),
          switchMap(() => {
            return search
              .search(
                { params: restRequest },
                {
                  strategy: 'esql_async',
                  abortSignal: this.abortSignal,
                  sessionId: this.searchSessionId,
                  executionContext: this.executionContext,
                  projectRouting: this.projectRouting,
                }
              )
              .pipe(
                tap(
                  (data) => this.inspectSearchResult(data, requestResponders[requestId]),
                  (err) =>
                    this.inspectSearchResult(
                      {
                        rawResponse: err?.err,
                      },
                      requestResponders[requestId]
                    )
                ),
                map((data) => ({
                  name: requestId,
                  rawResponse: structuredClone(data.rawResponse),
                }))
              );
          })
        );
      })
    );
  }

  private inspectSearchResult(response: IEsSearchResponse, requestResponder: RequestResponder) {
    if (requestResponder) {
      requestResponder
        .stats(dataPluginSearch.getResponseInspectorStats(response.rawResponse))
        .ok({ json: response.rawResponse });
    }
  }
}
