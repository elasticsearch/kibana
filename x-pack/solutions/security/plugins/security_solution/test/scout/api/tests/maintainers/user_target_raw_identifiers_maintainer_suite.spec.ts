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
} from '../../fixtures/maintainers/constants';
import {
  clearEntityStoreIndices,
  getRelationshipIds,
  seedUserEntity,
  triggerMaintainerRun,
  waitForRelationshipIds,
  assertNoRelationshipId,
} from '../../fixtures/maintainers/helpers';

/**
 * Config describing one user-TARGET raw_identifiers-based relationship
 * maintainer under test. Generic over the relationship key so the same suite
 * covers `supervises` and any future user → user maintainer.
 *
 * Unlike the host-target suite in
 * `host_target_raw_identifiers_maintainer_suite.spec.ts`, these maintainers
 * union all three raw_identifiers fields (user.email, user.id, user.name) into
 * a user EUID with the IDP namespace suffix (`user:<value>@<ns>`), with
 * VALUES() deduplicating identical EUIDs within each actor group. Both actor
 * and target are user entities, so this suite seeds user entities (not hosts)
 * and asserts the entity.lifecycle.last_seen watermark gate end-to-end.
 */
interface UserTargetRawIdentifiersMaintainerSuiteConfig {
  /** Maintainer id used by the run route, e.g. 'supervises'. */
  maintainerId: string;
  /** Relationship key written under entity.relationships.<key>, e.g. 'supervises'. */
  relationshipKey: string;
  /** Short prefix used to namespace the seeded entity ids so suites don't collide. */
  entityPrefix: string;
  /** IDP namespace suffix on the user EUID (and seeded entity.namespace), e.g. 'okta'. */
  namespace: string;
  /** entity.source the maintainer filters on (e.g. 'entityanalytics_okta'). */
  requiredEntitySource: string;
}

