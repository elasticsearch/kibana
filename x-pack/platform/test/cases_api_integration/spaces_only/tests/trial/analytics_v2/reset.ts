/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { getPostCaseRequest } from '../../../../common/lib/mock';
import { createCase, deleteAllCaseItems, getAuthWithSuperUser } from '../../../../common/lib/api';
import {
  CASE_INDEX,
  resetV2,
  runReconcileSoon,
  waitForAnalyticsCase,
  waitForCaseIndexExists,
  waitForResetComplete,
} from './helpers';

const INTERNAL_HEADERS = {
  'kbn-xsrf': 'true',
  'x-elastic-internal-origin': 'kibana',
} as const;

/**
 * `/reset` is the administrator escape hatch. It returns 202 and runs the
 * backfill walk asynchronously in a one-shot Task Manager task. The
 * synchronous portion (drop + recreate indices, delete data views,
 * clear cache) happens in-handler; only the `O(documents)` walk is
 * moved out. Tests assert both phases.
 */
export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const es = getService('es');
  const auth = getAuthWithSuperUser();

  describe('/reset', () => {
    afterEach(async () => {
      await deleteAllCaseItems(es);
      await resetV2(supertest);
    });

    it('drops `.cases` and recreates it, returns 202 with a reset_task envelope', async () => {
      const created = await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, auth);
      await waitForAnalyticsCase(es, created.id);

      // Reset — 202, not 200. Destructive cleanup is synchronous;
      // the backfill walk is scheduled.
      const response = await supertest
        .post('/internal/cases/_analyticsV2/reset')
        .set(INTERNAL_HEADERS)
        .expect(202);

      expect(response.body.reset).to.eql(CASE_INDEX);
      expect(response.body.reset_task).to.have.property('id', 'cases-analyticsV2-reset');
      expect(response.body.reset_task).to.have.property('task_type', 'cases.analyticsV2.fullReset');
      expect(response.body.reset_task).to.have.property('scheduled_at');
      expect(response.body.reset_task).to.have.property(
        'poll',
        '/internal/cases/_analyticsV2/state'
      );

      // The index exists again (recreated by the synchronous
      // portion before the response returned).
      await waitForCaseIndexExists(es);
      const exists = await es.indices.exists({ index: CASE_INDEX });
      expect(exists).to.eql(true);

      // Wait for the async walk to complete; otherwise the next
      // test's afterEach `resetV2` would race the in-flight reset
      // task.
      await waitForResetComplete(supertest);
    });

    it('reports the number of per-space data views deleted', async () => {
      // Bootstrap the default-space data view by hitting any cases
      // endpoint. Lazy bootstrap fires on request handler context
      // creation.
      await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, auth);

      // Give the data-view ensure a moment to land. It runs
      // fire-and-forget via the request handler context.
      let dataViewExists = false;
      for (let attempt = 0; attempt < 30 && !dataViewExists; attempt++) {
        const result = await es.search({
          index: '.kibana*',
          query: {
            bool: {
              filter: [
                { term: { type: 'index-pattern' } },
                { prefix: { 'index-pattern.title': '.cases' } },
              ],
            },
          },
          size: 1,
        });
        dataViewExists =
          result.hits.total !== undefined &&
          (typeof result.hits.total === 'number'
            ? result.hits.total > 0
            : result.hits.total.value > 0);
        if (!dataViewExists) await new Promise((r) => setTimeout(r, 200));
      }

      const response = await supertest
        .post('/internal/cases/_analyticsV2/reset')
        .set(INTERNAL_HEADERS)
        .expect(202);

      expect(response.body).to.have.property('data_views_deleted');
      // At least one — the default-space view from the createCase
      // above. Concurrent interleaving could cause more, but
      // afterEach resets state, so this test is the only one
      // running here.
      expect(response.body.data_views_deleted).to.be.greaterThan(0);

      await waitForResetComplete(supertest);
    });

    it('clears reconciliation task state so the follow-up backfill walks every case', async () => {
      // Create a case and run reconcile to seed the cursor.
      const oldCase = await createCase(
        supertestWithoutAuth,
        getPostCaseRequest({ title: 'old case' }),
        200,
        auth
      );
      await waitForAnalyticsCase(es, oldCase.id);

      // Bump the cursor. The helper waits for cursor advance, so the
      // "cursor is ahead of oldCase.created_at" precondition is
      // actually established (a raw `.expect(200)` could no-op when
      // TM is mid-tick and silently lose the precondition).
      await runReconcileSoon(supertest);

      // Without `/reset`, the cursor would now be ahead of
      // `oldCase.created_at` and a periodic tick wouldn't re-emit
      // oldCase. `/reset` schedules a full backfill
      // (lastRunAt: undefined → no filter → walk every case), so
      // the pre-existing case lands in `.cases` again after the
      // reset task completes.
      await resetV2(supertest);

      await waitForAnalyticsCase(es, oldCase.id, { expect: 'present' });
    });

    it('schedules a one-shot reset task whose status is observable via /state.active_reset', async () => {
      // Schedule a reset; the task should be visible via
      // `/state.active_reset` (idle/running/completed) for at least
      // the brief window before Task Manager auto-cleans it on
      // success. Catching it as `idle` vs `running` vs already
      // gone depends on timing — what matters is that the field
      // exists and converges to `null` (success) within the
      // bootstrap timeout.
      await supertest.post('/internal/cases/_analyticsV2/reset').set(INTERNAL_HEADERS).expect(202);

      // After the task completes, Task Manager auto-removes the
      // SO and `/state.active_reset` returns null.
      // `waitForResetComplete` handles the polling loop.
      const final = await waitForResetComplete(supertest);
      expect(final).to.eql(null);
    });
  });
};
