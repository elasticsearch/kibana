/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { EntityType } from '@kbn/entity-store/common';
import type { CriticalityLevel } from '@kbn/security-solution-plugin/common/entity_analytics/asset_criticality/types';
import type { EntityRiskScoreRecord } from '@kbn/security-solution-plugin/common/api/entity_analytics/common';
import { buildDocument, readRiskScores, normalizeScores } from './risk_engine';
import { type entityMaintainerRouteHelpersFactory } from './entity_maintainers';

type IndexListOfDocuments = (docs: Array<Record<string, unknown>>) => Promise<void>;

type CreateAndSyncRuleAndAlerts = (params: {
  alerts?: number;
  riskScore?: number;
  maxSignals?: number;
  query: string;
  riskScoreOverride?: string;
}) => Promise<void>;

interface RetryServiceLike {
  waitForWithTimeout: (
    label: string,
    timeout: number,
    predicate: () => Promise<boolean>
  ) => Promise<void>;
}

type MaintainerRoutesLike = Pick<
  ReturnType<typeof entityMaintainerRouteHelpersFactory>,
  'getMaintainers' | 'runMaintainer' | 'runMaintainerSync' | 'startMaintainer' | 'stopMaintainer'
>;

interface EntityStoreUtilsLike {
  installEntityStoreV2: (body?: {
    entityTypes: string[];
    dataViewPattern?: string;
  }) => Promise<unknown>;
  forceUpdateEntityViaCrud: (params: {
    entityType: EntityType;
    body: Record<string, unknown>;
  }) => Promise<unknown>;
}

export const indexListOfDocumentsFactory = ({
  es,
  log,
  index,
}: {
  es: Client;
  log: ToolingLog;
  index: string;
}) => {
  return async (documents: Array<Record<string, unknown>>): Promise<void> => {
    const operations = documents.flatMap((document) => {
      const { _id, ...source } = document as Record<string, unknown> & { _id?: string };
      const existingDataStream =
        typeof source.data_stream === 'object' && source.data_stream !== null
          ? (source.data_stream as Record<string, unknown>)
          : {};

      const enrichedSource = {
        ...source,
        data_stream: {
          type: (existingDataStream.type as string) ?? 'logs',
          dataset: (existingDataStream.dataset as string) ?? 'testlogs.default',
          namespace: (existingDataStream.namespace as string) ?? 'default',
        },
      };

      return [{ create: { _index: index, _id: _id ?? uuidv4() } }, enrichedSource];
    });

    const response = await es.bulk({ refresh: true, operations });
    const firstError = response.items.find((item) => item.create?.error)?.create?.error;
    if (firstError) {
      log.error(`Failed to index maintainer test document: "${firstError.reason}"`);
      throw new Error(firstError.reason ?? firstError.type ?? 'bulk_create_error');
    }
  };
};

const maintainerLogsProperties = {
  '@timestamp': { type: 'date' },
  data_stream: {
    properties: {
      type: { type: 'keyword' },
      dataset: { type: 'keyword' },
      namespace: { type: 'keyword' },
    },
  },
  event: {
    properties: {
      kind: { type: 'keyword' },
      category: { type: 'keyword' },
      type: { type: 'keyword' },
      outcome: { type: 'keyword' },
      module: { type: 'keyword' },
    },
  },
  host: {
    properties: {
      id: { type: 'keyword' },
      name: { type: 'keyword' },
    },
  },
  user: {
    properties: {
      id: { type: 'keyword' },
      name: { type: 'keyword' },
      email: { type: 'keyword' },
      domain: { type: 'keyword' },
    },
  },
  service: {
    properties: {
      name: { type: 'keyword' },
    },
  },
} as const;

export const setupMaintainerLogsDataStream = async ({
  es,
  index,
  template,
}: {
  es: Client;
  index: string;
  template: string;
}): Promise<void> => {
  await es.indices.deleteIndexTemplate({ name: template }, { ignore: [404] });
  await es.indices.putIndexTemplate({
    name: template,
    index_patterns: [index],
    data_stream: {},
    template: {
      mappings: {
        properties: maintainerLogsProperties,
      },
    },
  });
  await es.indices.deleteDataStream({ name: index }, { ignore: [404] });
  await es.indices.createDataStream({ name: index });
};

