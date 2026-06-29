/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';
import type { IDataStreamClient } from '@kbn/data-streams';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { ESQLAstExpression } from '@elastic/esql/types';
import {
  type CommonSearchOptions,
  type PaginatedSearchOptions,
  type PaginatedResponse,
} from '../query_utils';
import {
  runLatestSourceEsqlQuery,
  runPaginatedLatestSourceEsqlQuery,
  runFindByIdEsqlQuery,
  runFindByIdsEsqlQuery,
  runGetProcessedIds,
} from '../latest_source_query';
import {
  DISCOVERIES_DATA_STREAM,
  type Discovery,
  type StoredDiscovery,
  type discoveriesMappings,
} from './data_stream';
import { FIELD_DISCOVERY_ID, FIELD_DISCOVERY_SLUG } from '../field_names';

const PROCESSED_CHUNK_SIZE = 250;

export type DiscoveryDataStreamClient = IDataStreamClient<
  typeof discoveriesMappings,
  StoredDiscovery
>;

const KIND_HANDLED = 'handled' satisfies Discovery['kind'];
const KIND_CLEARANCE = 'clearance' satisfies Discovery['kind'];

export class DiscoveryClient {
  constructor(
    private readonly clients: {
      dataStreamClient: DiscoveryDataStreamClient;
      esClient: ElasticsearchClient;
      space: string;
    }
  ) {}

  async bulkCreate(discoveries: Discovery[]) {
    return this.clients.dataStreamClient.create({
      space: this.clients.space,
      documents: discoveries,
    });
  }

  private buildWhere(): ESQLAstExpression {
    const where: ESQLAstExpression = esql.exp`${esql.col('kind')} != ${esql.str(KIND_HANDLED)}`;

    return where;
  }

  async findLatest(options: CommonSearchOptions = {}): Promise<{ hits: Discovery[] }> {
    const result = await runLatestSourceEsqlQuery<Discovery>({
      esClient: this.clients.esClient,
      space: this.clients.space,
      options,
      index: DISCOVERIES_DATA_STREAM,
      where: this.buildWhere(),
      groupBy: FIELD_DISCOVERY_SLUG,
    });

    const processedSlugs = await this.getProcessedSlugs(
      result.hits.map((h) => h.discovery_slug).filter((slug): slug is string => Boolean(slug))
    );
    return {
      hits: result.hits.map((raw) => ({
        ...raw,
        processed: processedSlugs.has(raw.discovery_slug ?? ''),
      })),
    };
  }

  async findLatestPaginated(
    options: PaginatedSearchOptions = {}
  ): Promise<PaginatedResponse<Discovery>> {
    const result = await runPaginatedLatestSourceEsqlQuery<Discovery>({
      esClient: this.clients.esClient,
      space: this.clients.space,
      options,
      index: DISCOVERIES_DATA_STREAM,
      where: this.buildWhere(),
      groupBy: FIELD_DISCOVERY_SLUG,
    });

    if (!result.hits.length) return result;

    const processedSlugs = await this.getProcessedSlugs(
      result.hits.map((h) => h.discovery_slug).filter((slug): slug is string => Boolean(slug))
    );

    return {
      ...result,
      hits: result.hits.map((raw) => ({
        ...raw,
        processed: processedSlugs.has(raw.discovery_slug),
      })),
    };
  }

  private async getProcessedSlugs(slugs: string[]): Promise<Set<string>> {
    return runGetProcessedIds({
      esClient: this.clients.esClient,
      space: this.clients.space,
      index: DISCOVERIES_DATA_STREAM,
      idField: FIELD_DISCOVERY_SLUG,
      idValues: slugs,
      stateKinds: ['discovery', KIND_CLEARANCE],
      handledKind: KIND_HANDLED,
      chunkSize: PROCESSED_CHUNK_SIZE,
    });
  }

  async findById(discoveryId: string): Promise<{ hits: Discovery[] }> {
    return runFindByIdEsqlQuery<Discovery>({
      esClient: this.clients.esClient,
      space: this.clients.space,
      index: DISCOVERIES_DATA_STREAM,
      idField: FIELD_DISCOVERY_ID,
      idValue: discoveryId,
    });
  }

  async findByIds(discoveryIds: string[]): Promise<{ hits: Discovery[] }> {
    return runFindByIdsEsqlQuery<Discovery>({
      esClient: this.clients.esClient,
      space: this.clients.space,
      index: DISCOVERIES_DATA_STREAM,
      idField: FIELD_DISCOVERY_ID,
      idValues: discoveryIds,
    });
  }

  async findBySlug(slug: string): Promise<{ hits: Discovery[] }> {
    return runFindByIdEsqlQuery<Discovery>({
      esClient: this.clients.esClient,
      space: this.clients.space,
      index: DISCOVERIES_DATA_STREAM,
      idField: FIELD_DISCOVERY_SLUG,
      idValue: slug,
    });
  }
}
