/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { CaseSeverity, CaseStatuses } from '@kbn/cases-plugin/common/types/domain';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { getPostCaseRequest } from '../../../../common/lib/mock';
import {
  createCase,
  updateCase,
  deleteCases,
  deleteAllCaseItems,
  getAuthWithSuperUser,
} from '../../../../common/lib/api';
import {
  ACTIVITY_INDEX,
  CASE_INDEX,
  getV2State,
  resetV2,
  waitForActivityAbsent,
  waitForActivityForCase,
} from './helpers';

/**
 * End-to-end coverage of the activity surface:
 *
 *     user-action SO mutation → CaseUserActionService hook
 *       → CasesActivityV2Writer → .cases-activity
 *
 * Tests assert:
 *   1. `create_case` user-action lands in `.cases-activity` on case create.
 *   2. `status` / `severity` patches produce per-type rows with the
 *      curated extracts populated.
 *   3. Deleting the case cascades the activity rows out (verifies
 *      `bulkDeleteActionsByCaseIds` from `CasesService.deleteCase`).
 *   4. `/state` reports the activity surface independently.
 *   5. `/reset` rebuilds both surfaces.
 */
export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const es = getService('es');
  const auth = getAuthWithSuperUser();

  describe('activity surface ES round-trip', () => {
    afterEach(async () => {
      // Clean SOs first, then reset both surfaces — reset's
      // follow-up reconciliation has nothing to find that way.
      await deleteAllCaseItems(es);
      await resetV2(supertest);
    });

    it('createCase → activity doc lands in .cases-activity with the create_case shape', async () => {
      const created = await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, auth);

      const docs = await waitForActivityForCase(es, created.id, 1);
      const createDoc = docs.find((d) => d.action.type === 'create_case');
      expect(createDoc).to.be.an('object');
      expect(createDoc!.cases.id).to.eql(created.id);
      expect(createDoc!.action.verb).to.eql('create');
      // `getAuthWithSuperUser()` defaults to `space1` → the case (and its
      // user actions) live in space1, so the real-time activity write
      // inherits that namespace. Top-level singular `space_id` is the
      // implicit-privileges DLS field, populated correctly for a
      // non-default space at write time (not just after reconciliation).
      expect(createDoc!.space_id).to.eql('space1');
      // payload_json contains the full create_case payload —
      // assert a known field (title) round-trips so analysts can
      // pivot via ES|QL `MV_FROM_JSON` on the column.
      const parsed = JSON.parse(createDoc!.action.payload_json) as { title?: string };
      expect(parsed.title).to.eql(created.title);
    });

    it('status / severity patches produce per-type rows with curated extracts', async () => {
      const created = await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, auth);
      await waitForActivityForCase(es, created.id, 1);

      const updated = await updateCase({
        supertest: supertestWithoutAuth,
        params: {
          cases: [
            {
              id: created.id,
              version: created.version,
              status: CaseStatuses['in-progress'],
              severity: CaseSeverity.HIGH,
            },
          ],
        },
        auth,
      });
      // updateCase returns the latest cases array.
      expect(updated[0].id).to.eql(created.id);

      // Wait for at least three docs (create_case + status + severity).
      const docs = await waitForActivityForCase(es, created.id, 3);

      const statusDoc = docs.find((d) => d.action.type === 'status');
      const severityDoc = docs.find((d) => d.action.type === 'severity');
      expect(statusDoc).to.be.an('object');
      expect(severityDoc).to.be.an('object');

      // Curated extracts: the analytics dimension that downstream
      // Lens / ES|QL pivots filter on.
      expect(statusDoc!.action.status_new).to.eql('in-progress');
      expect(severityDoc!.action.severity_new).to.eql('high');
      // Verbs are preserved from the SO action.
      expect(statusDoc!.action.verb).to.eql('update');
      expect(severityDoc!.action.verb).to.eql('update');
    });

    it('deleteCase → cascade-deletes every activity doc for that case', async () => {
      const created = await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, auth);
      // Drive at least one extra user-action so the cascade-delete
      // has more than just the create_case row to drop.
      await updateCase({
        supertest: supertestWithoutAuth,
        params: {
          cases: [
            {
              id: created.id,
              version: created.version,
              status: CaseStatuses['in-progress'],
            },
          ],
        },
        auth,
      });
      await waitForActivityForCase(es, created.id, 2);

      // `deleteCases` threads `auth.space` through `getSpaceUrlPrefix` — a
      // raw `/api/cases` DELETE would 404 (the case lives in space1).
      await deleteCases({
        supertest: supertestWithoutAuth,
        caseIDs: [created.id],
        auth,
      });

      await waitForActivityAbsent(es, created.id);
    });

    it('/state reports the activity surface independently of the cases surface', async () => {
      const state = await getV2State(supertest);
      expect(state.enabled).to.be(true);
      expect(state.surfaces.cases.index).to.eql(CASE_INDEX);
      expect(state.surfaces.cases.index_exists).to.be(true);
      expect(state.surfaces.activity.index).to.eql(ACTIVITY_INDEX);
      expect(state.surfaces.activity.index_exists).to.be(true);
    });

    it('/reset rebuilds both surfaces', async () => {
      const created = await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, auth);
      await waitForActivityForCase(es, created.id, 1);

      // `/reset` returns 202 and the backfill walk runs in a
      // one-shot Task Manager job. `resetV2` handles both the 202
      // expectation and the polling loop until the task SO
      // disappears (Task Manager auto-removes one-shot tasks on
      // success).
      await resetV2(supertest);

      // After the backfill task completes, both indices are rebuilt
      // and the activity walk re-emits the create_case user-action
      // (its source SO is still present — only the analytics index
      // was rebuilt). Poll for the row to ride out residual ES
      // refresh latency between the task self-deleting its SO and
      // the row becoming searchable.
      await waitForActivityForCase(es, created.id, 1);
    });
  });
};