export const cleanupMaintainerLogsDataStream = async ({
  es,
  index,
  template,
}: {
  es: Client;
  index: string;
  template: string;
}): Promise<void> => {
  await es.indices.deleteDataStream({ name: index }, { ignore: [404] });
  await es.indices.deleteIndexTemplate({ name: template }, { ignore: [404] });
};

export type MaintainerEntitySeed =
  | {
      kind: 'host';
      hostName: string;
      documentId?: string;
      extraFields?: Record<string, unknown>;
    }
  | {
      kind: 'idp_user';
      userName: string;
      userId?: string;
      userEmail?: string;
      namespaceSource?: string;
      namespaceDataset?: string;
      documentId?: string;
      extraFields?: Record<string, unknown>;
    }
  | {
      kind: 'local_user';
      userName: string;
      hostId: string;
      hostName?: string;
      documentId?: string;
      extraFields?: Record<string, unknown>;
    }
  | {
      kind: 'service';
      serviceName: string;
      documentId?: string;
      extraFields?: Record<string, unknown>;
    };

export interface TestMaintainerEntity {
  seed: MaintainerEntitySeed;
  documentId: string;
  document: Record<string, unknown>;
  expectedEuid: string;
}

const buildTestEntity = (seed: MaintainerEntitySeed): TestMaintainerEntity => {
  const documentId = seed.documentId ?? uuidv4();

  if (seed.kind === 'host') {
    return {
      seed,
      documentId,
      document: buildDocument(
        {
          host: { name: seed.hostName },
          ...(seed.extraFields ?? {}),
        },
        documentId
      ),
      expectedEuid: `host:${seed.hostName}`,
    };
  }

  if (seed.kind === 'idp_user') {
    const namespaceSource = seed.namespaceSource ?? 'okta';
    const expectedNamespace = namespaceSource;
    return {
      seed,
      documentId,
      document: buildDocument(
        {
          user: {
            name: seed.userName,
            ...(seed.userId ? { id: seed.userId } : {}),
            ...(seed.userEmail ? { email: seed.userEmail } : {}),
          },
          event: { kind: ['asset'], category: ['iam'], type: ['user'] },
          'event.module': namespaceSource,
          ...(seed.namespaceDataset ? { 'data_stream.dataset': seed.namespaceDataset } : {}),
          ...(seed.extraFields ?? {}),
        },
        documentId
      ),
      expectedEuid: `user:${seed.userName}@${expectedNamespace}`,
    };
  }

  if (seed.kind === 'service') {
    return {
      seed,
      documentId,
      document: buildDocument(
        {
          service: { name: seed.serviceName },
          event: { kind: 'event', category: 'network', outcome: 'success' },
          ...(seed.extraFields ?? {}),
        },
        documentId
      ),
      expectedEuid: `service:${seed.serviceName}`,
    };
  }

  if (seed.kind === 'local_user') {
    return {
      seed,
      documentId,
      document: buildDocument(
        {
          user: { name: seed.userName },
          host: { id: seed.hostId, ...(seed.hostName ? { name: seed.hostName } : {}) },
          // Local-user path should mirror non-IDP logs extraction contract.
          // Include module=local so risk-score EUID evaluation can resolve local namespace.
          event: { kind: 'event', category: 'network', outcome: 'success', module: 'local' },
          ...(seed.extraFields ?? {}),
        },
        documentId
      ),
      expectedEuid: `user:${seed.userName}@${seed.hostId}@local`,
    };
  }

  throw new Error(`Unknown entity seed kind: ${(seed as MaintainerEntitySeed).kind}`);
};

const buildAlertQueryForDocumentIds = (documentIds: string[]): string =>
  documentIds.map((id) => `id: ${id}`).join(' or ');

const getEntityTypeForTestEntity = (testEntity: TestMaintainerEntity): EntityType => {
  if (testEntity.seed.kind === 'host') {
    return 'host';
  }
  if (testEntity.seed.kind === 'service') {
    return 'service';
  }
  return 'user';
};

