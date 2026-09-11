/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { makeUpSummary } from '@kbn/observability-synthetics-test-data';
import { v4 as uuidv4 } from 'uuid';
import type { ApiClientFixture, EsClient } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import { apiTest, mergeSyntheticsApiHeaders, SYNTHETICS_API_URLS } from '../../../common/fixtures';
import { addMonitor } from '../../../common/fixtures/monitors';

const SYNTHETICS_MONITOR_TYPE = 'synthetics-monitor';
const LEGACY_SYNTHETICS_MONITOR_TYPE = 'synthetics-monitor-multi-space';

const HTTP_DATA_STREAM = 'synthetics-http-default';
const BROWSER_NETWORK_DATA_STREAM = 'synthetics-browser.network-default';
const TEST_TAG = 'scout-cert-tag';
const BROWSER_TAG = 'scout-cert-browser-tag';
const OTHER_SPACE_TAG = 'scout-cert-other-space-tag';

const DAY_MS = 24 * 60 * 60 * 1000;

interface CertResultBody {
  total: number;
  certs: Array<{
    common_name?: string;
    issuer?: string;
    sha256?: string;
    monitorType?: string;
    monitors: Array<{ id?: string; type?: string; spaces?: string[] }>;
  }>;
}

interface CertFacetCount {
  value: string;
  count: number;
}

interface CertFacetsBody {
  monitorTypes: CertFacetCount[];
  tags: CertFacetCount[];
  issuers: CertFacetCount[];
  resourceTypes: CertFacetCount[];
  certOrigin: CertFacetCount[];
  expiringWithin: CertFacetCount[];
}

const findCount = (counts: CertFacetCount[], value: string) =>
  counts.find((entry) => entry.value === value)?.count;

// Both certs routes wrap their payload in a `{ data }` envelope, so unwrap it
// before asserting on the cert result / facets shape.
const certData = (res: { body: unknown }): CertResultBody =>
  (res.body as { data: CertResultBody }).data;

/**
 * API coverage for the certificates route (`GET internal/synthetics/certs`),
 * focused on the changes that power the TLS Certificates page: browser-inclusive
 * querying, the cumulative "expiring within" facet windows that feed the summary
 * dots, and the `monitorTypes` / `tags` quick-filter query params.
 *
 * Tests share worker-scoped Kibana/ES state and run sequentially, so the empty
 * assertion runs first and later tests build on the seeded certificates.
 */
