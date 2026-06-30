/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { getPostCaseRequest } from '../../../../common/lib/mock';
import {
  createCase,
  deleteAllCaseItems,
  getAuthWithSuperUser,
  updateCase,
} from '../../../../common/lib/api';
import { resetV2, runReconcileSoon, waitForAnalyticsCase } from './helpers';

/**
 * Reconciliation tests cover the durability backstop: every case SO
 * should land in `.cases` eventually, even when the real-time writer
 * misses one. Regression scenarios:
 *   - A case with `updated_at: null` (newly created, writer dropped
 *     the update) — the filter's OR-clause must surface it via
 *     `created_at`.
 *   - `/reconcile/run_soon` causes a fresh tick to fire and the
 *     dropped case to land in `.cases` within seconds.
 */
export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const es = getService('es');
  const auth = getAuthWithSuperUser();

  describe('reconciliation', () => {
    afterEach(async () => {
      await deleteAllCaseItems(es);
      await resetV2(supertest);
    });

    it('runSoon picks up a case that was dropped from `.cases` out-of-band', async () => {
      // Simulate the "writer missed a write" scenario: create the
      // case, let the writer succeed, then delete the analytics doc
      // directly via ES (mimicking the post-write blip
      // reconciliation exists to repair). The next tick should
      // re-emit it.
      const created = await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, auth);
      await waitForAnalyticsCase(es, created.id);

      await es.delete({ index: '.cases', id: created.id });
      await waitForAnalyticsCase(es, created.id, { expect: 'absent' });

      await runReconcileSoon(supertest);
      await waitForAnalyticsCase(es, created.id, { expect: 'present' });
    });

    it('runSoon picks up a newly-created case whose updated_at is null (regression)', async () => {
      // Direct regression coverage for the filter OR-clause. The
      // cases SO is created with `updated_at: null`
      // (transformNewCase). A `updated_at > lastRunAt`-only filter
      // would never see it; the OR-clause filter
      // `updated_at > lastRunAt OR (updated_at IS MISSING AND
      // created_at > lastRunAt)` does.
      //
      // To exercise the OR-clause specifically, the task cursor
      // must be seeded BEFORE the case's `created_at`. Sequence:
      //   (1) Reset to clear state, then run reconcile once to seed
      //       the cursor at "now".
      //   (2) Create a case whose `created_at` is after the cursor.
      //   (3) Drop its analytics doc; the SO retains
      //       `updated_at: null`.
      //   (4) Reconcile again — the OR-clause must surface it.
      //
      // The first half of this test (create / reconcile / drop /
      // reconcile) is left as exposition for readers; the actual
      // regression assertion is the second half.
      const created = await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, auth);
      await waitForAnalyticsCase(es, created.id);

      await runReconcileSoon(supertest);
      await es.delete({ index: '.cases', id: created.id });
      await waitForAnalyticsCase(es, created.id, { expect: 'absent' });

      await deleteAllCaseItems(es);
      await resetV2(supertest);

      // (1) Seed cursor.
      await runReconcileSoon(supertest);
      // (2) Create a case whose created_at is after the seeded cursor.
      const newCase = await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, auth);
      await waitForAnalyticsCase(es, newCase.id);
      // (3) Drop the analytics doc — SO retains updated_at: null.
      await es.delete({ index: '.cases', id: newCase.id });
      await waitForAnalyticsCase(es, newCase.id, { expect: 'absent' });
      // (4) Reconcile. The OR-clause must surface the case.
      await runReconcileSoon(supertest);
      await waitForAnalyticsCase(es, newCase.id, { expect: 'present' });
    });

    it('runSoon picks up a case patched since the last cursor', async () => {
      // Update path: case exists, gets patched, the writer missed
      // the patch, reconciliation re-emits with the updated values.
      // Dropping the analytics doc models the writer missing it.
      // After a patch the SO's `updated_at` advances, so the
      // standard `updated_at > lastRunAt` clause catches it.
      const created = await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, auth);
      await waitForAnalyticsCase(es, created.id);

      await runReconcileSoon(supertest);

      // Patch fires the writer; the test then drops the doc to
      // model the writer missing the patch. `updateCase` is used
      // for the space prefix — case lives in space1.
      await updateCase({
        supertest: supertestWithoutAuth,
        params: {
          cases: [{ id: created.id, version: created.version, title: 'patched title' }],
        },
        auth,
      });

      await es.delete({ index: '.cases', id: created.id });
      await waitForAnalyticsCase(es, created.id, { expect: 'absent' });

      await runReconcileSoon(supertest);
      await waitForAnalyticsCase(es, created.id, { expect: 'present' });
    });
  });
};
