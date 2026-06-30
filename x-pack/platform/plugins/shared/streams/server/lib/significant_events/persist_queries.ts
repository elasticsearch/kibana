/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GeneratedSignificantEventQuery } from '@kbn/streams-schema';
import { HIGH_SEVERITY_THRESHOLD, normalizeEsqlSafe, QUERY_TYPE_STATS } from '@kbn/streams-schema';
import { v4 } from 'uuid';
import type { KnowledgeIndicatorClient, KIBulkOperation } from '../streams/ki';
import { queryFromLink } from '../streams/ki/knowledge_indicator_client/serializers';
import type { StreamsClient } from '../streams/client';

type PersistedQuery = GeneratedSignificantEventQuery & { id: string };

export interface PersistQueriesResult {
  persistedQueries: PersistedQuery[];
  skippedQueries: GeneratedSignificantEventQuery[];
}

function isRuleEligible(query: GeneratedSignificantEventQuery): boolean {
  return query.type !== QUERY_TYPE_STATS && query.severity_score >= HIGH_SEVERITY_THRESHOLD;
}

export async function persistQueries(
  streamName: string,
  queries: GeneratedSignificantEventQuery[],
  deps: {
    kiClient: KnowledgeIndicatorClient;
    streamsClient: StreamsClient;
  }
): Promise<PersistQueriesResult> {
  const { kiClient, streamsClient } = deps;

  if (queries.length === 0) {
    return { persistedQueries: [], skippedQueries: [] };
  }

  const definition = await streamsClient.getStream(streamName);

  const { [streamName]: existingLinks } = await kiClient.getStreamToQueryLinksMap([streamName]);
  const existingById = new Map(existingLinks.map((link) => [link.query.id, link]));
  const existingEsqls = new Set(
    existingLinks.map((link) => normalizeEsqlSafe(link.query.esql.query))
  );
  const ruleBackedIds = new Set(
    existingLinks.filter((link) => link.rule_backed).map((link) => link.query.id)
  );

  const defaultExpiresAt = kiClient.getDefaultExpiresAt();

  const resolveExpiresAt = (priorId?: string): string | undefined => {
    if (!priorId) return defaultExpiresAt;
    const prior = existingById.get(priorId);
    if (!prior) return defaultExpiresAt;
    if (prior.expires_at) return defaultExpiresAt;
  };

  const standardOps: KIBulkOperation[] = [];
  const ruleEligibleQueries: PersistedQuery[] = [];
  const ruleEligibleExpiresAt = new Map<string, string | undefined>();
  const persistedQueries: PersistedQuery[] = [];
  const skippedQueries: GeneratedSignificantEventQuery[] = [];

  for (const query of queries) {
    const { replaces, ...indexFields } = query;

    const normalizedEsql = normalizeEsqlSafe(query.esql.query);

    if (existingEsqls.has(normalizedEsql)) {
      skippedQueries.push(query);
      continue;
    }

    existingEsqls.add(normalizedEsql);

    if (replaces && existingById.has(replaces)) {
      const queryId = replaces;
      const expiresAt = resolveExpiresAt(queryId);
      if (ruleBackedIds.has(queryId)) {
        ruleEligibleQueries.push({ id: queryId, ...query });
        ruleEligibleExpiresAt.set(queryId, expiresAt);
      } else {
        standardOps.push({
          index: {
            query: { id: queryId, expires_at: expiresAt, ...indexFields, rule_backed: false },
          },
        });
      }
      persistedQueries.push({ ...query, id: queryId });
    } else {
      const id = v4();
      if (isRuleEligible(query)) {
        ruleEligibleQueries.push({ id, ...query });
        ruleEligibleExpiresAt.set(id, defaultExpiresAt);
      } else {
        standardOps.push({
          index: {
            query: { id, expires_at: defaultExpiresAt, ...indexFields, rule_backed: false },
          },
        });
      }
      persistedQueries.push({ ...query, id });
    }
  }

  if (standardOps.length > 0) {
    await kiClient.bulk(streamName, standardOps);
  }

  if (ruleEligibleQueries.length > 0) {
    const ruleEligibleIds = new Set(ruleEligibleQueries.map((q) => q.id));
    await kiClient.replaceStreamQueries(definition, (currentLinks) => [
      ...currentLinks.filter((l) => !ruleEligibleIds.has(l.query.id)).map(queryFromLink),
      ...ruleEligibleQueries.map(({ replaces: _replaces, ...q }) => ({
        ...q,
        expires_at: ruleEligibleExpiresAt.get(q.id),
      })),
    ]);
  }

  return { persistedQueries, skippedQueries };
}
