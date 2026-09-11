/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  EqlSearchRequest,
  FieldCapsRequest,
  FieldCapsResponse,
  SearchSearchRequestBody,
  MsearchMultisearchHeader,
  TermsEnumRequest,
  TermsEnumResponse,
} from '@elastic/elasticsearch/lib/api/types';
import type { SearchRequest as ESSearchRequest } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient, KibanaRequest } from '@kbn/core/server';
import type { InferSearchResponseOf } from '@kbn/es-types';
import { ProcessorEvent } from '@kbn/apm-types-shared';
import { compact, omit } from 'lodash';
import type { ValuesType } from 'utility-types';
import type { APMError, Metric, Span, Transaction, Event } from '@kbn/apm-types/es_schemas_ui';
import { type InspectResponse, type DataTier } from '@kbn/observability-shared-plugin/common';
import { unwrapEsResponse } from '@kbn/observability-utils-server/es/unwrap_es_response';
import { excludeTiersQuery } from '@kbn/observability-utils-common/es/queries/exclude_tiers_query';
import type { APMIndices } from '@kbn/apm-sources-access-plugin/server';
import type { ApmDataSource } from '@kbn/apm-types';
import { withApmSpan } from '../../../../utils';
import { cancelEsRequestOnAbort } from '../cancel_es_request_on_abort';
import { callAsyncWithDebug } from '../call_async_with_debug';
import type { ProcessorEventOfDocumentType } from '../document_type';
import { getRequestBase, processorEventsToIndex } from './get_request_base';
import { getDataTierFilterCombined } from '../../tier_filter';

export type APMEventESSearchRequest = Omit<ESSearchRequest, 'index'> & {
  apm: {
    includeLegacyData?: boolean;
  } & ({ events: ProcessorEvent[] } | { sources: ApmDataSource[] });
  size: number;
  track_total_hits: boolean | number;
};

export type APMLogEventESSearchRequest = Omit<ESSearchRequest, 'index'> & {
  size: number;
  track_total_hits: boolean | number;
};

type APMEventWrapper<T> = Omit<T, 'index'> & {
  apm: { events: ProcessorEvent[] };
};

export type APMEventTermsEnumRequest = APMEventWrapper<TermsEnumRequest>;
type APMEventEqlSearchRequest = APMEventWrapper<EqlSearchRequest>;
export type APMEventFieldCapsRequest = APMEventWrapper<FieldCapsRequest>;

type TypeOfProcessorEvent<T extends ProcessorEvent> = {
  [ProcessorEvent.error]: APMError;
  [ProcessorEvent.transaction]: Transaction;
  [ProcessorEvent.span]: Span;
  [ProcessorEvent.metric]: Metric;
}[T];

type TypedLogEventSearchResponse<TParams extends APMLogEventESSearchRequest> =
  InferSearchResponseOf<Event, TParams>;

type TypedSearchResponse<TParams extends APMEventESSearchRequest> = InferSearchResponseOf<
  TypeOfProcessorEvent<
    TParams['apm'] extends { events: ProcessorEvent[] }
      ? ValuesType<TParams['apm']['events']>
      : TParams['apm'] extends { sources: ApmDataSource[] }
      ? ProcessorEventOfDocumentType<ValuesType<TParams['apm']['sources']>['documentType']>
      : never
  >,
  TParams
>;

interface TypedMSearchResponse<TParams extends APMEventESSearchRequest> {
  responses: Array<TypedSearchResponse<TParams>>;
}

export interface APMEventClientConfig {
  esClient: ElasticsearchClient;
  debug: boolean;
  request: KibanaRequest;
  indices: APMIndices;
  options: {
    includeFrozen: boolean;
    inspectableEsQueriesMap?: WeakMap<KibanaRequest, InspectResponse>;
    excludedDataTiers?: DataTier[];
    projectRouting?: string;
  };
}

