/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { deleteAllAlerts } from '@kbn/detections-response-ftr-services';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';

export default function ({ loadTestFile, getService }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const supertest = getService('supertest');
  const log = getService('log');
  const es = getService('es');

  describe('Attacks - Set Tags APIs', function () {
    before(async () => {
      await deleteAllAlerts(supertest, log, es, [
        '.alerts-security.alerts-*',
        '.alerts-security.attack.discovery.alerts-*',
        '.adhoc.alerts-security.attack.discovery.alerts-*',
      ]);
      await esArchiver.load(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/alerts/8.8.0_multiple_docs',
        {
          useCreate: true,
          docsOnly: true,
        }
      );
      await esArchiver.load(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/attack_alerts',
        {
          useCreate: true,
          docsOnly: true,
        }
      );
    });

    after(async () => {
      await esArchiver.unload(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/alerts/8.8.0_multiple_docs'
      );
      await esArchiver.unload(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/attack_alerts'
      );
    });

    loadTestFile(require.resolve('./set_attacks_tags'));
    loadTestFile(require.resolve('./set_attacks_tags_ess'));
    loadTestFile(require.resolve('./set_attacks_tags_serverless'));
  });
}
