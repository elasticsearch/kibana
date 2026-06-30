/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { compact, intersection, uniq } from 'lodash';
import type { Feature, QueryLink } from '@kbn/significant-events-schema';
import type {
  KnowledgeIndicator,
  KnowledgeIndicatorFeature,
  KnowledgeIndicatorQuery,
  SearchKnowledgeIndicatorsInput,
  SearchKnowledgeIndicatorsOutput,
} from './types';
import { featureToKnowledgeIndicatorFeature, queryLinkToKnowledgeIndicatorQuery } from './mappers';

export const DEFAULT_SEARCH_KNOWLEDGE_INDICATORS_LIMIT = 20;

interface NormalizedParams {
  searchText: string | undefined;
  limit: number;
  includeFeatures: boolean;
  includeQueries: boolean;
}

const isFeatureIndicator = (ki: KnowledgeIndicator): ki is KnowledgeIndicatorFeature =>
  ki.kind === 'feature';

const isQueryIndicator = (ki: KnowledgeIndicator): ki is KnowledgeIndicatorQuery =>
  ki.kind === 'query';

const compareFeatures = (
  current: KnowledgeIndicatorFeature,
  next: KnowledgeIndicatorFeature
): number => {
  const byConfidence = (next.feature.confidence ?? 0) - (current.feature.confidence ?? 0);
  return byConfidence !== 0 ? byConfidence : current.feature.id.localeCompare(next.feature.id);
};

const compareQueries = (
  current: KnowledgeIndicatorQuery,
  next: KnowledgeIndicatorQuery
): number => {
  const byScore = (next.query.severity_score ?? -1) - (current.query.severity_score ?? -1);
  return byScore !== 0 ? byScore : current.query.id.localeCompare(next.query.id);
};

function normalizeParams(params: SearchKnowledgeIndicatorsInput): NormalizedParams {
  const searchText = params.search_text ? params.search_text.trim() : undefined;
  const limit =
    typeof params.limit === 'number' && params.limit > 0
      ? Math.floor(params.limit)
      : DEFAULT_SEARCH_KNOWLEDGE_INDICATORS_LIMIT;
  const kinds = params.kind?.length ? params.kind : undefined;

  return {
    searchText,
    limit,
    includeFeatures: !kinds || kinds.includes('feature'),
    includeQueries: !kinds || kinds.includes('query'),
  };
}

async function resolveStreamNames(
  params: SearchKnowledgeIndicatorsInput,
  getStreamNames: () => Promise<string[]>
): Promise<string[]> {
  const accessible = await getStreamNames();
  const requested = params.stream_names?.length
    ? intersection(uniq(params.stream_names), accessible)
    : accessible;
  return compact(requested.filter((name) => typeof name === 'string' && name.length > 0));
}

async function fetchFeatureIndicators({
  streamNames,
  limit,
  searchText,
  getFeatures,
  onFeatureFetchError,
}: {
  streamNames: string[];
  limit: number;
  searchText: string | undefined;
  getFeatures: (
    streamName: string,
    options: { searchText?: string; limit?: number }
  ) => Promise<Feature[]>;
  onFeatureFetchError?: (streamName: string, error: unknown) => void;
}): Promise<KnowledgeIndicatorFeature[]> {
  const results = await Promise.allSettled(
    streamNames.map((name) => getFeatures(name, { searchText, limit }))
  );

  const indicators: KnowledgeIndicatorFeature[] = [];
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      onFeatureFetchError?.(streamNames[index], result.reason);
      return;
    }
    result.value.forEach((feature) => indicators.push(featureToKnowledgeIndicatorFeature(feature)));
  });

  return indicators;
}

async function fetchQueryIndicators(
  streamNames: string[],
  searchText: string | undefined,
  getQueries: (streamNames: string[], search_text?: string) => Promise<QueryLink[]>
): Promise<KnowledgeIndicatorQuery[]> {
  const links = await getQueries(streamNames, searchText);
  return links.map(queryLinkToKnowledgeIndicatorQuery);
}

function sortIndicators(indicators: KnowledgeIndicator[]): KnowledgeIndicator[] {
  return [...indicators].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'feature' ? -1 : 1;
    if (isFeatureIndicator(a) && isFeatureIndicator(b)) return compareFeatures(a, b);
    if (isQueryIndicator(a) && isQueryIndicator(b)) return compareQueries(a, b);
    return 0;
  });
}

export async function searchKnowledgeIndicators({
  getStreamNames,
  getFeatures,
  getQueries,
  onFeatureFetchError,
  params,
}: {
  getStreamNames(): Promise<string[]>;
  getFeatures(
    streamName: string,
    options: { searchText?: string; limit?: number }
  ): Promise<Feature[]>;
  getQueries(streamNames: string[], search_text?: string): Promise<QueryLink[]>;
  onFeatureFetchError?: (streamName: string, error: unknown) => void;
  params: SearchKnowledgeIndicatorsInput;
}): Promise<SearchKnowledgeIndicatorsOutput> {
  // Step 1: Normalize inputs.
  const normalized = normalizeParams(params);

  // Step 2: Resolve streams (requested ∩ accessible).
  const streamNames = await resolveStreamNames(params, getStreamNames);
  const hasRequestedStreams = Array.isArray(params.stream_names) && params.stream_names.length > 0;
  // Handle the case where no streams are accessible and streams were requested.
  if (hasRequestedStreams && streamNames.length === 0) {
    return { knowledge_indicators: [] };
  }

  // Step 3: Fetch features.
  const features = normalized.includeFeatures
    ? await fetchFeatureIndicators({
        streamNames,
        limit: normalized.limit,
        searchText: normalized.searchText,
        getFeatures,
        onFeatureFetchError,
      })
    : [];

  // Step 4: Fetch queries.
  const queries = normalized.includeQueries
    ? await fetchQueryIndicators(streamNames, normalized.searchText, getQueries)
    : [];

  // Step 5: Merge, sort, and limit.
  const sorted = sortIndicators([...features, ...queries]);
  return { knowledge_indicators: sorted.slice(0, normalized.limit) };
}