export class APMEventClient {
  private readonly esClient: ElasticsearchClient;
  private readonly debug: boolean;
  private readonly request: KibanaRequest;
  public readonly indices: APMIndices;
  /** @deprecated Use {@link excludedDataTiers} instead.
   * See https://www.elastic.co/guide/en/kibana/current/advanced-options.html **/
  private readonly includeFrozen: boolean;
  private readonly excludedDataTiers: DataTier[];
  private readonly inspectableEsQueriesMap?: WeakMap<KibanaRequest, InspectResponse>;
  private readonly projectRouting?: string;

  constructor(config: APMEventClientConfig) {
    this.esClient = config.esClient;
    this.debug = config.debug;
    this.request = config.request;
    this.indices = config.indices;
    this.includeFrozen = config.options.includeFrozen;
    this.excludedDataTiers = config.options.excludedDataTiers ?? [];
    this.inspectableEsQueriesMap = config.options.inspectableEsQueriesMap;
    this.projectRouting = config.options.projectRouting;
  }

  private callAsyncWithDebug<T extends { body: any }>({
    requestType,
    params,
    cb,
    operationName,
  }: {
    requestType: string;
    params: Record<string, any>;
    cb: (requestOpts: { signal: AbortSignal; meta: true }) => Promise<T>;
    operationName: string;
  }): Promise<T['body']> {
    return callAsyncWithDebug({
      isCalledWithInternalUser: false,
      debug: this.debug,
      request: this.request,
      operationName,
      requestParams: params,
      inspectableEsQueriesMap: this.inspectableEsQueriesMap,
      cb: () => {
        const controller = new AbortController();

        const promise = withApmSpan(operationName, () => {
          return cancelEsRequestOnAbort(
            cb({ signal: controller.signal, meta: true }),
            this.request,
            controller
          );
        });

        return unwrapEsResponse(promise);
      },
    });
  }

  async search<TParams extends APMEventESSearchRequest>(
    operationName: string,
    params: TParams,
    options?: { skipProcessorEventFilter?: boolean }
  ): Promise<TypedSearchResponse<TParams>> {
    const { index, filters } = getRequestBase({
      apm: params.apm,
      indices: this.indices,
      skipProcessorEventFilter: options?.skipProcessorEventFilter,
    });

    if (this.excludedDataTiers.length > 0) {
      filters.push(...excludeTiersQuery(this.excludedDataTiers));
    }

    const searchParams = {
      ...omit(params, 'apm', 'body'),
      index,
      query: {
        bool: {
          filter: filters,
          must: compact([params.query]),
        },
      },
      body: params.body,
      ...(this.includeFrozen ? { ignore_throttled: false } : {}),
      ...(this.projectRouting ? { project_routing: this.projectRouting } : {}),
      ignore_unavailable: true,
      preference: 'any',
      expand_wildcards: ['open' as const, 'hidden' as const],
    };

    return this.callAsyncWithDebug({
      cb: (opts) =>
        this.esClient.search(searchParams, opts) as unknown as Promise<{
          body: TypedSearchResponse<TParams>;
        }>,
      operationName,
      params: searchParams,
      requestType: 'search',
    });
  }

  async logEventSearch<TParams extends APMLogEventESSearchRequest>(
    operationName: string,
    params: TParams
  ): Promise<TypedLogEventSearchResponse<TParams>> {
    // Reusing indices configured for errors since both events and errors are stored as logs.
    const index = processorEventsToIndex([ProcessorEvent.error], this.indices);

    const filter =
      this.excludedDataTiers.length > 0 ? excludeTiersQuery(this.excludedDataTiers) : undefined;

    const searchParams = {
      ...omit(params, 'body'),
      index,
      body: params.body,
      query: {
        bool: {
          filter,
          must: compact([params.query]),
        },
      },
      ...(this.includeFrozen ? { ignore_throttled: false } : {}),
      ...(this.projectRouting ? { project_routing: this.projectRouting } : {}),
      ignore_unavailable: true,
      preference: 'any',
      expand_wildcards: ['open' as const, 'hidden' as const],
    };

    return this.callAsyncWithDebug({
      cb: (opts) =>
        this.esClient.search(searchParams, opts) as unknown as Promise<{
          body: TypedLogEventSearchResponse<TParams>;
        }>,
      operationName,
      params: searchParams,
      requestType: 'search',
    });
  }

