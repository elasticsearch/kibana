/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import type SuperTest from 'supertest';
import { getEntitiesAlias, ENTITY_LATEST } from '@kbn/entity-store/common';
import type { AssetCriticalityLevel, EntityRiskLevels } from '@kbn/entity-store/common';
import { hashEuid } from '@kbn/entity-store/common/domain/euid';
import type { ScoutLogger } from '@kbn/scout';
import { waitForCondition } from './wait_for_condition';

const COMMON_HEADERS = {
  'elastic-api-version': '2023-10-31',
};

const MUTATING_HEADERS = {
  ...COMMON_HEADERS,
  'kbn-xsrf': 'true',
};

const ENTITY_STORE_INSTALL_HEADERS = {
  ...MUTATING_HEADERS,
  'x-elastic-internal-origin': 'Kibana',
};

export async function installEntityStoreV2AndWait({
  supertest,
  log,
  entityTypes = ['user', 'host'],
  timeoutMs = 120_000,
}: {
  supertest: SuperTest.Agent;
  log: ScoutLogger;
  entityTypes?: string[];
  timeoutMs?: number;
}): Promise<void> {
  log.info(`[eval-setup] installing entity store v2 (entityTypes=${entityTypes.join(',')})`);
  const installRes = await supertest
    .post('/api/security/entity_store/install')
    .set(ENTITY_STORE_INSTALL_HEADERS)
    .send({ entityTypes });
  if (installRes.status !== 200 && installRes.status !== 201) {
    throw new Error(
      `Entity Store V2 install failed (${installRes.status}): ${JSON.stringify(installRes.body)}`
    );
  }

  await waitForCondition(
    async () => {
      const res = await supertest.get('/api/security/entity_store/status').set(COMMON_HEADERS);
      if (res.status !== 200) return false;
      const status = (res.body as { status?: string }).status;
      if (status === 'error') {
        throw new Error(`Entity Store V2 is in error state: ${JSON.stringify(res.body)}`);
      }
      return status === 'running';
    },
    { label: 'entity store v2 status=running', timeoutMs, log }
  );
}

interface SeedEntity {
  euid: string;
  riskLevel?: EntityRiskLevels;
  riskScoreNorm?: number;
  assetCriticality?: AssetCriticalityLevel;
}

export async function bulkIndexEntities({
  esClient,
  entities,
  namespace = 'default',
}: {
  esClient: ElasticsearchClient;
  entities: readonly SeedEntity[];
  namespace?: string;
}): Promise<void> {
  if (entities.length === 0) return;

  const latestAlias = getEntitiesAlias(ENTITY_LATEST, namespace);
  const now = new Date().toISOString();

  const operations = entities.flatMap(({ euid, riskLevel, riskScoreNorm, assetCriticality }) => {
    const [type, displayName] = euid.split(':');

    const hasRisk = riskLevel !== undefined || riskScoreNorm !== undefined;
    const doc: Record<string, unknown> = {
      '@timestamp': now,
      entity: {
        id: euid,
        EngineMetadata: { Type: type },
        ...(hasRisk && {
          risk: {
            ...(riskLevel !== undefined && { calculated_level: riskLevel }),
            ...(riskScoreNorm !== undefined && { calculated_score_norm: riskScoreNorm }),
          },
        }),
      },
      [type]: { name: displayName },
      ...(assetCriticality !== undefined && { asset: { criticality: assetCriticality } }),
    };

    return [{ index: { _index: latestAlias, _id: hashEuid(euid) } }, doc];
  });

  await esClient.bulk({ refresh: true, operations });
}

export async function deleteWatchlistsByName({
  supertest,
  names,
}: {
  supertest: SuperTest.Agent;
  names: readonly string[];
}): Promise<void> {
  const listRes = await supertest.get('/api/entity_analytics/watchlists/list').set(COMMON_HEADERS);
  const existing = (listRes.body as Array<{ id?: string; name?: string }>) ?? [];
  for (const w of existing) {
    if (w.id && w.name && names.includes(w.name)) {
      await supertest.delete(`/api/entity_analytics/watchlists/${w.id}`).set(MUTATING_HEADERS);
    }
  }
}

export async function createWatchlist({
  supertest,
  watchlist,
}: {
  supertest: SuperTest.Agent;
  watchlist: { name: string; description?: string; riskModifier: number };
}): Promise<{ id: string }> {
  const res = await supertest
    .post('/api/entity_analytics/watchlists')
    .set(MUTATING_HEADERS)
    .send(watchlist);
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(
      `Failed to create watchlist "${watchlist.name}" (${res.status}): ${JSON.stringify(res.body)}`
    );
  }
  const id = (res.body as { id?: string }).id;
  if (!id) {
    throw new Error(
      `Create response for "${watchlist.name}" did not include an id: ${JSON.stringify(res.body)}`
    );
  }
  return { id };
}

export async function assignEntitiesToWatchlist({
  supertest,
  watchlistId,
  euids,
}: {
  supertest: SuperTest.Agent;
  watchlistId: string;
  euids: readonly string[];
}): Promise<void> {
  if (euids.length === 0) return;
  const res = await supertest
    .post(`/api/entity_analytics/watchlists/${watchlistId}/entities/assign`)
    .set(MUTATING_HEADERS)
    .send({ euids });
  if (res.status !== 200) {
    throw new Error(
      `Failed to assign entities to watchlist ${watchlistId} (${res.status}): ${JSON.stringify(
        res.body
      )}`
    );
  }
}

/**
 * Calls `deleteEntityEngines` for teardown
 * Failures are logged as warnings rather than thrown
 */
export async function deleteEntityEngines({
  quickApiClient,
  log,
}: {
  quickApiClient: {
    deleteEntityEngines: (opts: { query: { delete_data: boolean } }) => Promise<unknown>;
  };
  log: ScoutLogger;
}): Promise<void> {
  try {
    await quickApiClient.deleteEntityEngines({ query: { delete_data: true } });
  } catch (err) {
    log.warning(`deleteEntityEngines failed during teardown: ${(err as Error).message}`);
  }
}
