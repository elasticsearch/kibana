/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/api';
import { FF_ENABLE_ENTITY_STORE_V2 } from '@kbn/entity-store/common';
import {
  PUBLIC_HEADERS,
  INTERNAL_HEADERS,
  ENTITY_STORE_ROUTES,
  ENTITY_STORE_TAGS,
  LATEST_ALIAS,
  LATEST_INDEX,
  UPDATES_INDEX,
} from '../../fixtures/maintainers/constants';
import {
  clearEntityStoreIndices,
  seedHostEntity,
  triggerMaintainerRun,
  waitForRelationshipIds,
  waitForEntityStoreRunning,
  assertNoRelationshipId,
  getRelationshipIds,
} from '../../fixtures/maintainers/helpers';

/**
 * Config describing one raw_identifiers-based relationship maintainer under test.
 * Generic over the relationship key so the same suite covers `administers`,
 * `depends_on`, `supervises`, and any future maintainer that resolves
 * `entity.relationships.<key>.raw_identifiers.host.name` into `<key>.ids`.
 */
export interface RawIdentifiersMaintainerSuiteConfig {
  /** Maintainer id used by the run route, e.g. 'administers'. */
  maintainerId: string;
  /** Relationship key written under entity.relationships.<key>, e.g. 'administers'. */
  relationshipKey: string;
  /** Short prefix used to namespace the seeded entity ids so suites don't collide. */
  entityPrefix: string;
  /**
   * When set, actor entities are seeded with this entity.source value, and the
   * suite adds a negative test asserting that an actor with a *different* source
   * is not resolved. Use this for maintainers that filter by entity.source
   * (e.g. 'entityanalytics_ad' for the administers maintainer).
   */
  requiredEntitySource?: string;
}

/**
 * Shared end-to-end suite for a raw_identifiers-based relationship maintainer's
 * incremental watermark (entity.lifecycle.last_seen).
 *
 * The maintainer persists a `lastProcessedTimestamp` after each run and, on the
 * next run, only processes entities whose `entity.lifecycle.last_seen` is
 * strictly greater than that watermark. These tests prove both sides of that
 * gate: an entity newer than the watermark is resolved, and an entity at/older
 * than the watermark is skipped.
 *
 * Invoke from a thin spec file:
 *
 *   registerRawIdentifiersMaintainerSuite({
 *     maintainerId: 'administers',
 *     relationshipKey: 'administers',
 *     entityPrefix: 'adm',
 *   });
 */
