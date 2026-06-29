/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IDataStreamClient } from '@kbn/data-streams';
import { esql } from '@elastic/esql';
import type { ESQLAstExpression } from '@elastic/esql/types';
import type { ElasticsearchClient } from '@kbn/core/server';
import {
  type BulkCreateOptions,
  type CommonSearchOptions,
  type PaginatedSearchOptions,
  type PaginatedResponse,
  throwOnBulkCreateErrors,
} from '../query_utils';
import {
  andWhere,
  inFilter,
  runLatestSourceEsqlQuery,
  runPaginatedLatestSourceEsqlQuery,
  runFindByIdEsqlQuery,
} from '../latest_source_query';
import {
  EVENTS_DATA_STREAM,
  type SignificantEvent,
  type StoredEvent,
  type eventsMappings,
} from './data_stream';
import { FIELD_EVENT_ID, FIELD_DISCOVERY_SLUG } from '../field_names';
import { enrichFromEvidences } from '../utils';

export type EventDataStreamClient = IDataStreamClient<typeof eventsMappings, StoredEvent>;

export interface EventsFilterOptions {
  status?: string[];
  stream?: string[];
  search?: string;
}

export interface EventsPaginatedSearchOptions extends PaginatedSearchOptions, EventsFilterOptions {}

export class EventClient {
  constructor(
    private readonly clients: {
      dataStreamClient: EventDataStreamClient;
      esClient: ElasticsearchClient;
      space: string;
    }
  ) {}

  private buildWhere(options: EventsFilterOptions): ESQLAstExpression | undefined {
    let where: ESQLAstExpression | undefined;
    where = inFilter({ where, field: 'status', values: options.status });
    where = inFilter({ where, field: 'stream_names', values: options.stream });

    if (options.search) {
      const escaped = options.search.toLowerCase().replace(/\\/g, '\\\\').replace(/[*?]/g, '\\$&');
      const pattern = esql.str(`*${escaped}*`);
      where = andWhere(
        where,
        esql.exp`(TO_LOWER(${esql.col('title')}) LIKE ${pattern} OR TO_LOWER(${esql.col(
          'summary'
        )}) LIKE ${pattern})`
      );
    }

    return where;
  }

  async bulkCreate(events: SignificantEvent[], { throwOnFail = false }: BulkCreateOptions = {}) {
    const response = await this.clients.dataStreamClient.create({
      space: this.clients.space,
      documents: events,
    });

    if (throwOnFail) {
      throwOnBulkCreateErrors(response);
    }

    return response;
  }

  async findLatest(options: CommonSearchOptions = {}): Promise<{ hits: SignificantEvent[] }> {
    return runLatestSourceEsqlQuery<SignificantEvent>({
      esClient: this.clients.esClient,
      space: this.clients.space,
      options,
      index: EVENTS_DATA_STREAM,
      groupBy: FIELD_DISCOVERY_SLUG,
    });
  }

  async findLatestPaginated(
    options: EventsPaginatedSearchOptions = {}
  ): Promise<PaginatedResponse<SignificantEvent>> {
    const result = await runPaginatedLatestSourceEsqlQuery<SignificantEvent>({
      esClient: this.clients.esClient,
      space: this.clients.space,
      options,
      index: EVENTS_DATA_STREAM,
      where: this.buildWhere(options),
      groupBy: FIELD_DISCOVERY_SLUG,
    });

    return { ...result, hits: result.hits.map(enrichFromEvidences) };
  }

  async findById(id: string): Promise<{ hits: SignificantEvent[] }> {
    return runFindByIdEsqlQuery<SignificantEvent>({
      esClient: this.clients.esClient,
      space: this.clients.space,
      index: EVENTS_DATA_STREAM,
      idField: FIELD_EVENT_ID,
      idValue: id,
    });
  }

  async findByDiscoverySlug(slug: string): Promise<{ hits: SignificantEvent[] }> {
    return runFindByIdEsqlQuery<SignificantEvent>({
      esClient: this.clients.esClient,
      space: this.clients.space,
      index: EVENTS_DATA_STREAM,
      idField: FIELD_DISCOVERY_SLUG,
      idValue: slug,
    });
  }

  async findLatestBySlugs(slugs: string[]): Promise<Map<string, SignificantEvent>> {
    if (!slugs.length) return new Map();
    const slugLiterals = slugs.map((s) => esql.str(s));
    const where = esql.exp`${esql.col(FIELD_DISCOVERY_SLUG)} IN (${slugLiterals})`;
    const { hits } = await runPaginatedLatestSourceEsqlQuery<SignificantEvent>({
      esClient: this.clients.esClient,
      space: this.clients.space,
      options: { perPage: slugs.length },
      index: EVENTS_DATA_STREAM,
      where,
      groupBy: FIELD_DISCOVERY_SLUG,
    });
    const map = new Map<string, SignificantEvent>();
    for (const event of hits) {
      if (event.discovery_slug) map.set(event.discovery_slug, event);
    }
    return map;
  }
}
