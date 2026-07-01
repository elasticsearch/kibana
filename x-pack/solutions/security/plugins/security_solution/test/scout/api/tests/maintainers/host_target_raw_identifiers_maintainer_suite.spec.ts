/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/api';
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
  seedUserEntity,
  triggerMaintainerRun,
  waitForRelationshipIds,
  waitForEntityStoreRunning,
  assertNoRelationshipId,
  getRelationshipIds,
} from '../../fixtures/maintainers/helpers';

/**
 * Config describing one host-TARGET raw_identifiers-based relationship
 * maintainer under test. Generic over the relationship key so the same suite
 * covers `administers`, `depends_on`, and any future maintainer that resolves
 * `entity.relationships.<key>.raw_identifiers.host.name` into `<key>.ids` as a
 * namespace-less `host:<name>` EUID.
 *
 * The actor may be a host OR a user (administers' AD `managedObjects` applies to
 * both). The default tests seed a host actor; set `userActorNamespace` to also
 * exercise a user actor pointing at a host target. The defining axis here is the
 * TARGET shape (host), not the actor type — the engine derives the actor type
 * from its `entity.id` prefix.
 *
 * User → user maintainers (e.g. `supervises`) resolve to namespace-suffixed
 * `user:<id>@<ns>` EUIDs — see `user_target_raw_identifiers_maintainer_suite.spec.ts`.
 */
export interface HostTargetRawIdentifiersMaintainerSuiteConfig {
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
  /**
   * When set, the suite adds a test seeding a USER actor (in this IDP namespace)
   * that administers a host target, asserting the user → host path resolves.
   * Use for maintainers whose actor may be a user (e.g. administers).
   */
  userActorNamespace?: string;
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
 *   registerHostTargetRawIdentifiersMaintainerSuite({
 *     maintainerId: 'administers',
 *     relationshipKey: 'administers',
 *     entityPrefix: 'adm',
 *   });
 */
const registerHostTargetRawIdentifiersMaintainerSuite = (
  config: HostTargetRawIdentifiersMaintainerSuiteConfig
): void => {
  const { maintainerId, relationshipKey, entityPrefix, requiredEntitySource, userActorNamespace } =
    config;
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

      apiTest.beforeAll(async ({ apiClient, esClient, samlAuth }) => {
        // `admin` is required: the install route enforces `securitySolution` +
        // `entity-analytics` Kibana privileges that lower roles (e.g. platform_engineer)
        // do not hold.
        const credentials = await samlAuth.asInteractiveUser('admin');
        defaultHeaders = { ...credentials.cookieHeader, ...PUBLIC_HEADERS };
        internalHeaders = { ...credentials.cookieHeader, ...INTERNAL_HEADERS };

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

      apiTest.afterAll(async ({ apiClient, esClient }) => {
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

          // The maintainer task auto-runs once on registration (ensureScheduled with
          // an interval schedules the first run ~immediately), persisting a watermark
          // before this test seeds anything. So we cannot rely on a pristine "no
          // watermark" state: seed the actor with a FUTURE last_seen so it is always
          // past whatever watermark the startup run left, and trigger synchronously
          // so the run completes before we poll.
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

      if (userActorNamespace) {
        apiTest(
          `resolves ${relationshipKey}.ids for a USER actor pointing at a host target (user → host)`,
          async ({ apiClient, esClient }) => {
            const tFqdn = targetFqdn('user-actor');
            const target = targetId('user-actor');
            // The user actor's EUID is namespace-suffixed; the host TARGET it
            // resolves to is namespace-less (`host:<fqdn>`), proving the engine
            // derives the actor type from its entity.id prefix and resolves a
            // host target regardless of actor type.
            const userActor = `user:${entityPrefix}-admin@${domain}@${userActorNamespace}`;

            await seedHostEntity(esClient, { entityId: target, hostName: tFqdn });
            await seedUserEntity(esClient, {
              entityId: userActor,
              namespace: userActorNamespace,
              email: `${entityPrefix}-admin@${domain}`,
              entitySource: requiredEntitySource,
              relationship: { key: relationshipKey, hostNames: [tFqdn] },
            });

            await triggerMaintainerRun(apiClient, internalHeaders, maintainerId, { sync: true });

            await waitForRelationshipIds(esClient, relationshipKey, userActor, target);
          }
        );
      }
    }
  );
};

// For each new host-target maintainer, create a new spec file and call registerHostTargetRawIdentifiersMaintainerSuite from there.
// the shared suite seeds the host target, runs the maintainer, and asserts
// the entity.lifecycle.last_seen watermark gate end-to-end.
//
// administers sets userActorNamespace so the suite also covers the user → host
// actor path (AD `managedObjects` applies to both user and host actors).
//
// Note: user → user maintainers (e.g. supervises) resolve to namespace-suffixed
// target EUIDs, which this host-target seeding does not cover. Those live in
// user_target_raw_identifiers_maintainer_suite.spec.ts — the
// @kbn/eslint/scout_max_one_describe rule allows only one root describe per
// file, so they cannot be registered alongside this suite.
registerHostTargetRawIdentifiersMaintainerSuite({
  maintainerId: 'administers',
  relationshipKey: 'administers',
  entityPrefix: 'adm',
  requiredEntitySource: 'entityanalytics_ad',
  userActorNamespace: 'active_directory',
});
