/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LRUCache } from 'lru-cache';
import hash from 'object-hash';

import dateMath from '@kbn/datemath';

import type { TimeRange } from '@kbn/es-query';

import type {
  OptionsListFailureResponse,
  OptionsListResponse,
  OptionsListSuccessResponse,
  OptionsListUnifiedFetchBody,
} from '../../../../common/options_list/types';
import { coreServices } from '../../../services/kibana_services';

const REQUEST_CACHE_SIZE = 50; // only store a max of 50 responses
const REQUEST_CACHE_TTL = 1000 * 60; // time to live = 1 minute

const optionsListResponseWasFailure = (
  response: OptionsListResponse
): response is OptionsListFailureResponse => {
  return (response as OptionsListFailureResponse).error !== undefined;
};

export class OptionsListFetchCache {
  private cache: LRUCache<string, OptionsListSuccessResponse>;

  constructor() {
    this.cache = new LRUCache<string, OptionsListSuccessResponse>({
      max: REQUEST_CACHE_SIZE,
      ttl: REQUEST_CACHE_TTL,
    });
  }

  private getRequestHash = (request: OptionsListUnifiedFetchBody) => {
    // round timeRange to the minute to avoid cache misses
    const roundedTimeRange = (timeRange?: TimeRange) =>
      timeRange
        ? JSON.stringify({
            from: dateMath.parse(timeRange.from)!.startOf('minute').toISOString(),
            to: dateMath.parse(timeRange.to)!.endOf('minute').toISOString(),
          })
        : [];

    if (request.kind === 'dsl') {
      const {
        index,
        size,
        sort,
        filters,
        searchString,
        runPastTimeout,
        selectedOptions,
        searchTechnique,
        ignoreValidations,
        fieldName,
      } = request;

      return hash({
        kind: request.kind,
        index,
        selectedOptions,
        filters,
        sort,
        searchTechnique,
        ignoreValidations,
        runPastTimeout,
        searchString: searchString ?? '',
        fieldName,
        size,
      });
    }

    const {
      esql,
      timeRange,
      searchString,
      esqlVariables,
      filter,
      sort,
      ignoreValidations,
      selectedOptions,
      searchTechnique,
    } = request;

    return hash({
      kind: request.kind,
      esql,
      timeRange: roundedTimeRange(timeRange),
      searchString,
      searchTechnique,
      sort,
      esqlVariables,
      filter,
      ignoreValidations,
      selectedOptions: ignoreValidations ? undefined : selectedOptions,
    });
  };

  public async runFetchRequest(
    request: OptionsListUnifiedFetchBody,
    abortSignal: AbortSignal
  ): Promise<OptionsListResponse> {
    const requestHash = this.getRequestHash(request);
    if (!request.isReload && this.cache.has(requestHash)) {
      return Promise.resolve(this.cache.get(requestHash)!);
    }

    const result = await coreServices.http.fetch<OptionsListResponse>(
      `/internal/controls/optionsList/fetch`,
      {
        version: '1',
        body: JSON.stringify(request),
        signal: abortSignal,
        method: 'POST',
      }
    );

    if (!optionsListResponseWasFailure(result)) {
      this.cache.set(requestHash, result);
    }
    return result;
  }

  public clearCache = () => {
    this.cache.clear();
  };
}
