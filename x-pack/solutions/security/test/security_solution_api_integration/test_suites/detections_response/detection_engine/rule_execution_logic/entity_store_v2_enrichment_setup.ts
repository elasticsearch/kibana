/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../ftr_provider_context';

const PUBLIC_API_HEADERS: ReadonlyArray<[string, string]> = [
  ['kbn-xsrf', 'true'],
  ['x-elastic-internal-origin', 'Kibana'],
  ['elastic-api-version', '2023-10-31'],
];

// The entity maintainers API is an internal route that requires api-version '2'.
const INTERNAL_API_HEADERS: ReadonlyArray<[string, string]> = [
  ['kbn-xsrf', 'true'],
  ['x-elastic-internal-origin', 'Kibana'],
  ['elastic-api-version', '2'],
];

const withHeaders = <T extends { set: (key: string, value: string) => T }>(req: T): T =>
  PUBLIC_API_HEADERS.reduce((acc, [k, v]) => acc.set(k, v), req);

const withInternalHeaders = <T extends { set: (key: string, value: string) => T }>(req: T): T =>
  INTERNAL_API_HEADERS.reduce((acc, [k, v]) => acc.set(k, v), req);

export interface HostEntityConfig {
  host: Record<string, unknown>;
  entity?: Record<string, unknown>;
  asset?: Record<string, unknown>;
}

export interface UserEntityConfig {
  user: Record<string, unknown>;
  entity?: Record<string, unknown>;
  asset?: Record<string, unknown>;
}

export interface EnrichmentSetupConfig {
  hosts?: HostEntityConfig[];
  users?: UserEntityConfig[];
}

/**
 * Installs Entity Store V2 engines and seeds entities for alert enrichment tests.
 *
 * Entity creation uses `refresh: 'wait_for'` internally, so seeded entities are
 * immediately searchable when `setup` returns. No additional refresh step is needed.
 *
 * Inspired by the approach started in https://github.com/elastic/kibana/pull/270939
 * by @denar50.
 */
export const EntityStoreV2EnrichmentSetup = (getService: FtrProviderContext['getService']) => {
  const supertest = getService('supertest');
  const retry = getService('retry');
  const log = getService('log');

  const setup = async (enrichmentConfig: EnrichmentSetupConfig): Promise<void> => {
    const entityTypes: string[] = [];
    if (enrichmentConfig.hosts?.length) entityTypes.push('host');
    if (enrichmentConfig.users?.length) entityTypes.push('user');

    if (entityTypes.length === 0) return;

    const installRes = await withHeaders(supertest.post('/api/security/entity_store/install')).send(
      { entityTypes }
    );

    if (installRes.status !== 200 && installRes.status !== 201) {
      throw new Error(
        `Entity Store V2 install failed (status ${installRes.status}): ${JSON.stringify(
          installRes.body
        )}`
      );
    }

    // Wait until the risk-score maintainer has completed at least one successful run. This
    // ensures the maintainer has finished its initial setup pass and will not overwrite
    // CRUD-seeded test entities before the detection rule executes.
    //
    // `taskStatus` is only ever set to 'stopped' by an explicit stopEntityMaintainer() API
    // call — the task runner keeps taskStatus = 'started' between runs. The correct signal
    // for "first run completed" is `runs > 0` (incremented in the finally block of every
    // run regardless of success/failure) combined with `lastSuccessTimestamp !== null` to
    // confirm the run actually succeeded and the risk-score index is ready.
    //
    // The entity maintainers route is an internal API (api-version '2'). There is no public
    // equivalent for per-maintainer run counts. If the route version is bumped, update
    // INTERNAL_API_HEADERS accordingly.
    await retry.waitForWithTimeout(
      'risk-score maintainer initial run to complete',
      300_000,
      async () => {
        const res = await withInternalHeaders(
          supertest.get('/internal/security/entity_store/entity_maintainers?ids=risk-score')
        );
        const maintainer = res.body?.maintainers?.[0];
        if (!maintainer) return false;
        if (maintainer.lastErrorTimestamp && !maintainer.lastSuccessTimestamp) {
          // Every run so far has failed. The maintainer will not retry until its next
          // scheduled interval, so it cannot overwrite CRUD-seeded entities in the
          // test window. Log and proceed rather than failing the test setup.
          log.debug(
            `risk-score maintainer first run failed, proceeding: ${JSON.stringify(res.body)}`
          );
          return true;
        }
        return maintainer.runs > 0 && maintainer.lastSuccessTimestamp !== null;
      }
    );

    for (const hostConfig of enrichmentConfig.hosts ?? []) {
      const createRes = await withHeaders(
        supertest.post('/api/security/entity_store/entities/host')
      ).send(hostConfig);
      if (createRes.status !== 200) {
        throw new Error(
          `Create host entity failed (status ${createRes.status}): ${JSON.stringify(
            createRes.body
          )}`
        );
      }
    }

    for (const userConfig of enrichmentConfig.users ?? []) {
      const createRes = await withHeaders(
        supertest.post('/api/security/entity_store/entities/user')
      ).send(userConfig);
      if (createRes.status !== 200) {
        throw new Error(
          `Create user entity failed (status ${createRes.status}): ${JSON.stringify(
            createRes.body
          )}`
        );
      }
    }
  };

  const teardown = async (): Promise<void> => {
    const res = await withHeaders(supertest.post('/api/security/entity_store/uninstall')).send({
      entityTypes: ['user', 'host', 'service'],
    });
    if (res.status !== 200) {
      log.debug(
        `Entity Store V2 uninstall returned non-200 (status ${res.status}): ${JSON.stringify(
          res.body
        )}`
      );
    }
  };

  return { setup, teardown };
};
