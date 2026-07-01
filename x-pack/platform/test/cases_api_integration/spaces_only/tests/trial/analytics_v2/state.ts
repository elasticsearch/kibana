/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { deleteAllCaseItems } from '../../../../common/lib/api';
import { getV2State, resetV2 } from './helpers';

/**
 * Covers `GET /state`, the on-call introspection endpoint. The key
 * signal is `index_exists` — if v2's bootstrap silently failed, the
 * route returns `enabled: true, index_exists: false`, which is
 * otherwise only visible by grepping Kibana logs.
 */
export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const es = getService('es');

  describe('/state', () => {
    afterEach(async () => {
      await deleteAllCaseItems(es);
      await resetV2(supertest);
    });

    it('returns enabled=true, index_exists=true, and the reconciliation task type', async () => {
      const state = await getV2State(supertest);
      expect(state.enabled).to.eql(true);
      expect(state.index).to.eql('.cases');
      expect(state.index_exists).to.eql(true);
      expect(state.surfaces.cases.index).to.eql('.cases');
      expect(state.surfaces.cases.index_exists).to.eql(true);
      expect(state.surfaces.activity.index).to.eql('.cases-activity');
      expect(state.surfaces.activity.index_exists).to.eql(true);
      expect(state.reconciliation.task_type).to.eql('cases.analyticsV2.reconciliation');
      // The reconciliation task may or may not have run yet —
      // accept either. What matters is that `last_run` is
      // structurally present (or null).
      expect(state.reconciliation).to.have.property('last_run');
    });

    it('reports index_exists=false when `.cases` was dropped out-of-band', async () => {
      // Simulate the silent-bootstrap-failure case: delete the
      // index directly via ES; `/state` should report the index as
      // missing even though `enabled` is still true.
      await es.indices.delete({ index: '.cases' });

      const state = await getV2State(supertest);
      expect(state.enabled).to.eql(true);
      expect(state.index_exists).to.eql(false);

      // `/reset` recreates the index. afterEach handles cleanup,
      // but reset here so the next assertion sees the recovered
      // state.
      await resetV2(supertest);
      const afterReset = await getV2State(supertest);
      expect(afterReset.index_exists).to.eql(true);
    });

    it('exposes active_reset on the response shape (null when no reset is in flight)', async () => {
      // resetV2 in afterEach already drains any in-flight reset, so
      // a fresh `/state` call should see no active reset task SO.
      // The field must exist (even when null) so consumers can rely
      // on its presence as the "no reset is happening" signal.
      const state = await getV2State(supertest);
      expect(state).to.have.property('active_reset');
      expect(state.active_reset).to.eql(null);
    });
  });
};
