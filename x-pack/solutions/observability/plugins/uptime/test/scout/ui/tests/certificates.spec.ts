/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import crypto from 'crypto';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/ui';
import { tags } from '@kbn/scout-oblt';
import { test, testData } from '../fixtures';

const { DYNAMIC_SETTINGS_DEFAULTS } = testData;

const GENERATED_INDEX = 'heartbeat-8-generated-test';

const getSha256 = () => crypto.randomBytes(64).toString('hex').toUpperCase();

const makeTlsDoc = (
  monitorId: string,
  opts: { sha256?: string; commonName?: string; monitorName?: string; urlFull?: string } = {}
) => {
  const timestamp = new Date();
  const sha256 = opts.sha256 ?? '1a48f1db13c3bd1482ba1073441e74a1bb1308dc445c88749e0dc4f1889a88a4';
  return {
    '@timestamp': timestamp.toISOString(),
    monitor: {
      id: monitorId,
      check_group: uuidv4(),
      type: 'http',
      status: 'up',
      duration: { us: 49347 },
      ip: '127.0.0.1',
      name: opts.monitorName,
      timespan: {
        gte: timestamp.toISOString(),
        lt: new Date(timestamp.getTime() + 5000).toISOString(),
      },
    },
    summary: { up: 1, down: 0 },
    observer: { geo: { name: 'mpls', location: '37.926868, -78.024902' } },
    agent: { type: 'heartbeat', version: '8.0.0', hostname: 'avc-x1e' },
    url: { full: opts.urlFull ?? 'https://www.elastic.co', scheme: 'https' },
    tls: {
      version: '1.3',
      cipher: 'TLS-AES-128-GCM-SHA256',
      server: {
        x509: {
          not_before: '2020-03-01T00:00:00.000Z',
          not_after: moment().add(2, 'months').toISOString(),
          issuer: { common_name: 'DigiCert SHA2 High Assurance Server CA' },
          subject: { common_name: opts.commonName ?? '*.elastic.co' },
          serial_number: '10043199409725537507026285099403602396',
          signature_algorithm: 'SHA256-RSA',
          public_key_algorithm: 'ECDSA',
        },
        hash: {
          sha256,
          sha1: '23291c758d925b9f4bb3584de3763317e94c6ce9',
        },
      },
      established: true,
    },
    event: { dataset: 'uptime' },
  };
};

const UPTIME_ROLE = {
  elasticsearch: {
    cluster: [] as string[],
    indices: [
      {
        names: ['heartbeat-*'],
        privileges: ['read', 'view_index_metadata'],
      },
    ],
  },
  kibana: [
    {
      base: [],
      feature: { uptime: ['all'] },
      spaces: ['*'],
    },
  ],
};

// Failing: See https://github.com/elastic/kibana/issues/270114
test.describe.skip('Uptime certificates', { tag: tags.stateful.classic }, () => {
  test.setTimeout(180_000);

  test.beforeAll(async ({ esArchiver, kbnClient }) => {
    await kbnClient
      .request({
        method: 'PUT',
        path: '/api/uptime/settings',
        body: DYNAMIC_SETTINGS_DEFAULTS,
      })
      .catch(() => {});
    await esArchiver.loadIfNeeded(testData.ES_ARCHIVES.BLANK);
  });

  test.beforeEach(async ({ browserAuth, esClient }) => {
    await esClient.index({
      index: GENERATED_INDEX,
      document: makeTlsDoc('tls-default-monitor'),
      refresh: 'wait_for',
    });
    await browserAuth.loginWithCustomRole(UPTIME_ROLE);
  });

  test.afterAll(async ({ esClient }) => {
    try {
      await esClient.indices.delete({ index: GENERATED_INDEX });
    } catch {
      // ignore
    }
  });

  test('navigates to cert page and displays certificates', async ({ pageObjects }) => {
    // No date range arg on purpose: this spec indexes a live doc at `new Date()` instead of
    // loading the 2019 FULL_HEARTBEAT archive. Passing DEFAULT_NAVIGATION_SEARCH would pin the
    // picker to 2019 and the certs query would always exclude the doc.
    await pageObjects.uptimeApp.navigateToOverview();
    await pageObjects.uptimeApp.waitForDataLoaded();

    await test.step('cert button visible and navigates to cert page', async () => {
      const hasCertButton = await pageObjects.uptimeApp.hasViewCertButton();
      expect(hasCertButton).toBe(true);
      await pageObjects.uptimeApp.navigateToCertificates();
      await pageObjects.uptimeApp.certificatesPage.waitFor({ state: 'visible', timeout: 30_000 });
    });

    await test.step('displays at least one certificate', async () => {
      await expect(async () => {
        await pageObjects.uptimeApp.refreshCertificates();
        const total = await pageObjects.uptimeApp.getCertificateTotal();
        expect(Number(total)).toBeGreaterThanOrEqual(1);
      }).toPass({ timeout: 90_000 });
    });
  });

  test('displays specific certificate', async ({ pageObjects, esClient }) => {
    const certId = getSha256();
    const monitorId = `cert-specific-${Date.now()}`;
    await esClient.index({
      index: GENERATED_INDEX,
      document: makeTlsDoc(monitorId, { sha256: certId }),
      refresh: 'wait_for',
    });

    await pageObjects.uptimeApp.navigateToOverview();
    await pageObjects.uptimeApp.navigateToCertificates();

    await expect(async () => {
      await pageObjects.uptimeApp.refreshCertificates();
      await pageObjects.uptimeApp.certificateExists(certId, monitorId);
    }).toPass({ timeout: 90_000 });
  });

  test('performs search against monitor id', async ({ pageObjects, esClient }) => {
    const certId = getSha256();
    const monitorId = `cert-search-${Date.now()}`;
    await esClient.index({
      index: GENERATED_INDEX,
      document: makeTlsDoc(monitorId, {
        sha256: certId,
        monitorName: 'Cert Test Check',
        urlFull: 'https://site-to-check.com/',
      }),
      refresh: 'wait_for',
    });

    await pageObjects.uptimeApp.navigateToOverview();
    await pageObjects.uptimeApp.navigateToCertificates();

    await expect(async () => {
      await pageObjects.uptimeApp.refreshCertificates();
      await pageObjects.uptimeApp.searchCertificates(monitorId);
      const total = await pageObjects.uptimeApp.getCertificateTotal();
      expect(Number(total)).toBe(1);
    }).toPass({ timeout: 90_000 });
  });
});