export const riskScoreMaintainerScenarioFactory = ({
  indexListOfDocuments,
  createAndSyncRuleAndAlerts,
  entityStoreUtils,
  retry,
  routes,
}: {
  indexListOfDocuments: IndexListOfDocuments;
  createAndSyncRuleAndAlerts: CreateAndSyncRuleAndAlerts;
  entityStoreUtils: EntityStoreUtilsLike;
  retry: RetryServiceLike;
  routes: MaintainerRoutesLike;
}) => {
  const seedDocuments = async (documents: Array<Record<string, unknown>>) => {
    await indexListOfDocuments(documents);
  };

  const seedEntities = async (entities: MaintainerEntitySeed[]) => {
    const testEntities = entities.map(buildTestEntity);
    await seedDocuments(testEntities.map(({ document }) => document));
    return {
      documentIds: testEntities.map(({ documentId }) => documentId),
      testEntities,
    };
  };

  const createAlertsForDocumentIds = async ({
    documentIds,
    alerts,
    riskScore,
    maxSignals,
    riskScoreOverride,
  }: {
    documentIds: string[];
    alerts?: number;
    riskScore?: number;
    maxSignals?: number;
    riskScoreOverride?: string;
  }) => {
    await createAndSyncRuleAndAlerts({
      query: buildAlertQueryForDocumentIds(documentIds),
      alerts: alerts ?? documentIds.length,
      riskScore,
      maxSignals,
      riskScoreOverride,
    });
  };

  const installAndRunMaintainer = async ({
    entityTypes = ['user', 'host'],
    dataViewPattern,
    runMode = 'sync',
    minRuns = 1,
    timeoutMs = 60_000,
  }: {
    entityTypes?: string[];
    dataViewPattern?: string;
    runMode?: 'sync' | 'async';
    minRuns?: number;
    timeoutMs?: number;
  } = {}) => {
    // installEntityStoreV2 stops the maintainer and waits for it to settle
    // after install so tests start from a clean slate.
    await entityStoreUtils.installEntityStoreV2({
      entityTypes,
      dataViewPattern,
    });

    // Always use the synchronous maintainer run endpoint for the initial
    // scoring pass. The maintainer task has a 1-hour interval, so Task
    // Manager won't auto-run it within the test timeout. Using runSoon
    // (runMaintainer) risks a version_conflict_engine_exception if it
    // overlaps with a TM-initiated run from a stale runAt.
    await routes.runMaintainerSync('risk-score');

    if (runMode === 'async') {
      // Start the maintainer so it's in "started" state for callers that need
      // the real TM scheduler path (e.g. stop/start lifecycle tests).
      await routes.startMaintainer('risk-score');
      // After re-enabling, TM may auto-run the task if runAt is stale (set
      // during the original install scheduling). Wait until nextRunAt is in
      // the future and runs are stable, which guarantees any TM auto-run has
      // completed. Without this, the test's subsequent stop/start/runSoon
      // can race with an in-flight TM auto-run.
      let lastSeenRuns = -1;
      await retry.waitForWithTimeout(
        'risk-score maintainer to settle after start in installAndRunMaintainer',
        60_000,
        async () => {
          const response = await routes.getMaintainers(200, ['risk-score']);
          const maintainer = response.body.maintainers.find(
            (m: { id: string; runs: number; nextRunAt?: string | null }) => m.id === 'risk-score'
          );
          if (!maintainer) return false;
          const nextRunAt = (maintainer as { nextRunAt?: string | null }).nextRunAt;
          const isNextRunInFuture = nextRunAt != null && new Date(nextRunAt).getTime() > Date.now();
          if (!isNextRunInFuture) {
            lastSeenRuns = -1;
            return false;
          }
          const runs = maintainer.runs;
          if (runs === lastSeenRuns) return true;
          lastSeenRuns = runs;
          return false;
        }
      );
    }
  };

  const setEntityWatchlists = async ({
    testEntity,
    watchlistIds,
  }: {
    testEntity: TestMaintainerEntity;
    watchlistIds: string[];
  }) => {
    await entityStoreUtils.forceUpdateEntityViaCrud({
      entityType: getEntityTypeForTestEntity(testEntity),
      body: {
        entity: {
          id: testEntity.expectedEuid,
          attributes: {
            watchlists: watchlistIds,
          },
        },
      },
    });
  };

  const setEntityCriticality = async ({
    testEntity,
    criticalityLevel,
  }: {
    testEntity: TestMaintainerEntity;
    criticalityLevel: CriticalityLevel;
  }) => {
    await entityStoreUtils.forceUpdateEntityViaCrud({
      entityType: getEntityTypeForTestEntity(testEntity),
      body: {
        entity: {
          id: testEntity.expectedEuid,
        },
        asset: {
          criticality: criticalityLevel,
        },
      },
    });
  };

  const setEntityResolutionTarget = async ({
    testEntity,
    resolvedToEntityId,
  }: {
    testEntity: TestMaintainerEntity;
    resolvedToEntityId: string;
  }) => {
    await entityStoreUtils.forceUpdateEntityViaCrud({
      entityType: getEntityTypeForTestEntity(testEntity),
      body: {
        entity: {
          id: testEntity.expectedEuid,
          relationships: {
            resolution: {
              resolved_to: resolvedToEntityId,
            },
          },
        },
      },
    });
  };

  const setupAndRun = async ({
    entities,
    alerts,
    riskScore,
    maxSignals,
    riskScoreOverride,
    entityTypes = ['user', 'host'],
    dataViewPattern,
    runMode = 'sync',
    minRuns = 1,
    timeoutMs = 60_000,
  }: {
    entities: MaintainerEntitySeed[];
    alerts?: number;
    riskScore?: number;
    maxSignals?: number;
    riskScoreOverride?: string;
    entityTypes?: string[];
    dataViewPattern?: string;
    runMode?: 'sync' | 'async';
    minRuns?: number;
    timeoutMs?: number;
  }) => {
    const { documentIds, testEntities } = await seedEntities(entities);
    await createAlertsForDocumentIds({
      documentIds,
      alerts,
      riskScore,
      maxSignals,
      riskScoreOverride,
    });
    await installAndRunMaintainer({ entityTypes, dataViewPattern, runMode, minRuns, timeoutMs });
    return { documentIds, testEntities };
  };

  return {
    seedDocuments,
    seedEntities,
    createAlertsForDocumentIds,
    installAndRunMaintainer,
    setEntityWatchlists,
    setEntityCriticality,
    setEntityResolutionTarget,
    setupAndRun,
  };
};