const registerRawIdentifiersMaintainerSuite = (
  config: RawIdentifiersMaintainerSuiteConfig
): void => {
  const { maintainerId, relationshipKey, entityPrefix, requiredEntitySource } = config;
  const domain = 'acmecrm.com';
  const actorId = (suffix: string) => `host:${entityPrefix}-${suffix}.${domain}`;
  const targetFqdn = (suffix: string) => `${entityPrefix}-${suffix}-target.${domain}`;
  const targetId = (suffix: string) => `host:${targetFqdn(suffix)}`;

  apiTest.describe(
    `Entity Store ${maintainerId} maintainer (raw_identifiers)`,
    { tag: ENTITY_STORE_TAGS },
    () => {
      // Each test may issue multiple synchronous maintainer runs plus polling loops.
      // The default 60s Playwright timeout is too tight; use the same 3-minute
      // ceiling as Playwright's global setup projects.
      apiTest.setTimeout(180_000);

      let defaultHeaders: Record<string, string>;
      let internalHeaders: Record<string, string>;

      apiTest.beforeAll(async ({ apiClient, esClient, kbnClient, samlAuth }) => {
        // `admin` is required: the install route enforces `securitySolution` +
        // `entity-analytics` Kibana privileges that lower roles (e.g. platform_engineer)
        // do not hold.
        const credentials = await samlAuth.asInteractiveUser('admin');
        defaultHeaders = { ...credentials.cookieHeader, ...PUBLIC_HEADERS };
        internalHeaders = { ...credentials.cookieHeader, ...INTERNAL_HEADERS };

        await kbnClient.uiSettings.update({ [FF_ENABLE_ENTITY_STORE_V2]: true });

        await esClient.indices.delete({
          index: [LATEST_INDEX, UPDATES_INDEX],
          ignore_unavailable: true,
        });

        const installResponse = await apiClient.post(ENTITY_STORE_ROUTES.public.INSTALL, {
          headers: defaultHeaders,
          responseType: 'json',
          body: {},
        });
        expect([200, 201]).toContain(installResponse.statusCode);

        // Wait for all engine components to finish provisioning before seeding —
        // the `running` status flips before the latest alias is ready.
        await waitForEntityStoreRunning(apiClient, defaultHeaders);

        const initResponse = await apiClient.post(
          ENTITY_STORE_ROUTES.internal.ENTITY_MAINTAINERS_INIT,
          { headers: internalHeaders, responseType: 'json', body: {} }
        );
        expect([200, 201]).toContain(initResponse.statusCode);
      });

      apiTest.beforeEach(async ({ esClient }) => {
        await esClient.deleteByQuery({
          index: LATEST_ALIAS,
          refresh: true,
          query: { match_all: {} },
          ignore_unavailable: true,
        });
      });

      apiTest.afterAll(async ({ apiClient, esClient, kbnClient }) => {
        await kbnClient.uiSettings.unset(FF_ENABLE_ENTITY_STORE_V2);

        const response = await apiClient.post(ENTITY_STORE_ROUTES.public.UNINSTALL, {
          headers: defaultHeaders,
          responseType: 'json',
          body: {},
        });
        expect(response.statusCode).toBe(200);
        await clearEntityStoreIndices(esClient);
      });

      apiTest(
        `resolves ${relationshipKey}.ids for a freshly-seen actor`,
        async ({ apiClient, esClient }) => {
          const actor = actorId('fresh');
          const tFqdn = targetFqdn('fresh');
          const target = targetId('fresh');

          // The maintainer task auto-runs once on registration (ensureScheduled
          // fires ~immediately after init), persisting a watermark before this
          // test seeds anything. Seed the actor with a future last_seen so it is
          // always newer than whatever watermark the startup run left.
          const futureTs = new Date(Date.now() + 3_600_000).toISOString();

          await seedHostEntity(esClient, { entityId: target, hostName: tFqdn });
          await seedHostEntity(esClient, {
            entityId: actor,
            hostName: `${entityPrefix}-fresh.${domain}`,
            relationship: { key: relationshipKey, hostNames: [tFqdn] },
            entitySource: requiredEntitySource,
            lastSeen: futureTs,
            firstSeen: futureTs,
          });

          await triggerMaintainerRun(apiClient, internalHeaders, maintainerId, { sync: true });

          await waitForRelationshipIds(esClient, relationshipKey, actor, target);
        }
      );

      apiTest(
        'skips an actor whose last_seen is older than the watermark, resolves a newer one',
        async ({ apiClient, esClient }) => {
          // Priming run: sets the watermark before we seed stale/fresh actors.
          // Must be synchronous so the watermark is persisted before we proceed.
          const primingActor = actorId('prime');
          const primingTargetFqdn = targetFqdn('prime');
          const primingTarget = targetId('prime');

          await seedHostEntity(esClient, { entityId: primingTarget, hostName: primingTargetFqdn });
          await seedHostEntity(esClient, {
            entityId: primingActor,
            hostName: `${entityPrefix}-prime.${domain}`,
            relationship: { key: relationshipKey, hostNames: [primingTargetFqdn] },
            entitySource: requiredEntitySource,
          });

          await triggerMaintainerRun(apiClient, internalHeaders, maintainerId, { sync: true });
          await waitForRelationshipIds(esClient, relationshipKey, primingActor, primingTarget);

          // staleActor: last_seen in the past → older than the priming run's start watermark → skipped
          // freshActor: last_seen after the priming run started → newer than watermark → resolved
          const staleTargetFqdn = targetFqdn('stale');
          const staleTarget = targetId('stale');
          const staleActor = actorId('stale');

          const freshTargetFqdn = targetFqdn('fresh2');
          const freshTarget = targetId('fresh2');
          const freshActor = actorId('fresh2');

          const pastTs = new Date(Date.now() - 3_600_000).toISOString();
          const futureTs = new Date(Date.now() + 3_600_000).toISOString();

          await seedHostEntity(esClient, { entityId: staleTarget, hostName: staleTargetFqdn });
          await seedHostEntity(esClient, { entityId: freshTarget, hostName: freshTargetFqdn });

          await seedHostEntity(esClient, {
            entityId: staleActor,
            hostName: `${entityPrefix}-stale.${domain}`,
            relationship: { key: relationshipKey, hostNames: [staleTargetFqdn] },
            lastSeen: pastTs,
            firstSeen: pastTs,
            entitySource: requiredEntitySource,
          });
          await seedHostEntity(esClient, {
            entityId: freshActor,
            hostName: `${entityPrefix}-fresh2.${domain}`,
            relationship: { key: relationshipKey, hostNames: [freshTargetFqdn] },
            lastSeen: futureTs,
            firstSeen: futureTs,
            entitySource: requiredEntitySource,
          });

          await triggerMaintainerRun(apiClient, internalHeaders, maintainerId, { sync: true });

          await waitForRelationshipIds(esClient, relationshipKey, freshActor, freshTarget);
          await assertNoRelationshipId(esClient, relationshipKey, staleActor, staleTarget);
        }
      );

      apiTest(
        `writes only targets that exist as entities, drops phantom raw_identifiers`,
        async ({ apiClient, esClient }) => {
          const actor = actorId('multi');
          const existingTargetFqdn = targetFqdn('multi-real');
          const existingTarget = targetId('multi-real');
          const phantomFqdn = `${entityPrefix}-multi-phantom.${domain}`;
          // phantomTarget is intentionally NOT seeded — it has no entity document.

          const futureTs = new Date(Date.now() + 3_600_000).toISOString();

          // Seed the real target entity and the actor referencing both targets.
          await seedHostEntity(esClient, {
            entityId: existingTarget,
            hostName: existingTargetFqdn,
          });
          await seedHostEntity(esClient, {
            entityId: actor,
            hostName: `${entityPrefix}-multi.${domain}`,
            relationship: {
              key: relationshipKey,
              hostNames: [existingTargetFqdn, phantomFqdn],
            },
            entitySource: requiredEntitySource,
            lastSeen: futureTs,
            firstSeen: futureTs,
          });

          await triggerMaintainerRun(apiClient, internalHeaders, maintainerId, { sync: true });

          // Wait until the real target appears (sync run has settled, this absorbs refresh lag).
          await waitForRelationshipIds(esClient, relationshipKey, actor, existingTarget);

          // Read back the full ids array and assert it contains exactly the real target —
          // the phantom FQDN must never appear because it has no entity document.
          const ids = await getRelationshipIds(esClient, relationshipKey, actor);
          const phantomEuid = `host:${phantomFqdn}`;
          expect(ids).toContain(existingTarget);
          expect(ids).not.toContain(phantomEuid);
        }
      );

      if (requiredEntitySource) {
        apiTest(
          `skips an actor whose entity.source is not '${requiredEntitySource}'`,
          async ({ apiClient, esClient }) => {
            const tFqdn = targetFqdn('src');
            const target = targetId('src');
            const wrongSourceActor = actorId('src-wrong');

            await seedHostEntity(esClient, { entityId: target, hostName: tFqdn });
            // Actor has the correct raw_identifiers but entity.source from a different
            // integration — the maintainer's entity.source filter must exclude it.
            await seedHostEntity(esClient, {
              entityId: wrongSourceActor,
              hostName: `${entityPrefix}-src-wrong.${domain}`,
              relationship: { key: relationshipKey, hostNames: [tFqdn] },
              entitySource: 'elastic_defend',
            });

            await triggerMaintainerRun(apiClient, internalHeaders, maintainerId, { sync: true });

            await assertNoRelationshipId(esClient, relationshipKey, wrongSourceActor, target);
          }
        );
      }
    }
  );
};

// Add a new entry here as each maintainer is onboarded (depends_on, supervises, …);
// the shared suite seeds host entities, runs the maintainer, and asserts the
// entity.lifecycle.last_seen watermark gate end-to-end.
registerRawIdentifiersMaintainerSuite({
  maintainerId: 'administers',
  relationshipKey: 'administers',
  entityPrefix: 'adm',
  requiredEntitySource: 'entityanalytics_ad',
});
