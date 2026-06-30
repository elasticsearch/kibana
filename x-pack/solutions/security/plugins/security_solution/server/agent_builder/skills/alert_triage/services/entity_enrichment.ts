/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { getRiskScoreLatestIndex } from '../../../../../common/entity_analytics/risk_engine/indices';
import { getAssetCriticalityIndex } from '../../../../../common/entity_analytics/asset_criticality/indices';

export type EntityKind = 'host' | 'user';

export interface EntityEnrichment {
  /** Entity risk level from the Risk Engine: Critical | High | Moderate | Low | Unknown. */
  riskLevel?: string;
  /** Normalized entity risk score (0-100) from the Risk Engine. */
  riskScoreNorm?: number;
  /** Asset criticality level: extreme_impact | high_impact | medium_impact | low_impact. */
  criticality?: string;
}

/** Keyed by `${kind}:${name}`, e.g. `host:WIN-DC01` or `user:administrator`. */
export type EntityEnrichmentMap = Map<string, EntityEnrichment>;

export const entityKey = (kind: EntityKind, name: string): string => `${kind}:${name}`;

interface EnrichEntitiesParams {
  esClient: ElasticsearchClient;
  spaceId: string;
  logger: Logger;
  hostNames: string[];
  userNames: string[];
}

type HitFields = Record<string, unknown[]>;

const firstString = (fields: HitFields, key: string): string | undefined => {
  const value = fields[key]?.[0];
  return typeof value === 'string' ? value : undefined;
};

const firstNumber = (fields: HitFields, key: string): number | undefined => {
  const value = fields[key]?.[0];
  return typeof value === 'number' ? value : undefined;
};

const upsert = (map: EntityEnrichmentMap, key: string, patch: EntityEnrichment): void => {
  map.set(key, { ...map.get(key), ...patch });
};

/**
 * Fetch the latest Risk Engine score for each host/user and merge into the map.
 * Risk-score-latest docs are nested per entity type (host.risk.* / user.risk.*).
 */
const fetchRiskScores = async (
  { esClient, spaceId, hostNames, userNames }: Omit<EnrichEntitiesParams, 'logger'>,
  map: EntityEnrichmentMap
): Promise<void> => {
  const should: Array<Record<string, unknown>> = [];
  if (hostNames.length > 0) should.push({ terms: { 'host.name': hostNames } });
  if (userNames.length > 0) should.push({ terms: { 'user.name': userNames } });
  if (should.length === 0) return;

  const result = await esClient.search({
    index: getRiskScoreLatestIndex(spaceId),
    size: hostNames.length + userNames.length,
    query: { bool: { should, minimum_should_match: 1 } },
    _source: false,
    fields: [
      'host.name',
      'host.risk.calculated_level',
      'host.risk.calculated_score_norm',
      'user.name',
      'user.risk.calculated_level',
      'user.risk.calculated_score_norm',
    ],
    ignore_unavailable: true,
  });

  for (const hit of result.hits.hits) {
    const fields = (hit.fields ?? {}) as HitFields;
    const hostName = firstString(fields, 'host.name');
    if (hostName) {
      upsert(map, entityKey('host', hostName), {
        riskLevel: firstString(fields, 'host.risk.calculated_level'),
        riskScoreNorm: firstNumber(fields, 'host.risk.calculated_score_norm'),
      });
    }
    const userName = firstString(fields, 'user.name');
    if (userName) {
      upsert(map, entityKey('user', userName), {
        riskLevel: firstString(fields, 'user.risk.calculated_level'),
        riskScoreNorm: firstNumber(fields, 'user.risk.calculated_score_norm'),
      });
    }
  }
};

/**
 * Fetch asset criticality for each host/user and merge into the map. Asset-criticality
 * docs are keyed by `{ id_field, id_value }` (e.g. id_field=host.name, id_value=WIN-DC01).
 */
const fetchCriticalities = async (
  { esClient, spaceId, hostNames, userNames }: Omit<EnrichEntitiesParams, 'logger'>,
  map: EntityEnrichmentMap
): Promise<void> => {
  const should: Array<Record<string, unknown>> = [];
  if (hostNames.length > 0) {
    should.push({
      bool: { filter: [{ term: { id_field: 'host.name' } }, { terms: { id_value: hostNames } }] },
    });
  }
  if (userNames.length > 0) {
    should.push({
      bool: { filter: [{ term: { id_field: 'user.name' } }, { terms: { id_value: userNames } }] },
    });
  }
  if (should.length === 0) return;

  const result = await esClient.search({
    index: getAssetCriticalityIndex(spaceId),
    size: hostNames.length + userNames.length,
    query: { bool: { should, minimum_should_match: 1 } },
    _source: false,
    fields: ['id_field', 'id_value', 'criticality_level'],
    ignore_unavailable: true,
  });

  for (const hit of result.hits.hits) {
    const fields = (hit.fields ?? {}) as HitFields;
    const idField = firstString(fields, 'id_field');
    const idValue = firstString(fields, 'id_value');
    const criticality = firstString(fields, 'criticality_level');
    const kind: EntityKind | undefined =
      idField === 'host.name' ? 'host' : idField === 'user.name' ? 'user' : undefined;
    if (idValue && criticality && kind) {
      upsert(map, entityKey(kind, idValue), { criticality });
    }
  }
};

/**
 * Best-effort enrichment of entities with Risk Engine scores and asset criticality.
 *
 * Both lookups are independent and wrapped so a failure (missing index, insufficient
 * license, transform not running) never breaks triage — it just yields no enrichment for
 * the affected signal. The caller folds whatever is returned into group prioritization.
 */
export const enrichEntities = async ({
  esClient,
  spaceId,
  logger,
  hostNames,
  userNames,
}: EnrichEntitiesParams): Promise<EntityEnrichmentMap> => {
  const map: EntityEnrichmentMap = new Map();
  const uniqueHosts = [...new Set(hostNames)];
  const uniqueUsers = [...new Set(userNames)];
  if (uniqueHosts.length === 0 && uniqueUsers.length === 0) return map;

  const args = { esClient, spaceId, hostNames: uniqueHosts, userNames: uniqueUsers };

  await Promise.all([
    fetchRiskScores(args, map).catch((err) => {
      logger.debug(
        `[alert-triage] entity risk enrichment skipped: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }),
    fetchCriticalities(args, map).catch((err) => {
      logger.debug(
        `[alert-triage] asset criticality enrichment skipped: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }),
  ]);

  return map;
};