export const riskScoreMaintainerEntityBuilders = {
  host: (
    params: Omit<Extract<MaintainerEntitySeed, { kind: 'host' }>, 'kind'>
  ): MaintainerEntitySeed => ({
    kind: 'host',
    ...params,
  }),
  idpUser: (
    params: Omit<Extract<MaintainerEntitySeed, { kind: 'idp_user' }>, 'kind'>
  ): MaintainerEntitySeed => ({
    kind: 'idp_user',
    ...params,
  }),
  localUser: (
    params: Omit<Extract<MaintainerEntitySeed, { kind: 'local_user' }>, 'kind'>
  ): MaintainerEntitySeed => ({
    kind: 'local_user',
    ...params,
  }),
  service: (
    params: Omit<Extract<MaintainerEntitySeed, { kind: 'service' }>, 'kind'>
  ): MaintainerEntitySeed => ({
    kind: 'service',
    ...params,
  }),
};

/**
 * Returns the normalized score for a specific test entity from a pre-fetched scores array,
 * or undefined if no score exists for that entity yet.
 */
export const findScoreForEntity = (
  normalizedScores: Array<Partial<EntityRiskScoreRecord>>,
  entity: TestMaintainerEntity
): Partial<EntityRiskScoreRecord> | undefined =>
  normalizedScores.find((s) => s.id_value === entity.expectedEuid);

/**
 * Polls until the risk score data stream contains a zero-score document for the given entity ID.
 * Used to assert that reset-to-zero has run for a stale entity.
 */
export const waitForEntityScoreResetToZero = async ({
  es,
  retry,
  entityId,
  timeoutMs = 60_000,
}: {
  es: Client;
  retry: RetryServiceLike;
  entityId: string;
  timeoutMs?: number;
}): Promise<void> => {
  await retry.waitForWithTimeout(
    `risk score reset to zero for ${entityId}`,
    timeoutMs,
    async () => {
      const scores = normalizeScores(await readRiskScores(es));
      return scores
        .filter((s) => s.id_value === entityId)
        .some((s) => s.calculated_score_norm === 0);
    }
  );
};