const registerUserTargetRawIdentifiersMaintainerSuite = (
  config: UserTargetRawIdentifiersMaintainerSuiteConfig
): void => {
  const { maintainerId, relationshipKey, entityPrefix, namespace, requiredEntitySource } = config;
  const domain = 'acmecrm.com';
  const targetEmail = (suffix: string) => `${entityPrefix}-${suffix}-mgr@${domain}`;
  const userId = (email: string) => `user:${email}@${namespace}`;
  const actorEmail = (suffix: string) => `${entityPrefix}-${suffix}@${domain}`;

  apiTest.describe(
    `Entity Store ${maintainerId} maintainer (raw_identifiers, user → user)`,
    { tag: ENTITY_STORE_TAGS },
    () => {
      let defaultHeaders: Record<string, string>;
      let internalHeaders: Record<string, string>;

      apiTest.beforeAll(async ({ apiClient, esClient, samlAuth }) => {
        const credentials = await samlAuth.asInteractiveUser('admin');
        defaultHeaders = { ...credentials.cookieHeader, ...PUBLIC_HEADERS };
        internalHeaders = { ...credentials.cookieHeader, ...INTERNAL_HEADERS };

        await clearEntityStoreIndices(esClient);

        const installResponse = await apiClient.post(ENTITY_STORE_ROUTES.public.INSTALL, {
          headers: defaultHeaders,
          responseType: 'json',
          body: {},
        });
        expect([200, 201]).toContain(installResponse.statusCode);

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
          const tEmail = targetEmail('fresh');
          const target = userId(tEmail);
          const aEmail = actorEmail('fresh');
          const actor = userId(aEmail);

          // The maintainer task auto-runs once on registration (ensureScheduled with
          // an interval schedules the first run ~immediately), persisting a watermark
          // before this test seeds anything. So we cannot rely on a pristine "no
          // watermark" state: seed the actor with a FUTURE last_seen so it is always
          // past whatever watermark the startup run left, and trigger synchronously
          // so the run completes before we poll.
          const futureTs = new Date(Date.now() + 3_600_000).toISOString();

          await seedUserEntity(esClient, { entityId: target, namespace, email: tEmail });
          await seedUserEntity(esClient, {
            entityId: actor,
            namespace,
            email: aEmail,
            entitySource: requiredEntitySource,
            relationship: { key: relationshipKey, userEmails: [tEmail] },
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
          const primingTargetEmail = targetEmail('prime');
          const primingTarget = userId(primingTargetEmail);
          const primingActorEmail = actorEmail('prime');
          const primingActor = userId(primingActorEmail);

          await seedUserEntity(esClient, {
            entityId: primingTarget,
            namespace,
            email: primingTargetEmail,
          });
          await seedUserEntity(esClient, {
            entityId: primingActor,
            namespace,
            email: primingActorEmail,
            entitySource: requiredEntitySource,
            relationship: { key: relationshipKey, userEmails: [primingTargetEmail] },
          });

          await triggerMaintainerRun(apiClient, internalHeaders, maintainerId, { sync: true });
          await waitForRelationshipIds(esClient, relationshipKey, primingActor, primingTarget);

          const staleTargetEmail = targetEmail('stale');
          const staleTarget = userId(staleTargetEmail);
          const staleActorEmail = actorEmail('stale');
          const staleActor = userId(staleActorEmail);

          const freshTargetEmail = targetEmail('fresh2');
          const freshTarget = userId(freshTargetEmail);
          const freshActorEmail = actorEmail('fresh2');
          const freshActor = userId(freshActorEmail);

          const pastTs = new Date(Date.now() - 3_600_000).toISOString();
          const futureTs = new Date(Date.now() + 3_600_000).toISOString();

          await seedUserEntity(esClient, {
            entityId: staleTarget,
            namespace,
            email: staleTargetEmail,
          });
          await seedUserEntity(esClient, {
            entityId: freshTarget,
            namespace,
            email: freshTargetEmail,
          });

          await seedUserEntity(esClient, {
            entityId: staleActor,
            namespace,
            email: staleActorEmail,
            lastSeen: pastTs,
            firstSeen: pastTs,
            entitySource: requiredEntitySource,
            relationship: { key: relationshipKey, userEmails: [staleTargetEmail] },
          });
          await seedUserEntity(esClient, {
            entityId: freshActor,
            namespace,
            email: freshActorEmail,
            lastSeen: futureTs,
            firstSeen: futureTs,
            entitySource: requiredEntitySource,
            relationship: { key: relationshipKey, userEmails: [freshTargetEmail] },
          });

          await triggerMaintainerRun(apiClient, internalHeaders, maintainerId, { sync: true });

          await waitForRelationshipIds(esClient, relationshipKey, freshActor, freshTarget);
          await assertNoRelationshipId(esClient, relationshipKey, staleActor, staleTarget);
        }
      );

      apiTest(
        `deduplicates ${relationshipKey}.ids when the same raw value appears in multiple identifier fields`,
        async ({ apiClient, esClient }) => {
          // Scenario: actor has two direct reports. Each report's raw identifiers
          // are stored across all three fields. user.name duplicates user.email
          // (Okta login == email), so after MV_APPEND + MV_EXPAND we get 6 candidate
          // EUIDs — VALUES() must collapse that to 4 unique ones (2 from email/name
          // deduplicated + 2 from id).
          const emailA = targetEmail('dup-a');
          const emailB = targetEmail('dup-b');
          const rawIdA = `okta-id-${entityPrefix}-dup-a`;
          const rawIdB = `okta-id-${entityPrefix}-dup-b`;

          const targetFromEmailA = userId(emailA);
          const targetFromEmailB = userId(emailB);
          const targetFromIdA = `user:${rawIdA}@${namespace}`;
          const targetFromIdB = `user:${rawIdB}@${namespace}`;

          const aEmail = actorEmail('dup');
          const actor = userId(aEmail);
          const futureTs = new Date(Date.now() + 3_600_000).toISOString();

          // Seed target entities so the maintainer can resolve them.
          await seedUserEntity(esClient, { entityId: targetFromEmailA, namespace, email: emailA });
          await seedUserEntity(esClient, { entityId: targetFromEmailB, namespace, email: emailB });
          await seedUserEntity(esClient, { entityId: targetFromIdA, namespace, email: emailA });
          await seedUserEntity(esClient, { entityId: targetFromIdB, namespace, email: emailB });

          // Actor: all three raw_identifier fields populated.
          // user.name == user.email (Okta login == email) → duplicate EUIDs after CONCAT.
          await seedUserEntity(esClient, {
            entityId: actor,
            namespace,
            email: aEmail,
            entitySource: requiredEntitySource,
            relationship: {
              key: relationshipKey,
              userEmails: [emailA, emailB],
              userIds: [rawIdA, rawIdB],
              userNames: [emailA, emailB],
            },
            lastSeen: futureTs,
            firstSeen: futureTs,
          });

          await triggerMaintainerRun(apiClient, internalHeaders, maintainerId, { sync: true });

          // Wait until at least one target is resolved, then assert exact count.
          await waitForRelationshipIds(esClient, relationshipKey, actor, targetFromEmailA);
          const ids = await getRelationshipIds(esClient, relationshipKey, actor);
          // 2 from user.email + 2 from user.id = 4 unique EUIDs.
          // The 2 from user.name duplicate user.email and are collapsed by VALUES().
          expect(ids).toHaveLength(4);
          expect(ids).toContain(targetFromEmailA);
          expect(ids).toContain(targetFromEmailB);
          expect(ids).toContain(targetFromIdA);
          expect(ids).toContain(targetFromIdB);
        }
      );

      apiTest(
        `writes only targets that exist as entities, drops phantom raw_identifiers`,
        async ({ apiClient, esClient }) => {
          // Scenario: actor has one real report (seeded as an entity) and one
          // phantom report (raw value only — no entity document). validateTargetIds
          // must filter the phantom before writing so only the real EUID lands in ids.
          const realEmail = targetEmail('phantom-real');
          const realTarget = userId(realEmail);
          const phantomRawEmail = targetEmail('phantom-ghost');
          // phantomTarget is intentionally NOT seeded — it has no entity document.
          const phantomTarget = userId(phantomRawEmail);

          const aEmail = actorEmail('phantom');
          const actor = userId(aEmail);
          const futureTs = new Date(Date.now() + 3_600_000).toISOString();

          await seedUserEntity(esClient, { entityId: realTarget, namespace, email: realEmail });

          await seedUserEntity(esClient, {
            entityId: actor,
            namespace,
            email: aEmail,
            entitySource: requiredEntitySource,
            relationship: { key: relationshipKey, userEmails: [realEmail, phantomRawEmail] },
            lastSeen: futureTs,
            firstSeen: futureTs,
          });

          await triggerMaintainerRun(apiClient, internalHeaders, maintainerId, { sync: true });

          // Wait until the real target appears, then assert the phantom is absent.
          await waitForRelationshipIds(esClient, relationshipKey, actor, realTarget);
          const ids = await getRelationshipIds(esClient, relationshipKey, actor);
          expect(ids).toContain(realTarget);
          expect(ids).not.toContain(phantomTarget);
        }
      );

      apiTest(
        `resolves ${relationshipKey}.ids when raw identifier is in user.id only (no email)`,
        async ({ apiClient, esClient }) => {
          // Verify the MV_APPEND union picks up values from user.id even when
          // user.email is absent. The target entity is identified by its Okta id,
          // so the actor seeds user.id (not user.email) in the raw_identifiers bag.
          const rawId = `okta-id-${entityPrefix}-idonly`;
          const target = `user:${rawId}@${namespace}`;
          const aEmail = actorEmail('idonly');
          const actor = userId(aEmail);

          const futureTs = new Date(Date.now() + 3_600_000).toISOString();

          await seedUserEntity(esClient, { entityId: target, namespace, email: aEmail });
          await seedUserEntity(esClient, {
            entityId: actor,
            namespace,
            email: aEmail,
            entitySource: requiredEntitySource,
            relationship: { key: relationshipKey, userIds: [rawId] },
            lastSeen: futureTs,
            firstSeen: futureTs,
          });

          await triggerMaintainerRun(apiClient, internalHeaders, maintainerId, { sync: true });

          await waitForRelationshipIds(esClient, relationshipKey, actor, target);
        }
      );

      apiTest(
        `skips an actor whose entity.source is not '${requiredEntitySource}'`,
        async ({ apiClient, esClient }) => {
          const tEmail = targetEmail('src');
          const target = userId(tEmail);
          const aEmail = actorEmail('src-wrong');
          const wrongSourceActor = userId(aEmail);

          await seedUserEntity(esClient, { entityId: target, namespace, email: tEmail });
          // Actor has the correct raw_identifiers but an entity.source that no
          // supervises config matches — the maintainer's exact entity.source filter
          // must exclude it. (Use an unrelated endpoint source, not another IDP EA
          // dataset, since those are valid supervises sources.)
          await seedUserEntity(esClient, {
            entityId: wrongSourceActor,
            namespace,
            email: aEmail,
            entitySource: 'elastic_defend',
            relationship: { key: relationshipKey, userEmails: [tEmail] },
          });

          await triggerMaintainerRun(apiClient, internalHeaders, maintainerId, { sync: true });

          await assertNoRelationshipId(esClient, relationshipKey, wrongSourceActor, target);
        }
      );
    }
  );
};

// Add a new entry here as each user → user maintainer is onboarded; the shared
// suite seeds user entities, runs the maintainer, and asserts the
// entity.lifecycle.last_seen watermark gate end-to-end.
//
// supervises is user → user, reconstructing the target EUID with the IDP
// namespace suffix. The maintainer supports both Okta and Entra ID (identical
// mechanism, differing only in entity.source + namespace suffix). This e2e suite
// exercises the Okta source; the Entra ID source is covered by the unit/snapshot
// tests in configs.test.ts (a second e2e registration would need its own spec
// file — the scout_max_one_describe lint rule allows one root describe per file).
//
// The maintainer matches entity.source against both the bare integration name
// and the <integration>.user dataset; we seed the bare form here.
registerUserTargetRawIdentifiersMaintainerSuite({
  maintainerId: 'supervises',
  relationshipKey: 'supervises',
  entityPrefix: 'sup',
  namespace: 'okta',
  requiredEntitySource: 'entityanalytics_okta',
});
