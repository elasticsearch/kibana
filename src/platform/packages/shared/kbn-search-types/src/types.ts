/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import type { ConnectionRequestParams } from '@elastic/transport';
import type { TransportRequestOptions } from '@elastic/elasticsearch';
import type { KibanaExecutionContext } from '@kbn/core/public';
import type { AbstractDataView } from '@kbn/data-views-plugin/common';
import type { Observable } from 'rxjs';
import type { ProjectRouting } from '@kbn/es-query';
import type { IEsSearchRequest, IEsSearchResponse } from './es_search_types';
import type { IKibanaSearchRequest, IKibanaSearchResponse } from './kibana_search_types';

export type ISearchGeneric = <
  SearchStrategyRequest extends IKibanaSearchRequest = IEsSearchRequest,
  SearchStrategyResponse extends IKibanaSearchResponse = IEsSearchResponse
>(
  request: SearchStrategyRequest,
  options?: ISearchOptions
) => Observable<SearchStrategyResponse>;

export type ISearchCancelGeneric = (id: string, options?: ISearchOptions) => Promise<void>;
export type ISearchExtendGeneric = (
  id: string,
  keepAlive: string,
  options?: ISearchOptions
) => Promise<void>;

export interface ISearchClient {
  search: ISearchGeneric;
  /**
   * Used to cancel an in-progress search request.
   */
  cancel: ISearchCancelGeneric;
  /**
   * Used to extend the TTL of an in-progress search request.
   */
  extend: ISearchExtendGeneric;
}

export type SanitizedConnectionRequestParams = Pick<
  ConnectionRequestParams,
  'method' | 'path' | 'querystring'
>;

export interface IEsErrorAttributes {
  error?: estypes.ErrorCause;
  rawResponse?: estypes.SearchResponseBody;
  requestParams?: SanitizedConnectionRequestParams;
}

export interface ISearchOptions {
  /**
   * An `AbortSignal` that allows the caller of `search` to abort a search request.
   */
  abortSignal?: AbortSignal;

  /**
   * Use this option to force using a specific server side search strategy. Leave empty to use the default strategy.
   */
  strategy?: string | symbol;

  /**
   * Request the legacy format for the total number of hits. If sending `rest_total_hits_as_int` to
   * something other than `true`, this should be set to `false`.
   */
  legacyHitsTotal?: boolean;

  /**
   * A session ID, grouping multiple search requests into a single session.
   */
  sessionId?: string;

  /**
   * Whether the session is already saved (i.e. sent to background)
   */
  isStored?: boolean;

  /**
   * Whether the search was successfully polled after session was saved. Search was added to a session saved object and keepAlive extended.
   */
  isSearchStored?: boolean;

  /**
   * Whether the session is restored (i.e. search requests should re-use the stored search IDs,
   * rather than starting from scratch)
   */
  isRestore?: boolean;

  /**
   * By default, when polling, we don't retrieve the results of the search request (until it is complete).
   * setting this to `true` will request the search results, regardless of whether or not the search is complete.
   */
  returnIntermediateResults?: boolean;

  /**
   * Represents a meta-information about a Kibana entity intitating a saerch request.
   */
  executionContext?: KibanaExecutionContext;

  /**
   * Index pattern reference is used for better error messages
   */
  indexPattern?: AbstractDataView;

  /**
   * TransportRequestOptions, other than `signal`, to pass through to the ES client.
   * To pass an abort signal, use {@link ISearchOptions.abortSignal}
   */
  transport?: Omit<TransportRequestOptions, 'signal'>;

  /**
   * When set es results are streamed back to the caller without any parsing of the content.
   */
  stream?: boolean;

  /**
   * A hash of the request params. This is attached automatically by the search interceptor. It is used to link this request with a search session.
   */
  requestHash?: string;

  /**
   * Project routing configuration for cross-project search (CPS).
   */
  projectRouting?: ProjectRouting;

  /**
   * When true, ES|QL queries use approximate execution for faster, estimated results.
   */
  approximation?: boolean;
}

/**
 * Same as `ISearchOptions`, but contains only serializable fields, which can
 * be sent over the network.
 */
export type ISearchOptionsSerializable = Pick<
  ISearchOptions,
  | 'strategy'
  | 'legacyHitsTotal'
  | 'sessionId'
  | 'isStored'
  | 'isSearchStored'
  | 'isRestore'
  | 'returnIntermediateResults'
  | 'executionContext'
  | 'stream'
  | 'projectRouting'
  | 'approximation'
>;
