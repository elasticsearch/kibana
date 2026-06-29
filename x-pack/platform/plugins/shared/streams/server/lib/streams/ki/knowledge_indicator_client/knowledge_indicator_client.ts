/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ComposerSortShorthand } from '@elastic/esql';
import type { Feature, KnowledgeIndicator, QueryLink, StreamQuery } from '@kbn/streams-schema';
import type { Streams } from '@kbn/streams-schema';
import {
  DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG,
  type SignificantEventsTuningConfig,
} from '../../../../../common/significant_events_tuning_config';
import type { SearchMode } from '../../../../../common/queries';
import type { KnowledgeIndicatorType } from '../fields';
import {
  type KIBulkOperation,
  type KnowledgeIndicatorClientDeps,
  type KnowledgeIndicatorDataStreamClient,
  type RuleUnbackedFilter,
} from './types';
import { RevisionReader } from './revision_reader';
import { IndicatorWriter } from './indicator_writer';
import { IndicatorReader } from './indicator_reader';
import { IndicatorSearcher } from './indicator_searcher';
import { QueryRuleOrchestrator } from './query_rule_orchestrator';
import { computeExpiresAt } from './serializers';

export type {
  KIBulkOperation,
  KnowledgeIndicatorClientDeps,
  KnowledgeIndicatorDataStreamClient,
  RuleUnbackedFilter,
};

export class KnowledgeIndicatorClient {
  private readonly writer: IndicatorWriter;
  private readonly reader: IndicatorReader;
  private readonly searcher: IndicatorSearcher;
  private readonly orchestrator: QueryRuleOrchestrator;
  private readonly ttlDays: number;

  constructor(
    deps: KnowledgeIndicatorClientDeps,
    isSignificantEventsEnabled = false,
    config: Pick<
      SignificantEventsTuningConfig,
      'semantic_min_score' | 'rrf_rank_constant' | 'feature_ttl_days'
    > = DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG
  ) {
    const revisionReader = new RevisionReader(deps.esClient, deps.logger);
    this.ttlDays = config.feature_ttl_days;
    this.writer = new IndicatorWriter(
      deps.dataStreamClient,
      deps.logger,
      revisionReader,
      config.feature_ttl_days
    );
    this.reader = new IndicatorReader(revisionReader);
    this.searcher = new IndicatorSearcher(deps.esClient, deps.logger, config, revisionReader);
    this.orchestrator = new QueryRuleOrchestrator(
      deps.rulesManagementClient,
      deps.logger,
      isSignificantEventsEnabled,
      this.writer,
      this.reader
    );
  }

  bulk(stream: string, operations: KIBulkOperation[]) {
    return this.writer.bulk(stream, operations);
  }

  getDefaultExpiresAt(): string {
    return computeExpiresAt(new Date().toISOString(), this.ttlDays);
  }

  deleteIndicators(stream: string) {
    return this.writer.deleteIndicators(stream);
  }

  getFeatures(
    streams: string | string[],
    options?: {
      type?: string[];
      id?: string[];
      minConfidence?: number;
      limit?: number;
      includeExcluded?: boolean;
      sort?: ComposerSortShorthand[];
    }
  ): Promise<{ hits: Feature[] }> {
    return this.reader.getFeatures(streams, options);
  }

  getExcludedFeatures(stream: string): Promise<{ hits: Feature[] }> {
    return this.reader.getExcludedFeatures(stream);
  }

  getFeature(stream: string, id: string): Promise<Feature> {
    return this.reader.getFeature(stream, id);
  }

  getLatestRevisionTimestamp(
    stream: string,
    options?: { types?: string[] }
  ): Promise<{ '@timestamp': string } | null> {
    return this.reader.getLatestRevisionTimestamp(stream, options);
  }

  getQueryLinks(
    streamNames: string[],
    filters?: {
      ruleUnbacked?: RuleUnbackedFilter;
      queryIds?: string[];
      minSeverityScore?: number;
    }
  ): Promise<QueryLink[]> {
    return this.reader.getQueryLinks(streamNames, filters);
  }

  getStreamToQueryLinksMap(streamNames: string[]): Promise<Record<string, QueryLink[]>> {
    return this.reader.getStreamToQueryLinksMap(streamNames);
  }

  bulkGetQueriesByIds(stream: string, ids: string[]): Promise<QueryLink[]> {
    return this.reader.bulkGetQueriesByIds(stream, ids);
  }

  getPromotableUnbackedQueries(filters?: { minSeverityScore?: number }): Promise<QueryLink[]> {
    return this.reader.getPromotableUnbackedQueries(filters);
  }

  findFeaturesByIds(ids: string[]): Promise<Array<{ id: string; stream_name: string }>> {
    return this.reader.findFeaturesByIds(ids);
  }

  findIndicators(
    streams: string | string[],
    query: string,
    options?: {
      types?: KnowledgeIndicatorType[];
      searchMode?: SearchMode;
      limit?: number;
      includeExcluded?: boolean;
    }
  ): Promise<{ hits: KnowledgeIndicator[] }> {
    return this.searcher.findIndicators(streams, query, options);
  }

  findFeatures(
    streams: string | string[],
    query: string,
    options?: { searchMode?: SearchMode; limit?: number; includeExcluded?: boolean }
  ): Promise<{ hits: Feature[] }> {
    return this.searcher.findFeatures(streams, query, options);
  }

  findQueries(
    streams: string | string[],
    query: string,
    filters?: { ruleUnbacked?: RuleUnbackedFilter },
    searchMode?: SearchMode
  ): Promise<QueryLink[]> {
    return this.searcher.findQueries(streams, query, filters, searchMode);
  }

  syncQueries(
    definition: Streams.all.Definition,
    queries: StreamQuery[],
    options?: { currentLinks?: QueryLink[] }
  ): Promise<void> {
    return this.orchestrator.syncQueries(definition, queries, options);
  }

  async replaceStreamQueries(
    definition: Streams.all.Definition,
    getNextQueries: (currentLinks: QueryLink[]) => StreamQuery[]
  ): Promise<void> {
    const { [definition.name]: currentLinks } = await this.getStreamToQueryLinksMap([
      definition.name,
    ]);
    await this.syncQueries(definition, getNextQueries(currentLinks), { currentLinks });
  }

  upsertQuery(definition: Streams.all.Definition, query: StreamQuery): Promise<void> {
    return this.orchestrator.upsertQuery(definition, query);
  }

  deleteQuery(definition: Streams.all.Definition, queryId: string): Promise<void> {
    return this.orchestrator.deleteQuery(definition, queryId);
  }

  deleteAllQueries(streamName: string): Promise<void> {
    return this.orchestrator.deleteAllQueries(streamName);
  }

  promoteQueries(
    definition: Streams.all.Definition,
    queryIds: string[]
  ): Promise<{ promoted: number; skipped_stats: number }> {
    return this.orchestrator.promoteQueries(definition, queryIds);
  }

  promoteUnbackedQueries(args: {
    queryIds?: string[];
    minSeverityScore?: number;
    streamDefinitions: Map<string, Streams.all.Definition>;
  }): Promise<{ promoted: number; skipped_stats: number }> {
    return this.orchestrator.promoteUnbackedQueries(args);
  }

  demoteQueries(
    definition: Streams.all.Definition,
    queryIds: string[]
  ): Promise<{ demoted: number }> {
    return this.orchestrator.demoteQueries(definition, queryIds);
  }
}
