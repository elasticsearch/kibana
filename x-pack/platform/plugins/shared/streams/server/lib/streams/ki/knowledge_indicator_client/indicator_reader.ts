/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql, type ComposerSortShorthand } from '@elastic/esql';
import type { Feature, QueryLink } from '@kbn/streams-schema';
import { QUERY_TYPE_STATS } from '@kbn/streams-schema';
import { isStoredFeatureKnowledgeIndicator, isStoredQueryKnowledgeIndicator } from '../data_stream';
import {
  combineWhere,
  inPredicate,
  IS_NOT_DELETED,
  IS_NOT_EXCLUDED,
  IS_NOT_EXPIRED,
} from '../esql_helpers';
import {
  EXCLUDED,
  FEATURE_TYPE,
  ID,
  KI_TYPE_FEATURE,
  KI_TYPE_QUERY,
  QUERY_RULE_BACKED,
  STREAM_NAME,
  TYPE,
} from '../fields';
import { fromStoredFeature, fromStoredQuery } from './serializers';
import { StatusError } from '../../errors/status_error';
import type { RevisionReader } from './revision_reader';
import type { LatestSourceWhereCondition } from '../../../sig_events/latest_source_query';
import type { RuleUnbackedFilter } from './types';

function ruleUnbackedPostGroupingWhere(
  filter: RuleUnbackedFilter | undefined
): LatestSourceWhereCondition | undefined {
  switch (filter) {
    case 'include':
      return undefined;
    case 'only':
      return esql.exp`${esql.col(QUERY_RULE_BACKED)} == false`;
    case 'exclude':
    default:
      return esql.exp`${esql.col(QUERY_RULE_BACKED)} == true`;
  }
}

export class IndicatorReader {
  constructor(private readonly revisionReader: RevisionReader) {}

  async getFeatures(
    streams: string | string[],
    options: {
      type?: string[];
      id?: string[];
      minConfidence?: number;
      limit?: number;
      includeExcluded?: boolean;
      includeExpired?: boolean;
      sort?: ComposerSortShorthand[];
    } = {}
  ): Promise<{ hits: Feature[] }> {
    const streamNames = Array.isArray(streams) ? streams : [streams];
    if (streamNames.length === 0) {
      return { hits: [] };
    }

    const minConfidenceFilter =
      typeof options.minConfidence === 'number'
        ? esql.exp`\`feature.confidence\` >= ${options.minConfidence}`
        : undefined;

    const featureTypesFilter = options.type?.length
      ? inPredicate(FEATURE_TYPE, options.type)
      : undefined;

    const where = combineWhere(
      inPredicate(TYPE, [KI_TYPE_FEATURE]),
      inPredicate(STREAM_NAME, streamNames),
      inPredicate(ID, options.id ?? [])
    );

    const postGroupingWhere = combineWhere(
      IS_NOT_DELETED,
      options.includeExcluded ? undefined : IS_NOT_EXCLUDED,
      options.includeExpired ? undefined : IS_NOT_EXPIRED,
      featureTypesFilter,
      minConfidenceFilter
    );

    const docs = await this.revisionReader.fetchLatestRevisions(
      where,
      postGroupingWhere,
      options.sort ?? [['feature.confidence', 'DESC']],
      options.limit
    );
    const hits = docs.filter(isStoredFeatureKnowledgeIndicator).map(fromStoredFeature);
    return { hits };
  }

  async getExcludedFeatures(stream: string): Promise<{ hits: Feature[] }> {
    const where = combineWhere(
      inPredicate(TYPE, [KI_TYPE_FEATURE]),
      inPredicate(STREAM_NAME, [stream])
    );
    const docs = await this.revisionReader.fetchLatestRevisions(
      where,
      esql.exp`${esql.col(EXCLUDED)} == true`,
      [['@timestamp', 'DESC']]
    );
    const hits = docs.filter(isStoredFeatureKnowledgeIndicator).map(fromStoredFeature);
    return { hits };
  }

  async getFeature(stream: string, id: string): Promise<Feature> {
    const { hits } = await this.getFeatures(stream, { id: [id] });
    if (hits.length === 0) {
      throw new StatusError(`Feature ${id} not found`, 404);
    }
    return hits[0];
  }

