/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../common/ftr_provider_context';

/**
 * Gating contract for cases-analytics v2 administrator routes.
 *
 * Runs under `config_analytics_v2_admin_routes_off.ts`, which boots
 * Kibana with `xpack.cases.analyticsV2.enabled=true` and
 * `xpack.cases.analyticsV2.enableAdminRoutes=false`. In that
 * configuration:
 *
 *   - `GET  /internal/cases/_analyticsV2/state`               → 200
 *   - `POST /internal/cases/_analyticsV2/reset`               → 404
 *   - `POST /internal/cases/_analyticsV2/reconcile/run_soon`  → 404
 *
 * The 404 (vs 403) on the mutating paths is the deliberate
 * fingerprint-prevention contract from
 * `cases_analytics_v2/routes/index.ts`: the routes are simply not
 * registered when the flag is off, so Kibana's router rejects the
 * request before reaching any handler. A regression to 403 would
 * mean the routes were registered and *then* gated by authz, which
 * leaks the existence of the subsystem to unauthenticated probes
 * and changes the operational shape relied on by the manual test
 * plan in the README.
 *
 * This suite intentionally does no resource setup — every assertion
 * is a single HTTP request — so the cost of the extra Kibana boot
 * stays bounded.
 */
export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');

  const INTERNAL_HEADERS = {
    'kbn-xsrf': 'true',
    'x-elastic-internal-origin': 'kibana',
  };

  describe('cases-analytics v2 admin routes gating (enableAdminRoutes=false)', () => {
    it('GET /state still returns 200 — the read-only health surface is always registered', async () => {
      // `/state` is polled by the Case Settings page and on-call
      // tooling. It must remain reachable even when the mutating
      // admin routes are disabled — otherwise operators have no
      // signal that v2 is running.
      const response = await supertest
        .get('/internal/cases/_analyticsV2/state')
        .set(INTERNAL_HEADERS)
        .expect(200);

      expect(response.body.enabled).to.eql(true);
      expect(response.body.index).to.eql('.cases');
    });

    it('POST /reset returns 404 — the route is unregistered, not authz-rejected', async () => {
      // 404 is the gating contract; 403/401/405 would all mean the
      // route was registered and we lost the fingerprint-prevention
      // guarantee.
      await supertest.post('/internal/cases/_analyticsV2/reset').set(INTERNAL_HEADERS).expect(404);
    });

    it('POST /reconcile/run_soon returns 404 — the route is unregistered, not authz-rejected', async () => {
      await supertest
        .post('/internal/cases/_analyticsV2/reconcile/run_soon')
        .set(INTERNAL_HEADERS)
        .expect(404);
    });
  });
};