apiTest.describe(
  'getCertificates',
  {
    tag: [...tags.stateful.classic, ...tags.serverless.observability.complete],
  },
  () => {
    let editorHeaders: Record<string, string>;
    let monitorId: string;
    const now = Date.now();

    const indexCertPing = async (
      esClient: EsClient,
      {
        commonName,
        sha256,
        tlsNotAfter,
        id = monitorId,
        tags = [TEST_TAG],
      }: {
        commonName: string;
        sha256: string;
        tlsNotAfter: string;
        id?: string;
        tags?: string[];
      }
    ) => {
      // Start from a realistic "up" summary ping (carries final-attempt summary,
      // recent timespan and full `tls.server.*`), then override the fields the
      // certs query dedupes/buckets on.
      const document = makeUpSummary({
        monitorId: id,
        configId: id,
        timestamp: new Date(now).toISOString(),
        tlsNotAfter,
      }) as Record<string, any>;
      document.tags = tags;
      document.tls.server.x509.subject.common_name = commonName;
      document.tls.server.x509.subject.distinguished_name = `CN=${commonName}`;
      document.tls.server.hash.sha256 = sha256;

      await esClient.index({ index: HTTP_DATA_STREAM, document, refresh: 'wait_for' });
    };

    // Seeds a browser network event (`synthetics.type: journey/network_info`) that
    // carries a TLS certificate, a response mime type (resource-type filter) and a
    // `Sec-Fetch-Site` request header (origin filter). It reuses the enabled HTTP
    // monitor's id because the certs query matches browser events by
    // `synthetics.type` + monitor id, not by the monitor's saved-object type.
    const indexBrowserNetworkCert = async (
      esClient: EsClient,
      {
        commonName,
        mimeType,
        secFetchSite,
      }: { commonName: string; mimeType: string; secFetchSite: string }
    ) => {
      const document: Record<string, any> = {
        '@timestamp': new Date(now).toISOString(),
        config_id: monitorId,
        monitor: {
          id: monitorId,
          name: 'Cert browser monitor',
          type: 'browser',
          timespan: {
            gte: new Date(now - 3 * 60 * 1000).toISOString(),
            lt: new Date(now).toISOString(),
          },
        },
        synthetics: { type: 'journey/network_info' },
        url: { full: 'https://browser.scout.test/' },
        observer: { name: 'test-private-location', geo: { name: 'Test private location' } },
        agent: { name: 'scout-agent' },
        http: {
          response: { mime_type: mimeType },
          // Request headers live only in `_source`; the origin filter reads this via
          // a runtime field.
          request: { headers: { sec_fetch_site: secFetchSite } },
        },
        tls: {
          server: {
            x509: {
              subject: { common_name: commonName, distinguished_name: `CN=${commonName}` },
              issuer: { common_name: 'Browser Test CA' },
              not_after: new Date(now + 60 * DAY_MS).toISOString(),
              not_before: new Date(now - 60 * DAY_MS).toISOString(),
            },
          },
        },
        tags: [BROWSER_TAG],
      };
      await esClient.index({
        index: BROWSER_NETWORK_DATA_STREAM,
        document,
        refresh: 'wait_for',
      });
    };

    const getCerts = async (apiClient: ApiClientFixture, query = '') => {
      const res = await apiClient.get(`${SYNTHETICS_API_URLS.CERTS}${query}`, {
        headers: editorHeaders,
        responseType: 'json',
      });
      return res;
    };

    const getCertFacets = async (apiClient: ApiClientFixture, query = '') => {
      const res = await apiClient.get(`${SYNTHETICS_API_URLS.CERTS_FACETS}${query}`, {
        headers: editorHeaders,
        responseType: 'json',
      });
      return res;
    };

    apiTest.beforeAll(async ({ requestAuth, apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({
        types: [SYNTHETICS_MONITOR_TYPE, LEGACY_SYNTHETICS_MONITOR_TYPE],
      });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
      await apiServices.syntheticsPrivateLocations.getSharedPrivateLocation();
    });

    apiTest.afterAll(async ({ kbnClient, esClient }) => {
      await kbnClient.savedObjects.clean({
        types: [SYNTHETICS_MONITOR_TYPE, LEGACY_SYNTHETICS_MONITOR_TYPE],
      });
      await esClient.deleteByQuery({
        index: `${HTTP_DATA_STREAM}*,${BROWSER_NETWORK_DATA_STREAM}*`,
        query: { terms: { tags: [TEST_TAG, BROWSER_TAG, OTHER_SPACE_TAG] } },
        conflicts: 'proceed',
        refresh: true,
        ignore_unavailable: true,
      });
    });

    apiTest('returns an empty result when no monitors are configured', async ({ apiClient }) => {
      const res = await getCerts(apiClient);
      expect(res).toHaveStatusCode(200);
      expect(certData(res)).toMatchObject({ certs: [], total: 0 });

      // The facets route short-circuits to empty arrays (skipping the ES query)
      // when no monitor is enabled.
      const facetsRes = await getCertFacets(apiClient);
      expect(facetsRes).toHaveStatusCode(200);
      expect((facetsRes.body as { data: CertFacetsBody }).data).toStrictEqual({
        monitorTypes: [],
        tags: [],
        issuers: [],
        resourceTypes: [],
        certOrigin: [],
        expiringWithin: [],
      });
    });

    apiTest(
      'returns lightweight certificates across the expiry spectrum',
      async ({ apiClient, apiServices, esClient }) => {
        const privateLocation =
          await apiServices.syntheticsPrivateLocations.getSharedPrivateLocation();
        const created = await addMonitor(apiClient, editorHeaders, {
          name: 'Cert HTTP monitor',
          type: 'http',
          urls: 'https://cert.scout.test',
          tags: [TEST_TAG],
          locations: [privateLocation],
        });
        monitorId = (created.body as { id: string }).id;

        // One cert per expiry bucket so the cumulative facet windows are
        // exercised: valid (far future), expiring within the 30d window, and
        // already-expired.
        await indexCertPing(esClient, {
          commonName: 'valid.scout.test',
          sha256: 'a'.repeat(64),
          tlsNotAfter: new Date(now + 60 * DAY_MS).toISOString(),
        });
        await indexCertPing(esClient, {
          commonName: 'expiring.scout.test',
          sha256: 'b'.repeat(64),
          tlsNotAfter: new Date(now + 10 * DAY_MS).toISOString(),
        });
        await indexCertPing(esClient, {
          commonName: 'expired.scout.test',
          sha256: 'c'.repeat(64),
          tlsNotAfter: new Date(now - 10 * DAY_MS).toISOString(),
        });

        const res = await getCerts(apiClient);
        expect(res).toHaveStatusCode(200);
        const body = certData(res);

        expect(body.total).toBe(3);

        const validCert = body.certs.find((cert) => cert.common_name === 'valid.scout.test');
        expect(validCert).toBeDefined();
        expect(validCert).toMatchObject({
          common_name: 'valid.scout.test',
          issuer: 'GTS CA 1C3',
          monitorType: 'http',
        });
        expect(typeof validCert?.sha256).toBe('string');
        expect(validCert?.monitors?.[0]).toMatchObject({ id: monitorId, type: 'http' });
      }
    );

    apiTest('filters certificates by monitor type', async ({ apiClient }) => {
      const tcpRes = await getCerts(apiClient, '?monitorTypes=tcp');
      expect(tcpRes).toHaveStatusCode(200);
      expect(certData(tcpRes).total).toBe(0);

      const httpRes = await getCerts(apiClient, '?monitorTypes=http');
      expect(httpRes).toHaveStatusCode(200);
      expect(certData(httpRes).total).toBe(3);
    });

    apiTest('filters certificates by tag', async ({ apiClient }) => {
      const matchRes = await getCerts(apiClient, `?tags=${TEST_TAG}`);
      expect(matchRes).toHaveStatusCode(200);
      expect(certData(matchRes).total).toBe(3);

      const missRes = await getCerts(apiClient, '?tags=this-tag-does-not-exist');
      expect(missRes).toHaveStatusCode(200);
      expect(certData(missRes).total).toBe(0);
    });

    apiTest('filters certificates by issuer (CA)', async ({ apiClient }) => {
      // All three seeded lightweight certs share the issuer `GTS CA 1C3`.
      const matchRes = await getCerts(apiClient, `?issuers=${encodeURIComponent('GTS CA 1C3')}`);
      expect(matchRes).toHaveStatusCode(200);
      expect(certData(matchRes).total).toBe(3);

      const missRes = await getCerts(apiClient, `?issuers=${encodeURIComponent('Nonexistent CA')}`);
      expect(missRes).toHaveStatusCode(200);
      expect(certData(missRes).total).toBe(0);
    });

    apiTest('filters certificates by expiry window (notValidAfter)', async ({ apiClient }) => {
      // `notValidAfter` keeps certs with `not_after <= now+window`, including
      // already-expired ones. `encodeURIComponent` preserves the datemath `+`.
      const within30 = await getCerts(apiClient, `?notValidAfter=${encodeURIComponent('now+30d')}`);
      expect(within30).toHaveStatusCode(200);
      // expiring.scout.test (now+10d) and expired.scout.test (now-10d); excludes valid (now+60d).
      expect(certData(within30).total).toBe(2);

      const withinYear = await getCerts(
        apiClient,
        `?notValidAfter=${encodeURIComponent('now+1y')}`
      );
      expect(withinYear).toHaveStatusCode(200);
      expect(certData(withinYear).total).toBe(3);
    });

    apiTest('returns global distinct-cert counts per filter value', async ({ apiClient }) => {
      const res = await getCertFacets(apiClient);
      expect(res).toHaveStatusCode(200);
      const facets = (res.body as { data: CertFacetsBody }).data;

      // All three seeded certs come from one HTTP monitor and share TEST_TAG and
      // the same issuing CA.
      expect(findCount(facets.monitorTypes, 'http')).toBe(3);
      expect(findCount(facets.tags, TEST_TAG)).toBe(3);
      expect(findCount(facets.issuers, 'GTS CA 1C3')).toBe(3);

      // Resource-type categories are always reported (derived from
      // `http.response.mime_type` via the shared mime taxonomy); with no browser
      // network events indexed, every category — and both origins — is zero.
      expect(facets.resourceTypes.map((entry) => entry.value)).toStrictEqual([
        'html',
        'stylesheet',
        'font',
        'script',
        'image',
        'media',
        'xhr',
        'other',
      ]);
      expect(facets.resourceTypes.every((entry) => entry.count === 0)).toBe(true);
      expect(findCount(facets.certOrigin, 'first_party')).toBe(0);
      expect(findCount(facets.certOrigin, 'third_party')).toBe(0);

      // Cumulative "expiring within" windows over not_after of the seeded certs:
      // expired (now-10d), expiring (now+10d), valid (now+60d). `now` counts the
      // already-expired cert; each later window includes the earlier ones.
      expect(findCount(facets.expiringWithin, 'now')).toBe(1);
      expect(findCount(facets.expiringWithin, 'now+1d')).toBe(1);
      expect(findCount(facets.expiringWithin, 'now+7d')).toBe(1);
      expect(findCount(facets.expiringWithin, 'now+15d')).toBe(2);
      expect(findCount(facets.expiringWithin, 'now+30d')).toBe(2);
    });

    apiTest(
      'includes browser certificates and scopes them by resource type and origin',
      async ({ apiClient, esClient }) => {
        // A first-party HTML-document cert and a third-party script cert, captured
        // on a browser monitor's network events.
        await indexBrowserNetworkCert(esClient, {
          commonName: 'first.browser.scout.test',
          mimeType: 'text/html',
          secFetchSite: 'same-origin',
        });
        await indexBrowserNetworkCert(esClient, {
          commonName: 'third.browser.scout.test',
          mimeType: 'application/javascript',
          secFetchSite: 'cross-site',
        });

        // monitorTypes=browser returns both browser certs, deduped on common name,
        // with no fingerprint (browser network events don't capture sha256).
        const browserRes = await getCerts(apiClient, '?monitorTypes=browser');
        expect(browserRes).toHaveStatusCode(200);
        const browserBody = certData(browserRes);
        expect(browserBody.total).toBe(2);
        expect(browserBody.certs.map((cert) => cert.common_name).sort()).toStrictEqual([
          'first.browser.scout.test',
          'third.browser.scout.test',
        ]);
        expect(browserBody.certs.every((cert) => cert.sha256 === undefined)).toBe(true);

        // Resource-type filter narrows by response mime category (text/html -> html,
        // application/javascript -> script).
        const htmlRes = await getCerts(apiClient, '?browserResourceTypes=html');
        expect(htmlRes).toHaveStatusCode(200);
        expect(certData(htmlRes).certs.map((cert) => cert.common_name)).toStrictEqual([
          'first.browser.scout.test',
        ]);

        const scriptRes = await getCerts(apiClient, '?browserResourceTypes=script');
        expect(scriptRes).toHaveStatusCode(200);
        expect(certData(scriptRes).certs.map((cert) => cert.common_name)).toStrictEqual([
          'third.browser.scout.test',
        ]);

        // Origin filter maps Sec-Fetch-Site onto first/third-party (same-origin ->
        // first-party, cross-site -> third-party).
        const firstPartyRes = await getCerts(apiClient, '?certOrigin=first_party');
        expect(firstPartyRes).toHaveStatusCode(200);
        expect(certData(firstPartyRes).certs.map((cert) => cert.common_name)).toStrictEqual([
          'first.browser.scout.test',
        ]);

        const thirdPartyRes = await getCerts(apiClient, '?certOrigin=third_party');
        expect(thirdPartyRes).toHaveStatusCode(200);
        expect(certData(thirdPartyRes).certs.map((cert) => cert.common_name)).toStrictEqual([
          'third.browser.scout.test',
        ]);
      }
    );

    apiTest('reports browser resource-type and origin facet counts', async ({ apiClient }) => {
      const res = await getCertFacets(apiClient);
      expect(res).toHaveStatusCode(200);
      const facets = (res.body as { data: CertFacetsBody }).data;

      // One html + one script browser cert were seeded by the previous test.
      expect(findCount(facets.resourceTypes, 'html')).toBe(1);
      expect(findCount(facets.resourceTypes, 'script')).toBe(1);
      expect(findCount(facets.resourceTypes, 'image')).toBe(0);

      // One first-party (same-origin) + one third-party (cross-site).
      expect(findCount(facets.certOrigin, 'first_party')).toBe(1);
      expect(findCount(facets.certOrigin, 'third_party')).toBe(1);

      // Browser certs now appear alongside the three lightweight HTTP certs.
      expect(findCount(facets.monitorTypes, 'browser')).toBe(2);
      expect(findCount(facets.monitorTypes, 'http')).toBe(3);

      // Issuer facet spans both branches: the lightweight CA plus the browser CA.
      expect(findCount(facets.issuers, 'GTS CA 1C3')).toBe(3);
      expect(findCount(facets.issuers, 'Browser Test CA')).toBe(2);
    });

    apiTest(
      'includes certificates from other permitted spaces when showFromAllSpaces is true',
      async ({ apiClient, apiServices, esClient, kbnClient }) => {
        const spaceId = `cert-space-${uuidv4()}`;
        await kbnClient.spaces.create({ id: spaceId, name: `Cert space ${spaceId}` });
        try {
          const spaceLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation(
            spaceId
          );
          const created = await addMonitor(
            apiClient,
            editorHeaders,
            {
              name: 'Other space cert monitor',
              type: 'http',
              urls: 'https://other-space.scout.test',
              tags: [OTHER_SPACE_TAG],
              locations: [spaceLocation],
              spaces: [],
            },
            { spaceId }
          );
          const otherMonitorId = (created.body as { id: string }).id;

          await indexCertPing(esClient, {
            commonName: 'other-space.scout.test',
            sha256: 'd'.repeat(64),
            tlsNotAfter: new Date(now + 60 * DAY_MS).toISOString(),
            id: otherMonitorId,
            tags: [OTHER_SPACE_TAG],
          });

          const withoutAll = await getCerts(apiClient);
          expect(withoutAll).toHaveStatusCode(200);
          expect(certData(withoutAll).certs.map((cert) => cert.common_name)).not.toContain(
            'other-space.scout.test'
          );

          const withAll = await getCerts(apiClient, '?showFromAllSpaces=true');
          expect(withAll).toHaveStatusCode(200);
          const otherCert = certData(withAll).certs.find(
            (cert) => cert.common_name === 'other-space.scout.test'
          );
          expect(otherCert).toBeDefined();
          expect(otherCert?.monitors?.[0]).toMatchObject({
            id: otherMonitorId,
            spaces: [spaceId],
          });

          const defaultFacets = await getCertFacets(apiClient);
          expect(defaultFacets).toHaveStatusCode(200);
          expect(
            findCount((defaultFacets.body as { data: CertFacetsBody }).data.tags, OTHER_SPACE_TAG)
          ).toBeUndefined();

          const allFacets = await getCertFacets(apiClient, '?showFromAllSpaces=true');
          expect(allFacets).toHaveStatusCode(200);
          expect(
            findCount((allFacets.body as { data: CertFacetsBody }).data.tags, OTHER_SPACE_TAG)
          ).toBe(1);
        } finally {
          await kbnClient.spaces.delete(spaceId).catch(() => {});
        }
      }
    );
  }
);