  /**
   * Pure ES|QL probe: returns the timestamp of the most recent **active**
   * feature revision for a stream (neither tombstoned nor excluded).
   *
   * Only active revisions are counted on purpose. The throttle that
   * consumes this value (`shouldIdentifyFeatures`) must rerun
   * identification whenever the active feature set has been wiped.
   */
  async getLatestRevisionTimestamp(
    stream: string,
    options: { types?: string[] } = {}
  ): Promise<{ '@timestamp': string } | null> {
    const featureTypesFilter = options.types?.length
      ? inPredicate(FEATURE_TYPE, options.types)
      : undefined;
    const where = combineWhere(
      inPredicate(TYPE, [KI_TYPE_FEATURE]),
      inPredicate(STREAM_NAME, [stream])
    );

    const docs = await this.revisionReader.fetchLatestRevisions(
      where,
      combineWhere(IS_NOT_DELETED, IS_NOT_EXCLUDED, IS_NOT_EXPIRED, featureTypesFilter)
    );
    if (docs.length === 0) return null;

    const latest = docs.reduce((best, current) =>
      current['@timestamp'] > best['@timestamp'] ? current : best
    );
    return { '@timestamp': latest['@timestamp'] };
  }

  async getQueryLinks(
    streamNames: string[],
    filters?: {
      ruleUnbacked?: RuleUnbackedFilter;
      queryIds?: string[];
      minSeverityScore?: number;
    }
  ): Promise<QueryLink[]> {
    const minSeverityFilter =
      typeof filters?.minSeverityScore === 'number'
        ? esql.exp`\`query.severity_score\` >= ${filters.minSeverityScore}`
        : undefined;

    const where = combineWhere(
      inPredicate(TYPE, [KI_TYPE_QUERY]),
      inPredicate(STREAM_NAME, streamNames),
      inPredicate(ID, filters?.queryIds ?? [])
    );

    const postGroupingWhere = combineWhere(
      IS_NOT_DELETED,
      ruleUnbackedPostGroupingWhere(filters?.ruleUnbacked ?? 'exclude'),
      minSeverityFilter
    );

    const docs = await this.revisionReader.fetchLatestRevisions(where, postGroupingWhere);
    return docs.filter(isStoredQueryKnowledgeIndicator).map(fromStoredQuery);
  }

  async getStreamToQueryLinksMap(streamNames: string[]): Promise<Record<string, QueryLink[]>> {
    const links = await this.getQueryLinks(streamNames, { ruleUnbacked: 'include' });
    const result: Record<string, QueryLink[]> = {};
    for (const name of streamNames) {
      result[name] = [];
    }
    for (const link of links) {
      if (!result[link.stream_name]) {
        result[link.stream_name] = [];
      }
      result[link.stream_name].push(link);
    }
    return result;
  }

  async bulkGetQueriesByIds(stream: string, ids: string[]): Promise<QueryLink[]> {
    if (ids.length === 0) return [];
    return this.getQueryLinks([stream], { queryIds: ids, ruleUnbacked: 'include' });
  }

  /**
   * Returns all unbacked, non-STATS queries across streams. Filtering by
   * `query.query_type != stats` happens via the post-grouping WHERE so the
   * latest revision drives the decision.
   */
  async getPromotableUnbackedQueries(filters?: {
    minSeverityScore?: number;
  }): Promise<QueryLink[]> {
    const minSeverityFilter =
      typeof filters?.minSeverityScore === 'number'
        ? esql.exp`\`query.severity_score\` >= ${filters.minSeverityScore}`
        : undefined;

    const where = inPredicate(TYPE, [KI_TYPE_QUERY]);

    const postGroupingWhere = combineWhere(
      IS_NOT_DELETED,
      esql.exp`\`query.rule_backed\` == false`,
      esql.exp`\`query.query_type\` != ${esql.str(QUERY_TYPE_STATS)}`,
      minSeverityFilter
    );

    const docs = await this.revisionReader.fetchLatestRevisions(where, postGroupingWhere);
    return docs.filter(isStoredQueryKnowledgeIndicator).map(fromStoredQuery);
  }

  async findFeaturesByIds(ids: string[]): Promise<Array<{ id: string; stream_name: string }>> {
    if (ids.length === 0) return [];
    const where = combineWhere(inPredicate(TYPE, [KI_TYPE_FEATURE]), inPredicate(ID, ids));
    const docs = await this.revisionReader.fetchLatestRevisions(where, IS_NOT_DELETED);
    return docs.filter(isStoredFeatureKnowledgeIndicator).map((doc) => ({
      id: doc.id,
      stream_name: doc['stream.name'],
    }));
  }
}