  async msearch<TParams extends APMEventESSearchRequest>(
    operationName: string,
    ...allParams: TParams[]
  ): Promise<TypedMSearchResponse<TParams>> {
    const searches = allParams
      .map((params) => {
        const { index, filters } = getRequestBase({
          apm: params.apm,
          indices: this.indices,
        });

        if (this.excludedDataTiers.length > 0) {
          filters.push(...excludeTiersQuery(this.excludedDataTiers));
        }

        const searchParams: [MsearchMultisearchHeader, SearchSearchRequestBody] = [
          {
            index,
            preference: 'any',
            ...(this.includeFrozen ? { ignore_throttled: false } : {}),
            ignore_unavailable: true,
            expand_wildcards: ['open' as const, 'hidden' as const],
          },
          {
            ...omit(params, 'apm', 'body'),
            body: params.body,
            query: {
              bool: {
                filter: compact([params.query, ...filters]),
              },
            },
          },
        ];

        return searchParams;
      })
      .flat();

    return this.callAsyncWithDebug({
      cb: (opts) =>
        this.esClient.msearch(
          {
            searches,
            ...(this.projectRouting ? { project_routing: this.projectRouting } : {}),
          },
          opts
        ) as unknown as Promise<{
          body: TypedMSearchResponse<TParams>;
        }>,
      operationName,
      params: searches,
      requestType: 'msearch',
    });
  }

  async eqlSearch(operationName: string, params: APMEventEqlSearchRequest) {
    const index = processorEventsToIndex(params.apm.events, this.indices);

    const requestParams = {
      ...omit(params, 'apm'),
      index,
      ...(this.projectRouting ? { project_routing: this.projectRouting } : {}),
    };

    return this.callAsyncWithDebug({
      operationName,
      requestType: 'eql_search',
      params: requestParams,
      cb: (opts) => this.esClient.eql.search(requestParams, opts),
    });
  }

  async fieldCaps(
    operationName: string,
    params: APMEventFieldCapsRequest
  ): Promise<FieldCapsResponse> {
    const index = processorEventsToIndex(params.apm.events, this.indices);

    const requestParams: Omit<APMEventFieldCapsRequest, 'apm'> & { index: string[] } = {
      ...omit(params, 'apm'),
      index,
      ...(this.projectRouting ? { project_routing: this.projectRouting } : {}),
      index_filter: getDataTierFilterCombined({
        filter: params.index_filter,
        excludedDataTiers: this.excludedDataTiers,
      }),
    };

    return this.callAsyncWithDebug({
      operationName,
      requestType: '_field_caps',
      params: requestParams,
      cb: (opts) => this.esClient.fieldCaps(requestParams, opts),
    });
  }

  async termsEnum(
    operationName: string,
    params: APMEventTermsEnumRequest
  ): Promise<TermsEnumResponse> {
    // The terms_enum API does not support project_routing. Return empty
    // results so callers fall back to a search-based approach that does.
    if (this.projectRouting) {
      return { terms: [], _shards: { total: 0, successful: 0, failed: 0 }, complete: false };
    }

    const index = processorEventsToIndex(params.apm.events, this.indices);

    const requestParams: Omit<APMEventTermsEnumRequest, 'apm'> & { index: string } = {
      ...omit(params, 'apm'),
      index: index.join(','),
      index_filter: getDataTierFilterCombined({
        filter: params.index_filter,
        excludedDataTiers: this.excludedDataTiers,
      }),
    };

    return this.callAsyncWithDebug({
      operationName,
      requestType: '_terms_enum',
      params: requestParams,
      cb: (opts) => this.esClient.termsEnum(requestParams, opts),
    });
  }

  getIndicesFromProcessorEvent(processorEvent: ProcessorEvent) {
    return processorEventsToIndex([processorEvent], this.indices);
  }
}
