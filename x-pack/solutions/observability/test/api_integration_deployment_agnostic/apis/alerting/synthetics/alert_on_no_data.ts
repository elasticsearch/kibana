/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import expect from '@kbn/expect';
import moment from 'moment';
import { SYNTHETICS_API_URLS } from '@kbn/synthetics-plugin/common/constants';
import { waitForDocumentInIndex } from '../../../../common/utils/alerting_wait_for_helpers';
import type { RoleCredentials, SupertestWithRoleScopeType } from '../../../services';
import type { DeploymentAgnosticFtrProviderContext } from '../../../ftr_provider_context';
import {
  SyntheticsRuleHelper,
  SYNTHETICS_ALERT_ACTION_INDEX,
  SYNTHETICS_DOCS_INDEX,
} from './synthetics_rule_helper';

export default function ({ getService }: DeploymentAgnosticFtrProviderContext) {
  const server = getService('kibanaServer');
  const retryService = getService('retry');
  let ruleHelper: SyntheticsRuleHelper;
  const logger = getService('log');
  const esClient = getService('es');
  const esDeleteAllIndices = getService('esDeleteAllIndices');
  const roleScopedSupertest = getService('roleScopedSupertest');
  let supertestEditorWithApiKey: SupertestWithRoleScopeType;
  let supertestAdminWithCookieHeader: SupertestWithRoleScopeType;
  let adminRoleAuthc: RoleCredentials;
  const samlAuth = getService('samlAuth');

  describe('SyntheticsAlertOnNoData', function () {
    // Test failing on MKI and ECH
    this.tags(['skipCloud']);

    const SYNTHETICS_RULE_ALERT_INDEX = '.alerts-observability.uptime.alerts-default';

    before(async () => {
      [supertestEditorWithApiKey, supertestAdminWithCookieHeader, adminRoleAuthc] =
        await Promise.all([
          roleScopedSupertest.getSupertestWithRoleScope('editor', {
            withInternalHeaders: true,
          }),
          roleScopedSupertest.getSupertestWithRoleScope('admin', {
            withInternalHeaders: true,
            useCookieHeader: true,
          }),
          samlAuth.createM2mApiKeyWithRoleScope('admin'),
        ]);

      ruleHelper = new SyntheticsRuleHelper(getService, supertestEditorWithApiKey, adminRoleAuthc);
      await ruleHelper.createIndexAction();
      await supertestAdminWithCookieHeader
        .put(SYNTHETICS_API_URLS.SYNTHETICS_ENABLEMENT)
        .expect(200);
    });

    after(async () => {
      await supertestEditorWithApiKey.destroy();
      await samlAuth.invalidateM2mApiKeyWithRoleScope(adminRoleAuthc);
      await supertestAdminWithCookieHeader.destroy();
      await server.savedObjects.cleanStandardList();
      await esDeleteAllIndices([SYNTHETICS_ALERT_ACTION_INDEX]);
      await esClient.indices
        .deleteDataStream({
          name: SYNTHETICS_DOCS_INDEX,
        })
        .catch();
      await esClient.deleteByQuery({
        index: SYNTHETICS_RULE_ALERT_INDEX,
        query: { match_all: {} },
        ignore_unavailable: true,
        conflicts: 'proceed',
        refresh: true,
      });
      await server.savedObjects.clean({ types: ['rule'] });
    });

    let ruleId = '';
    let monitor: any;

    it('creates a monitor', async () => {
      monitor = await ruleHelper.addMonitor('Monitor check based at ' + moment().format('LLL'));
      expect(monitor).to.have.property('id');
    });

    it('creates a custom rule', async () => {
      const params = {
        condition: {
          alertOnNoData: true,
          locationsThreshold: 1,
          window: {
            numberOfChecks: 5,
          },
          groupBy: 'locationId',
          downThreshold: 5,
          pendingThreshold: 1,
        },
        monitorIds: [monitor.id],
      };
      const rule = await ruleHelper.createCustomStatusRule({
        params,
        name: 'When down 5 times from 1 location, alert on no data',
      });
      ruleId = rule.id;
      expect(rule.params).to.eql(params, JSON.stringify(rule));
    });

    it('should trigger 1 pending alert per location', async function () {
      const [dev1Alert, dev2Alert] = await Promise.all([
        ruleHelper.waitForStatusAlert({
          ruleId,
          filters: [
            { term: { 'kibana.alert.status': 'active' } },
            { term: { 'location.id': 'dev' } },
          ],
        }),
        ruleHelper.waitForStatusAlert({
          ruleId,
          filters: [
            { term: { 'kibana.alert.status': 'active' } },
            { term: { 'location.id': 'dev2' } },
          ],
        }),
      ]);

      expect(dev1Alert.hits.hits.length).to.eql(1);
      expect(dev2Alert.hits.hits.length).to.eql(1);

      const dev1AlertSource: any = dev1Alert.hits.hits[0]._source;
      const dev2AlertSource: any = dev2Alert.hits.hits[0]._source;

      expect(dev1AlertSource['kibana.alert.reason']).to.be(
        `Monitor "${monitor.name}" from Dev Service is pending.`
      );
      expect(dev2AlertSource['kibana.alert.reason']).to.be(
        `Monitor "${monitor.name}" from Dev Service 2 is pending.`
      );

      const [dev1AlertAction, dev2AlertAction] = await Promise.all([
        waitForDocumentInIndex<{
          ruleType: string;
          alertDetailsUrl: string;
          reason: string;
        }>({
          esClient,
          indexName: SYNTHETICS_ALERT_ACTION_INDEX,
          retryService,
          logger,
          filters: [
            {
              term: { 'monitor.id': monitor.id },
            },
            {
              term: { locationId: 'dev' },
            },
          ],
        }),
        waitForDocumentInIndex<{
          ruleType: string;
          alertDetailsUrl: string;
          reason: string;
        }>({
          esClient,
          indexName: SYNTHETICS_ALERT_ACTION_INDEX,
          retryService,
          logger,
          filters: [
            {
              term: { 'monitor.id': monitor.id },
            },
            {
              term: { locationId: 'dev2' },
            },
          ],
        }),
      ]);

      expect(dev1AlertAction.hits.hits.length).to.eql(1);
      expect(dev2AlertAction.hits.hits.length).to.eql(1);

      const dev1AlertActionSource: any = dev1AlertAction.hits.hits[0]._source;
      const dev2AlertActionSource: any = dev2AlertAction.hits.hits[0]._source;

      expect(dev1AlertActionSource.reason).to.be(
        `Monitor "${monitor.name}" from Dev Service is pending.`
      );
      expect(dev2AlertActionSource.reason).to.be(
        `Monitor "${monitor.name}" from Dev Service 2 is pending.`
      );
      expect(dev1AlertActionSource.linkMessage).to.be('');
      expect(dev2AlertActionSource.linkMessage).to.be('');
      expect(dev1AlertActionSource.locationNames).to.be('Dev Service');
      expect(dev2AlertActionSource.locationNames).to.be('Dev Service 2');
    });

    it('should change the message if monitor goes from pending to down and recover the alert if monitor goes from pending to up', async () => {
      const [_, recoveryDoc] = await Promise.all([
        ruleHelper.makeSummaries({
          monitor,
          downChecks: 5,
          location: { id: 'dev', label: 'Dev Service' },
        }),
        ruleHelper.makeSummaries({
          monitor,
          upChecks: 1,
          location: { id: 'dev2', label: 'Dev Service 2' },
        }),
      ]);

      const [dev1Alert, dev2AlertAction] = await Promise.all([
        ruleHelper.waitForStatusAlert({
          ruleId,
          filters: [
            { term: { 'kibana.alert.status': 'active' } },
            { term: { 'location.id': 'dev' } },
            { wildcard: { 'kibana.alert.reason': { value: '*down*' } } },
          ],
        }),
        waitForDocumentInIndex<{
          ruleType: string;
          alertDetailsUrl: string;
          reason: string;
        }>({
          esClient,
          indexName: SYNTHETICS_ALERT_ACTION_INDEX,
          retryService,
          logger,
          filters: [
            {
              term: { 'monitor.id': monitor.id },
            },
            {
              term: { locationId: 'dev2' },
            },
            {
              term: { status: 'recovered' },
            },
          ],
        }),
      ]);

      const dev1AlertHits = dev1Alert.hits.hits;

      expect(dev1AlertHits.length).to.eql(1);

      const dev1AlertSource: any = dev1Alert.hits.hits[0]._source;

      expect(dev1AlertSource['kibana.alert.reason']).to.be(
        `Monitor "${monitor.name}" from Dev Service is down. Monitor is down 5 times within the last 5 checks. Alert when 5 out of the last 5 checks are down from at least 1 location.`
      );

      expect(dev2AlertAction.hits.hits.length).to.eql(1);

      const dev2AlertActionSource: any = dev2AlertAction.hits.hits[0]._source;

      expect(dev2AlertActionSource.recoveryStatus).to.be('is now up');
      expect(dev2AlertActionSource.recoveryReason).to.be(
        `the monitor is now up again. It ran successfully at ${moment(recoveryDoc[0]['@timestamp'])
          .tz('UTC')
          .format('MMM D, YYYY @ HH:mm:ss.SSS')}`
      );
    });
  });
}
