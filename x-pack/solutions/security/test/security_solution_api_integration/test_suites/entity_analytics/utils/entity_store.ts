/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityType } from '@kbn/entity-store/common';
import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { waitFor } from '@kbn/detections-response-ftr-services';
import expect from '@kbn/expect';
import { ENTITY_LATEST, ENTITY_STORE_ROUTES, getEntitiesAlias } from '@kbn/entity-store/common';
import type { FtrProviderContext } from '../../../ftr_provider_context';
import { elasticAssetCheckerFactory } from './elastic_asset_checker';
import { dataViewRouteHelpersFactory } from './data_view';
import { entityMaintainerRouteHelpersFactory } from './entity_maintainers';

export const EntityStoreUtils = (
  getService: FtrProviderContext['getService'],
  namespace: string = 'default'
) => {
  const es = getService('es');
  const log = getService('log');
  const retry = getService('retry');
  const supertest = getService('supertest');
  const dataView = dataViewRouteHelpersFactory(supertest, namespace);
  const {
    expectTransformExists,
    expectTransformNotFound,
    expectEnrichPolicyExists,
    expectEnrichPolicyNotFound,
    expectComponentTemplateExists,
    expectComponentTemplateNotFound,
    expectIngestPipelineExists,
    expectIngestPipelineNotFound,
    expectEntitiesIndexExists,
    expectEntitiesIndexNotFound,
  } = elasticAssetCheckerFactory(getService);

  log.debug(`EntityStoreUtils namespace: ${namespace}`);

  const cleanEngines = async () => {
    let settingsUrl = '/internal/kibana/settings';
    if (namespace !== 'default') {
      settingsUrl = `/s/${namespace}${settingsUrl}`;
    }

    // Temporarily enable V2 so the uninstall API isn't blocked by the
    // feature flag middleware (which returns 403 when V2 is disabled).
    // A previous test's cleanup may have already disabled V2.
    await supertest
      .post(settingsUrl)
      .set('kbn-xsrf', 'true')
      .set('x-elastic-internal-origin', 'Kibana')
      .send({ changes: { 'securitySolution:entityStoreEnableV2': true } })
      .expect(200);

    // Use the supported uninstall API so maintainers are removed via
    // entityMaintainersClient.removeAll() and don't leak task state between tests.
    let uninstallUrl = '/api/security/entity_store/uninstall';
    if (namespace !== 'default') {
      uninstallUrl = `/s/${namespace}${uninstallUrl}`;
    }
    try {
      await supertest
        .post(uninstallUrl)
        .set('kbn-xsrf', 'true')
        .set('x-elastic-internal-origin', 'Kibana')
        .set('elastic-api-version', '2023-10-31')
        .send({ entityTypes: ['user', 'host', 'service'] })
        .expect(200);
    } catch (e) {
      log.debug(`Entity store not installed, skipping uninstall during cleanup: ${e.message}`);
    }

    // Disable V2 to leave a clean slate for the next test.
    await supertest
      .post(settingsUrl)
      .set('kbn-xsrf', 'true')
      .set('x-elastic-internal-origin', 'Kibana')
      .send({ changes: { 'securitySolution:entityStoreEnableV2': null } })
      .expect(200);
  };

  const initEntityEngineForEntityType = async (entityType: EntityType) => {
    log.info(
      `Initializing engine for entity type ${entityType} in namespace ${namespace || 'default'}`
    );
    let installUrl = '/api/security/entity_store/install';
    if (namespace !== 'default') {
      installUrl = `/s/${namespace}${installUrl}`;
    }
    const res = await supertest
      .post(installUrl)
      .set('kbn-xsrf', 'true')
      .set('x-elastic-internal-origin', 'Kibana')
      .set('elastic-api-version', '2023-10-31')
      .send({ entityTypes: [entityType] });

    if (res.status !== 200) {
      log.error(`Failed to initialize engine for entity type ${entityType}`);
      log.error(JSON.stringify(res.body));
    }

    expect(res.status).to.eql(200);
  };

  const initEntityEngineForEntityTypesAndWait = async (entityTypes: EntityType[]) => {
    await Promise.all(entityTypes.map((entityType) => initEntityEngineForEntityType(entityType)));

    await retry.waitForWithTimeout(
      `Engines to start for entity types: ${entityTypes.join(', ')}`,
      60_000,
      async () => {
        let statusUrl = '/api/security/entity_store/status';
        if (namespace !== 'default') {
          statusUrl = `/s/${namespace}${statusUrl}`;
        }
        const { body } = await supertest
          .get(statusUrl)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'Kibana')
          .set('elastic-api-version', '2023-10-31')
          .expect(200);
        if (body.engines.every((engine: any) => engine.status === 'started')) {
          return true;
        }
        if (body.engines.some((engine: any) => engine.status === 'error')) {
          throw new Error(`Engines not started: ${JSON.stringify(body)}`);
        }
        return false;
      }
    );
  };

  const waitForEngineStatus = async (entityType: EntityType, status: string) => {
    await retry.waitForWithTimeout(
      `Engine for entity type ${entityType} to be in status ${status}`,
      60_000,
      async () => {
        let statusUrl = '/api/security/entity_store/status';
        if (namespace !== 'default') {
          statusUrl = `/s/${namespace}${statusUrl}`;
        }
        const { body: statusBody } = await supertest
          .get(statusUrl)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'Kibana')
          .set('elastic-api-version', '2023-10-31')
          .expect(200);
        const body = statusBody.engines.find((e: { type: string }) => e.type === entityType) ?? {
          status: 'not_found',
        };
        log.debug(`Engine status for ${entityType}: ${body.status}`);

        if (status !== 'error' && body.status === 'error') {
          // If we are not expecting an error, throw the error to improve logging
          throw new Error(`Engine not started: ${JSON.stringify(body)}`);
        }

        return body.status === status;
      }
    );
  };

  const enableEntityStore = async (body: Record<string, unknown> = {}) => {
    let installUrl = '/api/security/entity_store/install';
    if (namespace !== 'default') {
      installUrl = `/s/${namespace}${installUrl}`;
    }
    const res = await supertest
      .post(installUrl)
      .set('kbn-xsrf', 'true')
      .set('x-elastic-internal-origin', 'Kibana')
      .set('elastic-api-version', '2023-10-31')
      .send(body);
    if (res.status !== 200) {
      log.error(`Failed to enable entity store`);
      log.error(JSON.stringify(res.body));
    }
    expect(res.status).to.eql(200);
    return res;
  };

  const expectTransformStatus = async (
    transformId: string,
    exists: boolean,
    attempts: number = 5,
    delayMs: number = 2000
  ) => {
    let currentAttempt = 1;
    while (currentAttempt <= attempts) {
      try {
        await es.transform.getTransform({ transform_id: transformId });
        if (!exists) {
          throw new Error(`Expected transform ${transformId} to not exist, but it does`);
        }
        return; // Transform exists, exit the loop
      } catch (e) {
        if (currentAttempt === attempts) {
          if (exists) {
            throw new Error(`Expected transform ${transformId} to exist, but it does not: ${e}`);
          } else {
            return; // Transform does not exist, exit the loop
          }
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        currentAttempt++;
      }
    }
  };

  const expectEngineAssetsExist = async (entityType: EntityType) => {
    await expectTransformExists(`entities-v1-latest-security_${entityType}_${namespace}`);
    await expectEnrichPolicyExists(
      `entity_store_field_retention_${entityType}_${namespace}_v1.0.0`
    );
    await expectComponentTemplateExists(`security_${entityType}_${namespace}-latest@platform`);
    await expectIngestPipelineExists(`security_${entityType}_${namespace}-latest@platform`);
    await expectEntitiesIndexExists(entityType, namespace);
  };

  const expectEngineAssetsDoNotExist = async (entityType: EntityType) => {
    await expectTransformNotFound(`entities-v1-latest-security_${entityType}_${namespace}`);
    await expectEnrichPolicyNotFound(
      `entity_store_field_retention_${entityType}_${namespace}_v1.0.0`
    );
    await expectComponentTemplateNotFound(`security_${entityType}_${namespace}-latest@platform`);
    await expectIngestPipelineNotFound(`security_${entityType}_${namespace}-latest@platform`);
    await expectEntitiesIndexNotFound(entityType, namespace);
  };

  const searchEntitiesV2 = async (
    filter: string,
    opts: { size?: number; source?: string[] } = {}
  ) => {
    let url = '/api/security/entity_store/entities';
    if (namespace !== 'default') {
      url = `/s/${namespace}${url}`;
    }
    const res = await supertest
      .get(url)
      .set('kbn-xsrf', 'true')
      .set('x-elastic-internal-origin', 'Kibana')
      .set('elastic-api-version', '2023-10-31')
      .query({
        filter,
        ...(opts.size !== undefined ? { size: opts.size } : {}),
        ...(opts.source ? { source: opts.source } : {}),
      });
    if (res.status !== 200) {
      log.error(`Failed to search entities`);
      log.error(JSON.stringify(res.body));
    }
    expect(res.status).to.eql(200);
    return res;
  };

  const deleteEntityV2 = async (entityId: string) => {
    let url = '/api/security/entity_store/entities/';
    if (namespace !== 'default') {
      url = `/s/${namespace}${url}`;
    }
    const res = await supertest
      .delete(url)
      .set('kbn-xsrf', 'true')
      .set('x-elastic-internal-origin', 'Kibana')
      .set('elastic-api-version', '2023-10-31')
      .send({ entityId });
    if (res.status !== 200) {
      log.error(`Failed to delete entity ${entityId}`);
      log.error(JSON.stringify(res.body));
    }
    expect(res.status).to.eql(200);
    return res;
  };

  const enableEntityStoreV2 = async (body: any = { entityTypes: ['user', 'host'] }) => {
    let settingsUrl = '/internal/kibana/settings';
    if (namespace !== 'default') {
      settingsUrl = `/s/${namespace}${settingsUrl}`;
    }

    await retry.waitForWithTimeout(
      'entityStoreEnableV2 uiSetting to read back as enabled',
      60_000,
      async () => {
        // Try to enable
        await supertest
          .post(settingsUrl)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'Kibana')
          .send({ changes: { 'securitySolution:entityStoreEnableV2': true } })
          .expect(200);

        // Check that it worked
        const settingsRes = await supertest
          .get(settingsUrl)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'Kibana')
          .expect(200);
        return (
          settingsRes.body?.settings?.['securitySolution:entityStoreEnableV2']?.userValue === true
        );
      }
    );

    let url = '/api/security/entity_store/install';
    if (namespace !== 'default') {
      url = `/s/${namespace}${url}`;
    }
    const res = await supertest
      .post(url)
      .set('kbn-xsrf', 'true')
      .set('x-elastic-internal-origin', 'Kibana')
      .set('elastic-api-version', '2023-10-31')
      .send(body);
    if (res.status !== 201 && res.status !== 200) {
      log.error(`Failed to install entity store v2`);
      log.error(JSON.stringify(res.body));
    }
    expect([200, 201]).to.contain(res.status);

    return res;
  };

  const installEntityStoreV2 = async (body: any = { entityTypes: ['user', 'host'] }) => {
    // Default to logs-* to avoid coupling extraction to ecs_compliant fixture state.
    const {
      dataViewPattern = 'logs-*',
      waitForEntities = true,
      entityTypes = ['user', 'host'],
      stopMaintainerAfterInstall = true,
      maintainerAutoStart: _ignoredAutoStart,
      ...installBody
    } = body;
    const installRequestBody = { ...installBody, entityTypes };
    await dataView.create('security-solution', dataViewPattern);

    const res = await enableEntityStoreV2(installRequestBody);

    await retry.waitForWithTimeout(
      `Engines to start for entity types: ${entityTypes.join(', ')}`,
      60_000,
      async () => {
        let statusUrl = '/api/security/entity_store/status';
        if (namespace !== 'default') {
          statusUrl = `/s/${namespace}${statusUrl}`;
        }
        const { body: enginesBody } = await supertest
          .get(statusUrl)
          .set('kbn-xsrf', 'true')
          .set('x-elastic-internal-origin', 'Kibana')
          .set('elastic-api-version', '2023-10-31')
          .expect(200);
        if (enginesBody.engines.every((engine: any) => engine.status === 'started')) {
          return true;
        }
        if (enginesBody.engines.some((engine: any) => engine.status === 'error')) {
          throw new Error(`Engines not started: ${JSON.stringify(enginesBody)}`);
        }
        return false;
      }
    );

    const fromDateISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const toDateISO = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    for (const entityType of entityTypes) {
      let extractUrl = `/internal/security/entity_store/${entityType}/force_log_extraction`;
      if (namespace !== 'default') {
        extractUrl = `/s/${namespace}${extractUrl}`;
      }
      log.info(`Force extracting entities for type: ${entityType}`);
      const extractRes = await supertest
        .post(extractUrl)
        .set('kbn-xsrf', 'true')
        .set('x-elastic-internal-origin', 'Kibana')
        .set('elastic-api-version', '2')
        .send({ fromDateISO, toDateISO });
      log.info(
        `Force extraction for ${entityType}: status=${extractRes.status}, body=${JSON.stringify(
          extractRes.body
        )}`
      );
      expect([200, 202]).to.contain(extractRes.status);
    }
    if (waitForEntities) {
      await waitForEntityStoreEntities({ es, log, count: 1, namespace });
    }

    // Install schedules the risk-score maintainer with enabled: true.
    // Wait for any TM auto-run to complete, then stop the task so tests
    // can set up preconditions before triggering scoring via the sync
    // run_now route. The run_now route calls ensureRiskScoreSetup before
    // scoring, so resources are created on first use even if we stop the
    // maintainer before its first TM execution. Tests that need the
    // maintainer running (e.g. async lifecycle tests) pass
    // stopMaintainerAfterInstall: false to skip this block.
    if (stopMaintainerAfterInstall) {
      const maintainerRoutes = entityMaintainerRouteHelpersFactory(
        supertest,
        namespace !== 'default' ? namespace : undefined
      );

      // Wait for any TM auto-run to finish BEFORE stopping. Install
      // schedules the task with enabled=true so TM may auto-run it
      // immediately. Calling stopMaintainer (bulkUpdateState) while TM
      // is mid-execution causes a version_conflict_engine_exception on
      // TM's write-back, permanently wedging the task in "running" state.
      let lastSeenRuns = -1;
      await retry.waitForWithTimeout(
        'risk-score maintainer to be idle before stop after install',
        60_000,
        async () => {
          const response = await maintainerRoutes.getMaintainers(200, ['risk-score']);
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

      try {
        await maintainerRoutes.stopMaintainer('risk-score');
      } catch (e) {
        log.debug(`stopMaintainer after install failed (may not be registered yet): ${e.message}`);
      }
    }

    return res;
  };

  const forceUpdateEntityViaCrud = async ({
    entityType,
    body,
  }: {
    entityType: EntityType;
    body: Record<string, unknown>;
  }) => {
    let url = `/api/security/entity_store/entities/${entityType}?force=true`;
    if (namespace !== 'default') {
      url = `/s/${namespace}${url}`;
    }

    const response = await supertest
      .put(url)
      .set('kbn-xsrf', 'true')
      .set('x-elastic-internal-origin', 'Kibana')
      .set('elastic-api-version', '2023-10-31')
      .send(body);

    if (response.status !== 200) {
      log.error(`Failed to force-update entity via CRUD API for type "${entityType}"`);
      log.error(JSON.stringify(response.body));
    }
    expect(response.status).to.eql(200);
    return response;
  };

  const unlinkEntitiesViaResolutionApi = async ({ entityIds }: { entityIds: string[] }) => {
    let url: string = ENTITY_STORE_ROUTES.public.RESOLUTION_UNLINK;
    if (namespace !== 'default') {
      url = `/s/${namespace}${url}`;
    }

    const response = await supertest
      .post(url)
      .set('kbn-xsrf', 'true')
      .set('x-elastic-internal-origin', 'Kibana')
      .set('elastic-api-version', '2023-10-31')
      .send({ entity_ids: entityIds });

    if (response.status !== 200) {
      log.error('Failed to unlink entities via resolution API');
      log.error(JSON.stringify(response.body));
    }
    expect(response.status).to.eql(200);
    return response;
  };

  const forceExtractEntities = async ({
    entityType,
    fromDateISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    toDateISO = new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }: {
    entityType: EntityType;
    fromDateISO?: string;
    toDateISO?: string;
  }) => {
    let url = `/internal/security/entity_store/${entityType}/force_log_extraction`;
    if (namespace !== 'default') {
      url = `/s/${namespace}${url}`;
    }

    log.info(`Force extracting entities for type: ${entityType}`);
    const response = await supertest
      .post(url)
      .set('kbn-xsrf', 'true')
      .set('x-elastic-internal-origin', 'Kibana')
      .set('elastic-api-version', '2')
      .send({ fromDateISO, toDateISO });

    log.info(
      `Force extraction for ${entityType}: status=${response.status}, body=${JSON.stringify(
        response.body
      )}`
    );
    expect([200, 202]).to.contain(response.status);
    return response;
  };

  return {
    cleanEngines,
    deleteEntityV2,
    searchEntitiesV2,
    initEntityEngineForEntityTypesAndWait,
    expectTransformStatus,
    expectEngineAssetsExist,
    expectEngineAssetsDoNotExist,
    enableEntityStore,
    enableEntityStoreV2,
    installEntityStoreV2,
    forceUpdateEntityViaCrud,
    unlinkEntitiesViaResolutionApi,
    forceExtractEntities,
    waitForEngineStatus,
    initEntityEngineForEntityType,
  };
};

/**
 * Reads entities from the Entity Store V2 latest index.
 */
export const readEntityStoreEntities = async (
  es: Client,
  namespace: string = 'default'
): Promise<Array<{ entity: { id: string; risk?: Record<string, unknown> } }>> => {
  const index = getEntitiesAlias(ENTITY_LATEST, namespace);
  try {
    const results = await es.search({ index, size: 1000 });
    return results.hits.hits.map(
      (hit: any) => hit._source as { entity: { id: string; risk?: Record<string, unknown> } }
    );
  } catch (e: any) {
    if (e.meta?.statusCode === 404) {
      return [];
    }
    throw e;
  }
};

/**
 * Waits for at least `count` entities to be present in the Entity Store V2 latest index.
 */
export const waitForEntityStoreEntities = async ({
  es,
  log,
  count = 1,
  namespace = 'default',
}: {
  es: Client;
  log: ToolingLog;
  count?: number;
  namespace?: string;
}): Promise<void> => {
  await waitFor(
    async () => {
      const entities = await readEntityStoreEntities(es, namespace);
      return entities.length >= count;
    },
    'waitForEntityStoreEntities',
    log
  );
};

/**
 * Polls until a specific entity document appears in the Entity Store V2 latest index,
 * optionally requiring specific attribute values (criticality, watchlist membership).
 */
export const waitForEntityStoreDoc = async ({
  es,
  retry,
  entityId,
  timeoutMs = 60_000,
  requireCriticality,
  requiredWatchlistId,
  namespace = 'default',
}: {
  es: Client;
  retry: {
    waitForWithTimeout: (
      label: string,
      timeout: number,
      predicate: () => Promise<boolean>
    ) => Promise<void>;
  };
  entityId: string;
  timeoutMs?: number;
  requireCriticality?: 'high_impact' | 'absent';
  requiredWatchlistId?: string;
  namespace?: string;
}): Promise<void> => {
  const index = getEntitiesAlias(ENTITY_LATEST, namespace);
  await retry.waitForWithTimeout(
    `entity store doc present for ${entityId}`,
    timeoutMs,
    async () => {
      const response = await es.search({
        index,
        size: 1,
        query: { term: { 'entity.id': entityId } },
      });
      const hit = response.hits.hits[0]?._source as
        | {
            asset?: { criticality?: string };
            entity?: { attributes?: { watchlists?: string[] } };
          }
        | undefined;
      if (!hit) {
        return false;
      }

      if (requireCriticality === 'high_impact' && hit.asset?.criticality !== 'high_impact') {
        return false;
      }
      if (requireCriticality === 'absent' && hit.asset?.criticality != null) {
        return false;
      }
      if (
        requiredWatchlistId &&
        !(hit.entity?.attributes?.watchlists?.includes(requiredWatchlistId) ?? false)
      ) {
        return false;
      }
      return true;
    }
  );
};

/**
 * Asserts that risk scores have been dual-written to the Entity Store.
 * Checks that entities in the store have `entity.risk` fields populated.
 */
export const assertRiskScoresWrittenToEntityStore = async ({
  es,
  log,
  expectedEntityCount,
  namespace = 'default',
}: {
  es: Client;
  log: ToolingLog;
  expectedEntityCount: number;
  namespace?: string;
}): Promise<void> => {
  const entities = await readEntityStoreEntities(es, namespace);
  const entitiesWithRisk = entities.filter(
    (entity) => entity.entity?.risk && entity.entity.risk.calculated_score_norm !== undefined
  );
  log.info(
    `Entity store dual-write check: ${entitiesWithRisk.length}/${entities.length} entities have risk scores (expected ${expectedEntityCount})`
  );
  expect(entitiesWithRisk.length).to.eql(expectedEntityCount);
};
