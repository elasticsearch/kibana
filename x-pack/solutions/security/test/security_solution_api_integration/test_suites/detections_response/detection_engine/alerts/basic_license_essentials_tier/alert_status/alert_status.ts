/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { ALERT_WORKFLOW_STATUS } from '@kbn/rule-data-utils';
import type { estypes } from '@elastic/elasticsearch';

import {
  DETECTION_ENGINE_SIGNALS_STATUS_URL,
  DETECTION_ENGINE_QUERY_SIGNALS_URL,
} from '@kbn/security-solution-plugin/common/constants';
import {
  closingReason,
  type DetectionAlert,
} from '@kbn/security-solution-plugin/common/api/detection_engine';
import {
  createAlertsIndex,
  deleteAllAlerts,
  getQueryAlertIds,
  deleteAllRules,
  createRule,
  waitForAlertsToBePresent,
  getAlertsByIds,
  waitForRuleSuccess,
  getRuleForAlertTesting,
} from '@kbn/detections-response-ftr-services';
import {
  setAlertStatus,
  getAlertUpdateByQueryEmptyResponse,
  refreshIndex,
} from '../../../../utils';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import { EsArchivePathBuilder } from '../../../../../../es_archive_path_builder';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const log = getService('log');
  const es = getService('es');
  const config = getService('config');
  const isServerless = config.get('serverless');
  const dataPathBuilder = new EsArchivePathBuilder(isServerless);
  const path = dataPathBuilder.getPath('auditbeat/hosts');

  describe('@ess @serverless change alert status endpoints', () => {
    describe('validation checks', () => {
      describe('update by ids', () => {
        it('should not give errors when querying and the alerts index does not exist yet', async () => {
          const { body } = await supertest
            .post(DETECTION_ENGINE_SIGNALS_STATUS_URL)
            .set('kbn-xsrf', 'true')
            .send(setAlertStatus({ alertIds: ['123'], status: 'open' }))
            .expect(200);

          // remove any server generated items that are nondeterministic
          delete body.took;

          expect(body).to.eql(getAlertUpdateByQueryEmptyResponse());
        });

        it('should not give errors when querying and the alerts index does exist and is empty', async () => {
          await createAlertsIndex(supertest, log);
          const { body } = await supertest
            .post(DETECTION_ENGINE_SIGNALS_STATUS_URL)
            .set('kbn-xsrf', 'true')
            .send(setAlertStatus({ alertIds: ['123'], status: 'open' }))
            .expect(200);

          // remove any server generated items that are nondeterministic
          delete body.took;

          expect(body).to.eql(getAlertUpdateByQueryEmptyResponse());

          await deleteAllAlerts(supertest, log, es);
        });
      });

      describe('update by query', () => {
        it('should not give errors when querying and the alerts index does not exist yet', async () => {
          const { body } = await supertest
            .post(DETECTION_ENGINE_SIGNALS_STATUS_URL)
            .set('kbn-xsrf', 'true')
            .send(setAlertStatus({ query: { match_all: {} }, status: 'open' }))
            .expect(200);

          // remove any server generated items that are indeterministic
          delete body.took;

          expect(body).to.eql(getAlertUpdateByQueryEmptyResponse());
        });

        it('should not give errors when querying and the alerts index does exist and is empty', async () => {
          await createAlertsIndex(supertest, log);
          const { body } = await supertest
            .post(DETECTION_ENGINE_SIGNALS_STATUS_URL)
            .set('kbn-xsrf', 'true')
            .send(setAlertStatus({ query: { match_all: {} }, status: 'open' }))
            .expect(200);

          // remove any server generated items that are indeterministic
          delete body.took;

          expect(body).to.eql(getAlertUpdateByQueryEmptyResponse());

          await deleteAllAlerts(supertest, log, es);
        });
      });

      describe('tests with auditbeat data', () => {
        before(async () => {
          await esArchiver.load(path);
        });

        after(async () => {
          await esArchiver.unload(path);
        });

        beforeEach(async () => {
          await deleteAllRules(supertest, log);
          await createAlertsIndex(supertest, log);
        });

        afterEach(async () => {
          await deleteAllAlerts(supertest, log, es);
          await deleteAllRules(supertest, log);
        });

        it('should be able to execute and get 10 alerts', async () => {
          const rule = {
            ...getRuleForAlertTesting(['auditbeat-*']),
            query: 'process.executable: "/usr/bin/sudo"',
          };
          const { id } = await createRule(supertest, log, rule);
          await waitForRuleSuccess({ supertest, log, id });
          await waitForAlertsToBePresent(supertest, log, 10, [id]);
          const alertsOpen = await getAlertsByIds(supertest, log, [id]);
          expect(alertsOpen.hits.hits.length).equal(10);
          const everyAlertOpen = alertsOpen.hits.hits.every(
            (hit) => hit._source?.[ALERT_WORKFLOW_STATUS] === 'open'
          );
          expect(everyAlertOpen).to.eql(true);
        });

        it('should set alerts to acknowledged', async () => {
          const rule = {
            ...getRuleForAlertTesting(['auditbeat-*']),
            query: 'process.executable: "/usr/bin/sudo"',
          };
          const { id } = await createRule(supertest, log, rule);
          await waitForRuleSuccess({ supertest, log, id });
          await waitForAlertsToBePresent(supertest, log, 10, [id]);
          const alertsOpen = await getAlertsByIds(supertest, log, [id]);
          const alertIds = alertsOpen.hits.hits.map((alert) => alert._id!);

          await supertest
            .post(DETECTION_ENGINE_SIGNALS_STATUS_URL)
            .set('kbn-xsrf', 'true')
            .send(setAlertStatus({ alertIds, status: 'acknowledged' }))
            .expect(200);

          const { body: alertsAcknowledged }: { body: estypes.SearchResponse<DetectionAlert> } =
            await supertest
              .post(DETECTION_ENGINE_QUERY_SIGNALS_URL)
              .set('kbn-xsrf', 'true')
              .send(getQueryAlertIds(alertIds))
              .expect(200);

          const everyAlertAcknowledged = alertsAcknowledged.hits.hits.every(
            (hit) => hit._source?.['kibana.alert.workflow_status'] === 'acknowledged'
          );
          expect(everyAlertAcknowledged).to.eql(true);
        });

        it('should close the alerts with the provided closing reason', async () => {
          const rule = {
            ...getRuleForAlertTesting(['auditbeat-*']),
            query: 'process.executable: "/usr/bin/sudo"',
          };
          const { id } = await createRule(supertest, log, rule);
          await waitForRuleSuccess({ supertest, log, id });
          await waitForAlertsToBePresent(supertest, log, 10, [id]);
          const alertsOpen = await getAlertsByIds(supertest, log, [id]);
          const alertIds = alertsOpen.hits.hits.map((alert) => alert._id!);
          const selectedClosingReason = closingReason.enum.automated_closure;

          // set all of the alerts to the state of closed. There is no reason to use a waitUntil here
          // as this route intentionally has a waitFor within it and should only return when the query has
          // the data.
          await supertest
            .post(DETECTION_ENGINE_SIGNALS_STATUS_URL)
            .set('kbn-xsrf', 'true')
            .send(setAlertStatus({ alertIds, status: 'closed', reason: selectedClosingReason }))
            .expect(200);

          await refreshIndex(es, '.alerts-security.alerts-default*');

          const { body: alertsClosed }: { body: estypes.SearchResponse<DetectionAlert> } =
            await supertest
              .post(DETECTION_ENGINE_QUERY_SIGNALS_URL)
              .set('kbn-xsrf', 'true')
              .send(getQueryAlertIds(alertIds))
              .expect(200);

          const everyAlertClosed = alertsClosed.hits.hits.every(
            (hit) => hit._source?.['kibana.alert.workflow_status'] === 'closed'
          );
          expect(everyAlertClosed).to.eql(true);

          //  Every alert should have the same closing reason used
          //  in the request
          const everyAlertClosingReasonMatches = alertsClosed.hits.hits.every(
            (hit) => hit._source?.['kibana.alert.workflow_reason'] === selectedClosingReason
          );
          expect(everyAlertClosingReasonMatches).to.eql(true);
        });

        it('should close alerts matched by a scripted runtime field passed via runtime_mappings', async () => {
          // Regression test for the post-merge issues on PR #288946:
          // runtime_fields only accepted [name, type], so the server synthesised a
          // _source[fieldName] reader and discarded the Painless script. For scripted
          // data view runtime fields, that reader resolves nothing → 0 docs matched.
          // runtime_mappings is the fix: the full mapping travels verbatim to ES so
          // the actual Painless script runs at query time.
          const rule = {
            ...getRuleForAlertTesting(['auditbeat-*']),
            query: 'process.executable: "/usr/bin/sudo"',
          };
          const { id } = await createRule(supertest, log, rule);
          await waitForRuleSuccess({ supertest, log, id });
          await waitForAlertsToBePresent(supertest, log, 10, [id]);

          // The script always emits "scripted_match". Without runtime_mappings reaching
          // ES, the field would be unknown and the term filter would match 0 docs.
          const { body } = await supertest
            .post(DETECTION_ENGINE_SIGNALS_STATUS_URL)
            .set('kbn-xsrf', 'true')
            .send({
              status: 'closed',
              query: { term: { alert_test_rt: 'scripted_match' } },
              runtime_mappings: {
                alert_test_rt: {
                  type: 'keyword',
                  script: { source: "emit('scripted_match')" },
                },
              },
            })
            .expect(200);

          // If the script was discarded (old bug), the term query matches 0 docs and
          // updated would be 0. updated > 0 proves script evaluation happened.
          expect(body.updated).to.be.greaterThan(0);
        });

        it('should close alerts matched by a _source-reading runtime field passed via runtime_mappings', async () => {
          // Regression guard: confirms the runtime_mappings passthrough code path works
          // for entries that read from _source (equivalent to a scriptless runtime field,
          // but using a unique field name so ES cannot resolve it without runtime_mappings
          // being applied — making the test fail under the old behavior).
          //
          // A truly scriptless runtime field (no script property at all) reads from
          // _source by the field name. Using an existing indexed field name as the
          // runtime field name would succeed even without runtime_mappings, making the
          // test vacuous. Using a unique name with a script that explicitly reads from
          // _source via params._source gives the same semantics while proving the param
          // reaches ES: without runtime_mappings, the field is unknown and the term
          // filter matches 0 docs.
          const rule = {
            ...getRuleForAlertTesting(['auditbeat-*']),
            query: 'process.executable: "/usr/bin/sudo"',
          };
          const { id } = await createRule(supertest, log, rule);
          await waitForRuleSuccess({ supertest, log, id });
          await waitForAlertsToBePresent(supertest, log, 10, [id]);

          const { body } = await supertest
            .post(DETECTION_ENGINE_SIGNALS_STATUS_URL)
            .set('kbn-xsrf', 'true')
            .send({
              status: 'closed',
              query: { term: { exec_from_source_rt: '/usr/bin/sudo' } },
              runtime_mappings: {
                exec_from_source_rt: {
                  type: 'keyword',
                  // Reads process.executable from _source — equivalent to what ES
                  // does internally for a scriptless runtime field with that name.
                  script: {
                    // params._source is a nested Map — dotted field names must be
                    // traversed as nested keys, not a literal dotted key at the top level.
                    source:
                      "def p = params._source['process']; if (p != null) { def v = p['executable']; if (v != null) emit(v); }",
                  },
                },
              },
            })
            .expect(200);

          // Without runtime_mappings reaching ES, exec_from_source_rt is an unknown
          // field and the term filter matches 0 docs → updated would be 0.
          expect(body.updated).to.be.greaterThan(0);
        });

        it('should be able close alerts without logging in and workflow_user is set to null', async () => {
          const rule = {
            ...getRuleForAlertTesting(['auditbeat-*']),
            query: 'process.executable: "/usr/bin/sudo"',
          };
          const { id } = await createRule(supertest, log, rule);
          await waitForRuleSuccess({ supertest, log, id });
          await waitForAlertsToBePresent(supertest, log, 10, [id]);
          const alertsOpen = await getAlertsByIds(supertest, log, [id]);
          const alertIds = alertsOpen.hits.hits.map((alert) => alert._id!);

          // set all of the alerts to the state of closed. There is no reason to use a waitUntil here
          // as this route intentionally has a waitFor within it and should only return when the query has
          // the data.
          await supertest
            .post(DETECTION_ENGINE_SIGNALS_STATUS_URL)
            .set('kbn-xsrf', 'true')
            .send(setAlertStatus({ alertIds, status: 'closed' }))
            .expect(200);

          await refreshIndex(es, '.alerts-security.alerts-default*');

          const { body: alertsClosed }: { body: estypes.SearchResponse<DetectionAlert> } =
            await supertest
              .post(DETECTION_ENGINE_QUERY_SIGNALS_URL)
              .set('kbn-xsrf', 'true')
              .send(getQueryAlertIds(alertIds))
              .expect(200);

          const everyAlertClosed = alertsClosed.hits.hits.every(
            (hit) => hit._source?.['kibana.alert.workflow_status'] === 'closed'
          );
          expect(everyAlertClosed).to.eql(true);
          const everyAlertWorkflowUserNull = alertsClosed.hits.hits.every(
            (hit) => hit._source?.['kibana.alert.workflow_user'] === null
          );
          expect(everyAlertWorkflowUserNull).to.eql(true);
          const everyAlertWorkflowStatusUpdatedAtExists = alertsClosed.hits.hits.every(
            (hit) => hit._source?.['kibana.alert.workflow_status_updated_at'] !== null
          );
          expect(everyAlertWorkflowStatusUpdatedAtExists).to.eql(true);
        });
      });
    });
  });
};
