/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import type { FtrProviderContext } from '../../../../ftr_provider_context';
import { SECURITY_ES_ARCHIVES_DIR } from '../../../constants';

export default function ({ getService, getPageObjects, loadTestFile }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const PageObjects = getPageObjects(['timePicker', 'svlCommonPage']);
  const detectionsApi = getService('detectionsApi');
  const retry = getService('retry');
  const es = getService('es');

  const from = '2017-06-10T14:00:00.000Z';
  // next day to include alerts generated in the tests
  const to = moment().add(1, 'day').toISOString();

  describe('discover/security/context_awareness', function () {
    this.tags(['esGate']);

    before(async () => {
      await esArchiver.loadIfNeeded(path.join(SECURITY_ES_ARCHIVES_DIR, 'auditbeat_single'));

      const testRunUuid = uuidv4();
      const ruleName = `Test Rule - ${testRunUuid}`;

      await detectionsApi.createRule({
        body: {
          name: ruleName,
          description: 'test rule',
          type: 'query',
          enabled: true,
          query: '_id: *',
          index: ['auditbeat-*'],
          from: 'now-10y',
          interval: '1m',
          severity: 'high',
          risk_score: 70,
        },
      });

      await esArchiver.load(
        'src/platform/test/functional/fixtures/es_archiver/discover/context_awareness'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover/context_awareness'
      );
      await kibanaServer.uiSettings.update({
        'timepicker:timeDefaults': `{ "from": "${from}", "to": "${to}"}`,
      });

      // Wait for the detection rule (interval: 1m) to produce at least one alert from the
      // auditbeat_single archive. The ES|QL row-indicator test filters by host.name == "siem-kibana",
      // so we poll for that specific field. Allow up to 2 minutes.
      await retry.tryForTime(120_000, async () => {
        await es.indices.refresh({ index: '.alerts-security.alerts-default' }).catch(() => {});
        const { count } = await es.count({
          index: '.alerts-security.alerts-default',
          query: { term: { 'host.name': 'siem-kibana' } },
        });
        if (count === 0) {
          throw new Error('Waiting for detection rule alerts with host.name: siem-kibana');
        }
      });
    });

    after(async () => {
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/discover/context_awareness'
      );
      await kibanaServer.importExport.unload(
        'src/platform/test/functional/fixtures/kbn_archiver/discover/context_awareness'
      );

      await PageObjects.timePicker.resetDefaultAbsoluteRangeViaUiSettings();

      await esArchiver.unload(path.join(SECURITY_ES_ARCHIVES_DIR, 'auditbeat_single'));
    });

    loadTestFile(require.resolve('./default_state'));
    loadTestFile(require.resolve('./cell_renderer'));
    loadTestFile(require.resolve('./row_indicator'));
  });
}
