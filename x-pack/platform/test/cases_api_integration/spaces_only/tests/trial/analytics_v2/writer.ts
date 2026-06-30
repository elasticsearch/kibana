/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { getPostCaseRequest } from '../../../../common/lib/mock';
import {
  createCase,
  deleteCases,
  updateCase,
  deleteAllCaseItems,
  getAuthWithSuperUser,
} from '../../../../common/lib/api';
import {
  getAnalyticsCase,
  resetV2,
  waitForAnalyticsCase,
  waitForAnalyticsCaseUpdate,
} from './helpers';

/**
 * End-to-end coverage of the fire-and-forget write path:
 *
 *     cases SO mutation → CasesService hook
 *       → CasesAnalyticsV2Writer → .cases
 *
 * Tests assert the analytics doc appears, reflects updates, and is
 * removed on delete — unit tests can't cover ES index semantics,
 * doc refresh timing, or the strict mapping accepting the doc shape.
 */
export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const es = getService('es');
  const auth = getAuthWithSuperUser();

  describe('writer ES round-trip', () => {
    afterEach(async () => {
      // Clean SOs first, then reset the analytics surface —
      // reset's follow-up reconciliation has nothing to find that
      // way.
      await deleteAllCaseItems(es);
      await resetV2(supertest);
    });

    it('createCase → analytics doc lands in .cases with the correct shape', async () => {
      const created = await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, auth);

      await waitForAnalyticsCase(es, created.id);
      const doc = await getAnalyticsCase(es, created.id);

      expect(doc.cases.id).to.eql(created.id);
      expect(doc.cases.title).to.eql(created.title);
      // Doc-builder converts numeric SO enums to human strings.
      expect(doc.cases.status).to.eql('open');
      expect(doc.cases.severity).to.eql('low');
      // `getAuthWithSuperUser()` defaults to `space1` → case lives in
      // space1 → analytics doc inherits that namespace (non-default
      // propagation). Top-level singular `space_id` (implicit-privileges
      // DLS convention; cases are space-isolated).
      expect(doc.space_id).to.eql('space1');
    });

    it('updateCase → analytics doc is upserted (single doc, latest values)', async () => {
      const created = await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, auth);
      await waitForAnalyticsCase(es, created.id);

      await updateCase({
        supertest: supertestWithoutAuth,
        params: {
          cases: [{ id: created.id, version: created.version, title: 'updated title' }],
        },
        auth,
      });

      await waitForAnalyticsCaseUpdate(
        es,
        created.id,
        (source) => source.cases.title === 'updated title'
      );

      // Confirm it's still a single doc, not two — the writer
      // upserts on the same `_id`.
      await es.indices.refresh({ index: '.cases' });
      const countResult = await es.count({ index: '.cases', q: `cases.id:"${created.id}"` });
      expect(countResult.count).to.eql(1);
    });

    it('deleteCase → analytics doc removed', async () => {
      const created = await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, auth);
      await waitForAnalyticsCase(es, created.id);

      // `deleteCases` threads `auth.space` through `getSpaceUrlPrefix`
      // — a raw `/api/cases` DELETE would 404 (case lives in space1).
      await deleteCases({
        supertest: supertestWithoutAuth,
        caseIDs: [created.id],
        auth,
      });

      await waitForAnalyticsCase(es, created.id, { expect: 'absent' });
    });

    it('deleteCase succeeds when the analytics doc is already gone (writer 404 swallow)', async () => {
      // Models the out-of-band drop scenario (writer missed a create,
      // or `.cases` was wiped between create and delete). The case
      // SO is still present, so the API must return 204; the writer
      // fires, hits 404 on `.cases`, and swallows it. The 404-swallow
      // itself is covered by writer/writer.test.ts ('treats per-item
      // 404s as no-ops'); this is the end-to-end wiring check.
      const created = await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, auth);
      await waitForAnalyticsCase(es, created.id);

      await es.delete({ index: '.cases', id: created.id });
      await waitForAnalyticsCase(es, created.id, { expect: 'absent' });

      await deleteCases({
        supertest: supertestWithoutAuth,
        caseIDs: [created.id],
        auth,
      });

      // Still absent — the swallowed 404 didn't resurrect the doc.
      await waitForAnalyticsCase(es, created.id, { expect: 'absent' });
    });
  });
};
