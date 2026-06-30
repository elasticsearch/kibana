/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from 'elasticsearch-8.x';
import { Client, HttpConnection } from 'elasticsearch-8.x'; // Switch to `@elastic/elasticsearch` when the CI cluster is upgraded.

type QueryDslQueryContainer = estypes.QueryDslQueryContainer;
type SearchRequest = estypes.SearchRequest;
type MsearchRequestItem = estypes.MsearchRequestItem;
import type { ToolingLog } from '@kbn/tooling-log';

interface ClientOptions {
  node: string;
  username: string;
  password: string;
}

export interface Headers {
  readonly [key: string]: string[];
}

interface Request {
  method: string;
  headers: Headers;
  body?: { original: string };
}

interface Response {
  status_code: number;
}

interface Transaction {
  id: string;
  name: string;
  type: string;
  duration: { us: number };
  span_count: { started: number };
}

export interface Document {
  '@timestamp': string;
  labels?: { journeyName: string; maxUsersCount: string };
  parent?: { id: string };
  service: { name: string; environment: string };
  trace: { id: string };
  transaction: Transaction;
}

export interface SpanDocument extends Omit<Document, 'transaction'> {
  transaction: { id: string };
  span: {
    id: string;
    name: string;
    action: string;
    duration: { us: number };
    db?: { statement?: string };
  };
}

export interface TransactionDocument extends Omit<Document, 'service'> {
  service: { name: string; environment: string; version: string };
  processor: string;
  url: { path: string; query?: string };
  http: {
    request: Request;
    response: Response;
  };
}

const addBooleanFilter = (filter: { field: string; value: string }): QueryDslQueryContainer => {
  return {
    bool: {
      should: [
        {
          match_phrase: {
            [filter.field]: filter.value,
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
};

const addRangeFilter = (range: { startTime: string; endTime: string }): QueryDslQueryContainer => {
  return {
    range: {
      '@timestamp': {
        format: 'strict_date_optional_time',
        gte: range.startTime,
        lte: range.endTime,
      },
    },
  };
};

export class ESClient {
  client: Client;
  log: ToolingLog;
  tracesIndex: string = '.ds-traces-apm-default*';

  constructor(options: ClientOptions, log: ToolingLog) {
    this.client = new Client({
      node: options.node,
      auth: {
        username: options.username,
        password: options.password,
      },
      Connection: HttpConnection,
      requestTimeout: 30_000,
    });
    this.log = log;
  }

  async getTransactions<T>(queryFilters: QueryDslQueryContainer[]) {
    const searchRequest: SearchRequest = {
      index: this.tracesIndex,
      sort: [
        {
          '@timestamp': {
            order: 'asc',
            unmapped_type: 'boolean',
          },
        },
      ],
      size: 10000,
      query: {
        bool: {
          filter: [
            {
              bool: {
                filter: queryFilters,
              },
            },
          ],
        },
      },
    };

    this.log.debug(`Search request: ${JSON.stringify(searchRequest)}`);
    const result = await this.client.search<T>(searchRequest);
    this.log.debug(`Search result: ${JSON.stringify(result)}`);
    return result?.hits?.hits;
  }

  async getFtrServiceTransactions(buildId: string, journeyName: string) {
    const filters = [
      { field: 'service.name', value: 'functional test runner' },
      { field: 'processor.event', value: 'transaction' },
      { field: 'labels.testBuildId', value: buildId },
      { field: 'labels.journeyName', value: journeyName },
      { field: 'labels.performancePhase', value: 'TEST' },
    ];
    const queryFilters = filters.map((filter) => addBooleanFilter(filter));
    return await this.getTransactions<Document>(queryFilters);
  }

  async getKibanaServerTransactions(
    buildId: string,
    journeyName: string,
    range?: { startTime: string; endTime: string }
  ) {
    const filters = [
      { field: 'transaction.type', value: 'request' },
      { field: 'processor.event', value: 'transaction' },
      { field: 'labels.testBuildId', value: buildId },
      { field: 'labels.journeyName', value: journeyName },
    ];
    const queryFilters = filters.map((filter) => addBooleanFilter(filter));
    if (range) {
      queryFilters.push(addRangeFilter(range));
    }
    return await this.getTransactions<TransactionDocument>(queryFilters);
  }

  getMsearchRequestItem = (queryFilters: QueryDslQueryContainer[]): MsearchRequestItem => {
    return {
      query: {
        bool: {
          filter: [
            {
              bool: {
                filter: queryFilters,
              },
            },
          ],
        },
      },
    };
  };

  async getSpans(transactionIds: string[]) {
    const searches = new Array<MsearchRequestItem>();

    for (const transactionId of transactionIds) {
      const filters = [{ field: 'parent.id', value: transactionId }];
      const queryFilters = filters.map((filter) => addBooleanFilter(filter));
      const requestItem = this.getMsearchRequestItem(queryFilters);
      searches.push({ index: this.tracesIndex }, requestItem);
    }
    this.log.debug(`Msearch request: ${JSON.stringify(searches)}`);
    const result = await this.client.msearch<SpanDocument>({
      searches,
    });
    this.log.debug(`Msearch result: ${JSON.stringify(result)}`);
    return result.responses.flatMap((response) => {
      if ('error' in response) {
        throw new Error(`Msearch failure: ${JSON.stringify(response.error)}`);
      } else if (response.hits.hits.length > 0) {
        return response.hits.hits;
      } else {
        return [];
      }
    });
  }
}
