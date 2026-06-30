/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import type { Logger } from '@kbn/core/server';
import { lastValueFrom } from 'rxjs';
import { ES_SEARCH_STRATEGY, type ISearchSource } from '@kbn/data-plugin/common';
import { INTERNAL_ENHANCED_ES_SEARCH_STRATEGY } from '@kbn/data-plugin/server';
import { createEsError } from '@kbn/search-errors';
import { SearchCursor, type SearchCursorClients, type SearchCursorSettings } from './search_cursor';
import { i18nTexts } from './i18n_texts';

export class SearchCursorPit extends SearchCursor {
  private searchAfter: estypes.SortResults | undefined;
  private useInternalUser: boolean;

  constructor(
    indexPatternTitle: string,
    settings: SearchCursorSettings,
    clients: SearchCursorClients,
    abortController: AbortController,
    logger: Logger,
    useInternalUser: boolean = false
  ) {
    super(indexPatternTitle, settings, clients, abortController, logger);
    this.useInternalUser = useInternalUser;
  }

  /**
   * When point-in-time strategy is used, the first step is to open a PIT ID for search context.
   */
  public async initialize() {
    this.cursorId = await this.openPointInTime();
  }

  protected async openPointInTime() {
    const { includeFrozen, maxConcurrentShardRequests, scroll, taskInstanceFields } = this.settings;

    let pitId: string | undefined;

    this.logger.debug(`Requesting PIT for: [${this.indexPatternTitle}]...`);
    try {
      // NOTE: if ES is overloaded, this request could time out
      const esClient = this.useInternalUser
        ? this.clients.es.asInternalUser
        : this.clients.es.asCurrentUser;
      const response = await esClient.openPointInTime(
        {
          index: this.indexPatternTitle,
          keep_alive: scroll.duration(taskInstanceFields),
          ignore_unavailable: true,
          ...(includeFrozen ? { querystring: { ignore_throttled: false } } : {}), // "true" will cause deprecation warnings logged in ES
        },
        {
          signal: this.abortController.signal,
          requestTimeout: scroll.duration(taskInstanceFields),
          maxRetries: 0,
          // @ts-expect-error not documented in the types. Is this still supported?
          maxConcurrentShardRequests,
        }
      );
      pitId = response.id;
    } catch (err) {
      throw new Error(
        `Error opening PIT for index pattern [${this.indexPatternTitle}]: ${err.message}`,
        { cause: err }
      );
    }

    if (!pitId) {
      throw new Error(
        `Unable to get PIT for index pattern: ${this.indexPatternTitle}, no errors were thrown`
      );
    }

    this.logger.debug(`Opened PIT ID: ${this.formatCursorId(pitId)}`);

    return pitId;
  }

  protected async searchWithPit(searchBody: estypes.SearchRequest) {
    const { maxConcurrentShardRequests, scroll, taskInstanceFields } = this.settings;

    // maxConcurrentShardRequests=0 is not supported
    const effectiveMaxConcurrentShardRequests =
      maxConcurrentShardRequests > 0 ? maxConcurrentShardRequests : undefined;
    const searchParamsPit = {
      params: {
        ...searchBody,
        max_concurrent_shard_requests: effectiveMaxConcurrentShardRequests,
      },
    };

    const strategy = this.useInternalUser
      ? INTERNAL_ENHANCED_ES_SEARCH_STRATEGY
      : ES_SEARCH_STRATEGY;

    return await lastValueFrom(
      this.clients.data.search(searchParamsPit, {
        strategy,
        abortSignal: this.abortController.signal,
        transport: {
          maxRetries: 0, // retrying reporting jobs is handled in the task manager scheduling logic
          requestTimeout: scroll.duration(taskInstanceFields),
        },
      })
    );
  }

  public async getPage(searchSource: ISearchSource) {
    const { scroll, taskInstanceFields } = this.settings;

    if (!this.cursorId) {
      throw new Error(`No access to valid PIT ID!`);
    }

    searchSource.setField('pit', {
      id: this.cursorId,
      keep_alive: scroll.duration(taskInstanceFields),
    });

    const searchAfter = this.getSearchAfter();
    if (searchAfter) {
      searchSource.setField('searchAfter', searchAfter);
    }

    this.logger.debug(
      `Executing search request with PIT ID: [${this.formatCursorId(this.cursorId)}]` +
        (searchAfter ? ` search_after: [${searchAfter}]` : '')
    );

    const searchBody: estypes.SearchRequest = searchSource.getSearchRequestBody();
    if (searchBody == null) {
      throw new Error('Could not retrieve the search body!');
    }

    this.logger.debug(() => `Executing search with body: ${JSON.stringify(searchBody)}`);

    const response = await this.searchWithPit(searchBody);

    if (!response) {
      throw new Error(`Response could not be retrieved!`);
    }

    const { rawResponse, ...rawDetails } = response;

    this.logSearchResults(rawDetails, rawResponse);
    this.logger.debug(`Received PIT ID: [${this.formatCursorId(rawResponse.pit_id)}]`);

    return rawResponse;
  }

  public updateIdFromResults(results: Pick<estypes.SearchResponse<unknown>, 'pit_id' | 'hits'>) {
    const cursorId = results.pit_id;
    this.cursorId = cursorId ?? this.cursorId;

    // track the beginning of the next page of search results
    const { hits } = results.hits;
    this.setSearchAfter(hits); // for pit only
  }

  protected getSearchAfter() {
    return this.searchAfter;
  }

  /**
   * For managing the search_after parameter, needed for paging using point-in-time
   */
  protected setSearchAfter(hits: Array<estypes.SearchHit<unknown>>) {
    // Update last sort results for next query. PIT is used, so the sort results
    // automatically include _shard_doc as a tiebreaker
    this.searchAfter = hits[hits.length - 1]?.sort as estypes.SortResults | undefined;
    this.logger.debug(`Received search_after: [${this.searchAfter}]`);
  }

  public async closeCursor() {
    if (this.cursorId) {
      const esClient = this.useInternalUser
        ? this.clients.es.asInternalUser
        : this.clients.es.asCurrentUser;
      this.logger.debug(`Executing close PIT on ${this.formatCursorId(this.cursorId)}`);
      await esClient.closePointInTime({ id: this.cursorId });
    } else {
      this.logger.warn(`No PIT Id to clear!`);
    }
  }

  public getUnableToCloseCursorMessage() {
    return i18nTexts.csvUnableToClosePit();
  }
}
