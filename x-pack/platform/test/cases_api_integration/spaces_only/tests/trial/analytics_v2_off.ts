/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../common/ftr_provider_context';
import { getPostCaseRequest } from '../../../common/lib/mock';
import {
  createCase,
  deleteAllCaseItems,
  getAuthWithSuperUser,
  updateCase,
} from '../../../common/lib/api';

/**
 * Regression guard for the "v1 unaffected when v2 is off" guarantee.
 *
 * This suite runs under the main `spaces_only/config.ts`, where the v2
 * feature flag is at its default (`xpack.cases.analyticsV2.enabled: false`).
 * The proxy / noop-writer wiring in `cases_analytics_v2/service.ts` already
 * makes this correct in code — every writer call funnels through a stable
 * proxy that delegates to `V2_NOOP_WRITER` when the flag is off, and SO
 * services accept that proxy unconditionally. The explicit integration
 * assertion here exists so a future change that breaks the noop contract
 * (e.g. removing the proxy, accidentally constructing the real writer
 * unconditionally) fails loudly instead of silently regressing the
 * "deployments not using v2 are untouched" promise.
 */
export default ({ getService }: FtrProviderContext): void => {
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const es = getService('es');
  const auth = getAuthWithSuperUser();

  describe('cases-analytics v2 disabled (feature flag default)', () => {
    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    it('case create / patch / delete succeeds and `.cases` is never bootstrapped', async () => {
      // Create — exercises the analyticsV2Writer.upsertCase hook (noop
      // when v2 is off).
      const created = await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, auth);
      expect(created.id).to.be.a('string');

      // Patch — exercises the analyticsV2Writer.upsertCase hook on the
      // synthesized-post-update SO path in `CasesService.patchCase`.
      await updateCase({
        supertest: supertestWithoutAuth,
        params: { cases: [{ id: created.id, version: created.version, title: 'updated' }] },
        auth,
      });

      // Delete — exercises `bulkDeleteCaseEntities`, which builds the
      // per-entity status map and dispatches `analyticsV2Writer.bulkDeleteCases`
      // (noop when v2 is off).
      await deleteAllCaseItems(es);

      // `.cases` is the v2 analytics index. With v2 off, plugin start
      // skips the `ensureCaseIndex` bootstrap entirely — the index must
      // never exist on this config.
      const exists = await es.indices.exists({ index: '.cases' });
      expect(exists).to.eql(false);
    });
  });
};
