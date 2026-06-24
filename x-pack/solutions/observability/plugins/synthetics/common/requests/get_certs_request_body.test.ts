/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { GetCertsParams } from '../runtime_types';
import { FINAL_SUMMARY_FILTER } from '../constants/client_defaults';
import type { CertificatesResults } from '../../server/queries/get_certs';
import {
  getCertsRequestBody,
  processCertsResult,
  BROWSER_NETWORK_INFO,
  CERT_HASH_SHA256,
  CERT_ISSUER_COMMON_NAME,
  CERT_SUBJECT_COMMON_NAME,
  FIRST_PARTY,
  THIRD_PARTY,
  SEC_FETCH_SITE_FIELD,
  FIRST_PARTY_SEC_FETCH_VALUES,
  THIRD_PARTY_SEC_FETCH_VALUES,
  PARTY_RUNTIME_MAPPINGS,
  partyQuery,
} from './get_certs_request_body';

describe('origin (party) query helpers', () => {
  it('declares a no-script keyword runtime field over the Sec-Fetch-Site header', () => {
    // Request headers are not indexed; the field must be read from `_source`.
    expect(PARTY_RUNTIME_MAPPINGS).toEqual({
      [SEC_FETCH_SITE_FIELD]: { type: 'keyword' },
    });
    expect(SEC_FETCH_SITE_FIELD).toBe('http.request.headers.sec_fetch_site');
  });

  it('maps same-origin / same-site / none to first-party and cross-site to third-party', () => {
    expect(partyQuery(FIRST_PARTY)).toEqual({
      terms: { [SEC_FETCH_SITE_FIELD]: ['same-origin', 'same-site', 'none'] },
    });
    expect(partyQuery(THIRD_PARTY)).toEqual({
      terms: { [SEC_FETCH_SITE_FIELD]: ['cross-site'] },
    });
  });

  it('keeps the two origin buckets disjoint', () => {
    const overlap = FIRST_PARTY_SEC_FETCH_VALUES.filter((value) =>
      (THIRD_PARTY_SEC_FETCH_VALUES as readonly string[]).includes(value)
    );
    expect(overlap).toEqual([]);
    // `cross-site` is the only third-party signal.
    expect(THIRD_PARTY_SEC_FETCH_VALUES).toEqual(['cross-site']);
  });
});

describe('getCertsRequestBody', () => {
  // Representative params for the recurring TLS alert-rule query (see
  // tls_rule_executor.ts). The rule shares this builder with the certificates
  // page but deliberately leaves `includeBrowserCerts` off to keep its query
  // lean; these tests lock that contract so a future page-side change cannot
  // leak browser-cert machinery into the rule's hot path.
  const ruleParams: GetCertsParams = {
    pageIndex: 0,
    size: 1000,
    sortBy: 'common_name',
    direction: 'desc',
    notValidAfter: 'now+30d',
    notValidBefore: 'now-730d',
    monitorIds: ['monitor-1', 'monitor-2'],
  };

  describe('TLS alert-rule (lean) path', () => {
    it('collapses on the sha256 fingerprint', () => {
      const body = getCertsRequestBody(ruleParams) as estypes.SearchRequest;
      expect(body.collapse?.field).toBe(CERT_HASH_SHA256);
      expect(body.aggs?.total).toEqual({ cardinality: { field: CERT_HASH_SHA256 } });
    });

    it('keeps a single-key sort with no browser-cert tiebreaker', () => {
      const body = getCertsRequestBody(ruleParams) as estypes.SearchRequest;
      expect(body.sort).toEqual([{ [CERT_SUBJECT_COMMON_NAME]: { order: 'desc' } }]);
    });

    it('requests only the distinct-cert total aggregation', () => {
      const body = getCertsRequestBody(ruleParams) as estypes.SearchRequest;
      expect(Object.keys(body.aggs ?? {})).toEqual(['total']);
    });

    it('declares no runtime fields and never reads browser/origin data', () => {
      const body = getCertsRequestBody(ruleParams) as estypes.SearchRequest;
      expect(body.runtime_mappings).toBeUndefined();
      // No browser network-event branch and no Sec-Fetch-Site origin field may
      // leak anywhere into the recurring rule query.
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain(BROWSER_NETWORK_INFO);
      expect(serialized).not.toContain(SEC_FETCH_SITE_FIELD);
    });

    it('matches only certificate-bearing lightweight summary pings', () => {
      const body = getCertsRequestBody(ruleParams) as estypes.SearchRequest;
      const filter = body.query?.bool?.filter as estypes.QueryDslQueryContainer[];
      expect(filter).toEqual(
        expect.arrayContaining([FINAL_SUMMARY_FILTER, { exists: { field: CERT_HASH_SHA256 } }])
      );
      // Without a search term the query carries no should/minimum_should_match.
      expect(body.query?.bool?.should).toBeUndefined();
    });
  });

  describe('certificates page path (includeBrowserCerts)', () => {
    it('collapses on the subject common name and adds the fingerprint tiebreaker', () => {
      const body = getCertsRequestBody({
        ...ruleParams,
        includeBrowserCerts: true,
      }) as estypes.SearchRequest;
      expect(body.collapse?.field).toBe(CERT_SUBJECT_COMMON_NAME);
      expect(body.sort).toEqual([
        { [CERT_SUBJECT_COMMON_NAME]: { order: 'desc' } },
        { [CERT_HASH_SHA256]: { order: 'asc', missing: '_last' } },
      ]);
    });

    it('declares the origin runtime field only when the party filter is active', () => {
      const withoutParty = getCertsRequestBody({
        ...ruleParams,
        includeBrowserCerts: true,
      }) as estypes.SearchRequest;
      expect(withoutParty.runtime_mappings).toBeUndefined();

      const withParty = getCertsRequestBody({
        ...ruleParams,
        includeBrowserCerts: true,
        party: [FIRST_PARTY],
      }) as estypes.SearchRequest;
      expect(withParty.runtime_mappings).toEqual(PARTY_RUNTIME_MAPPINGS);
    });

    it('requests only the distinct-cert total aggregation (summary counts come from the facets endpoint)', () => {
      const body = getCertsRequestBody({
        ...ruleParams,
        includeBrowserCerts: true,
      }) as estypes.SearchRequest;
      expect(Object.keys(body.aggs ?? {})).toEqual(['total']);
    });

    it('adds an issuer (certificate authority) terms filter only when issuers is set', () => {
      const issuerTerms = (body: estypes.SearchRequest) => {
        const filter = (body.query?.bool?.filter ?? []) as estypes.QueryDslQueryContainer[];
        return filter.find((clause) => {
          const terms = clause?.terms;
          return terms != null && CERT_ISSUER_COMMON_NAME in terms;
        });
      };

      const withoutIssuer = getCertsRequestBody({
        ...ruleParams,
        includeBrowserCerts: true,
      }) as estypes.SearchRequest;
      expect(issuerTerms(withoutIssuer)).toBeUndefined();

      const withIssuer = getCertsRequestBody({
        ...ruleParams,
        includeBrowserCerts: true,
        issuers: ["Let's Encrypt", 'DigiCert'],
      }) as estypes.SearchRequest;
      expect(issuerTerms(withIssuer)).toEqual({
        terms: { [CERT_ISSUER_COMMON_NAME]: ["Let's Encrypt", 'DigiCert'] },
      });
    });
  });

  describe('cross-cluster search (CCS) scoping', () => {
    // Picks the local-vs-remote `bool.should` by its `_index` filter — the
    // cert-type `bool.should` (lightweight vs browser) can share the shape.
    const findScopingClause = (body: estypes.SearchRequest) => {
      const filters = (body.query?.bool?.filter ?? []) as estypes.QueryDslQueryContainer[];
      return filters.find((clause) => {
        const should = clause?.bool?.should as estypes.QueryDslQueryContainer[] | undefined;
        return should?.some((branch) => {
          const branchFilters = branch?.bool?.filter as
            | estypes.QueryDslQueryContainer[]
            | undefined;
          return branchFilters?.some(
            (f) => f?.wildcard?._index !== undefined || f?.bool?.must_not !== undefined
          );
        });
      });
    };

    const getBranches = (body: estypes.SearchRequest) => {
      const scoping = findScopingClause(body);
      if (!scoping?.bool?.should) {
        throw new Error('Expected a CCS scoping clause');
      }
      const branches = scoping.bool.should as estypes.QueryDslQueryContainer[];
      expect(branches).toHaveLength(2);
      const [localBranch, remoteBranch] = branches;
      if (!localBranch?.bool?.filter || !remoteBranch?.bool?.filter) {
        throw new Error('Expected both local and remote branches to be set');
      }
      return {
        local: localBranch.bool.filter as estypes.QueryDslQueryContainer[],
        remote: remoteBranch.bool.filter as estypes.QueryDslQueryContainer[],
      };
    };

    it('keeps the local-only monitor.id terms filter when CCS is disabled', () => {
      const body = getCertsRequestBody(ruleParams) as estypes.SearchRequest;
      expect(findScopingClause(body)).toBeUndefined();
      const filters = (body.query?.bool?.filter ?? []) as estypes.QueryDslQueryContainer[];
      expect(filters).toEqual(
        expect.arrayContaining([{ terms: { 'monitor.id': ['monitor-1', 'monitor-2'] } }])
      );
    });

    it('splits monitor.id scoping between local and remote branches when CCS is enabled', () => {
      const body = getCertsRequestBody(ruleParams, {
        ccsEnabled: true,
        spaceId: 'team-a',
      }) as estypes.SearchRequest;

      const { local, remote } = getBranches(body);

      expect(local).toEqual(
        expect.arrayContaining([
          { bool: { must_not: [{ wildcard: { _index: '*:*' } }] } },
          { terms: { 'monitor.id': ['monitor-1', 'monitor-2'] } },
        ])
      );

      expect(remote).toEqual(
        expect.arrayContaining([
          { wildcard: { _index: '*:*' } },
          { terms: { 'meta.space_id': ['team-a', '*'] } },
        ])
      );
      // remoteNames unset → no alias filter.
      expect(remote.find((f) => f?.bool?.should !== undefined)).toBeUndefined();
    });

    it('adds an _index alias filter on the remote branch when remoteNames is set', () => {
      const body = getCertsRequestBody(ruleParams, {
        ccsEnabled: true,
        remoteNames: ['cluster1', 'cluster2'],
        spaceId: 'default',
      }) as estypes.SearchRequest;

      const { remote } = getBranches(body);
      const aliasClause = remote.find((f) => f?.bool?.should !== undefined);
      expect(aliasClause).toEqual({
        bool: {
          should: [{ wildcard: { _index: 'cluster1:*' } }, { wildcard: { _index: 'cluster2:*' } }],
          minimum_should_match: 1,
        },
      });
    });

    it('drops the remote-branch space scoping when showFromAllSpaces is true', () => {
      const body = getCertsRequestBody(ruleParams, {
        ccsEnabled: true,
        spaceId: 'team-a',
        showFromAllSpaces: true,
      }) as estypes.SearchRequest;

      const { remote } = getBranches(body);
      const spaceFilter = remote.find((f) => f?.terms != null && 'meta.space_id' in f.terms);
      expect(spaceFilter).toBeUndefined();
    });

    it('omits the local branch entirely when CCS is on and no local SO ids are passed', () => {
      // Otherwise the local branch collapses to "any local ping", surfacing
      // certs from disabled, deleted, or other-space monitors.
      const body = getCertsRequestBody(
        { ...ruleParams, monitorIds: [] },
        { ccsEnabled: true, spaceId: 'default' }
      ) as estypes.SearchRequest;

      const scoping = findScopingClause(body);
      const branches = (scoping?.bool?.should ?? []) as estypes.QueryDslQueryContainer[];
      expect(branches).toHaveLength(1);

      const [onlyBranch] = branches;
      const onlyBranchFilter = (onlyBranch?.bool?.filter ?? []) as estypes.QueryDslQueryContainer[];
      expect(onlyBranchFilter).toEqual(expect.arrayContaining([{ wildcard: { _index: '*:*' } }]));
    });
  });
});

describe('processCertsResult', () => {
  const buildHit = ({
    index,
    monitorId,
    kibanaUrl,
    innerMonitors = [],
  }: {
    index: string;
    monitorId: string;
    kibanaUrl?: string;
    innerMonitors?: Array<{ index: string; id: string; configId: string; kibanaUrl?: string }>;
  }) =>
    ({
      _index: index,
      _source: {
        '@timestamp': '2025-01-01T00:00:00.000Z',
        config_id: monitorId,
        monitor: { id: monitorId, name: monitorId, type: 'http' },
        observer: { name: 'us-east-1', geo: { name: 'US East' } },
        tls: {
          server: {
            x509: {
              not_after: '2026-01-01T00:00:00.000Z',
              not_before: '2025-01-01T00:00:00.000Z',
              issuer: { common_name: "Let's Encrypt" },
              subject: { common_name: 'example.com' },
            },
            hash: { sha256: `sha-${monitorId}`, sha1: `sha1-${monitorId}` },
          },
        },
        ...(kibanaUrl ? { kibanaUrl } : {}),
      },
      inner_hits: {
        monitors: {
          hits: {
            hits: innerMonitors.map((m) => ({
              _index: m.index,
              _source: {
                monitor: { id: m.id, name: m.id, type: 'http' },
                config_id: m.configId,
                url: { full: `https://${m.id}` },
                ...(m.kibanaUrl ? { kibanaUrl: m.kibanaUrl } : {}),
              },
            })),
          },
        },
      },
    } as unknown as CertificatesResults['hits']['hits'][number]);

  it('omits remote on local certs and local cert monitors', () => {
    const result = processCertsResult({
      hits: {
        hits: [
          buildHit({
            index: '.ds-synthetics-http-default-2025.01.01',
            monitorId: 'mon-1',
            innerMonitors: [
              {
                index: '.ds-synthetics-http-default-2025.01.01',
                id: 'mon-1',
                configId: 'cfg-1',
              },
            ],
          }),
        ],
      },
      aggregations: { total: { value: 1 } },
    } as unknown as CertificatesResults);

    expect(result.certs![0].remote).toBeUndefined();
    expect(result.certs![0].monitors[0].remote).toBeUndefined();
  });

  it('attaches remote to a cert read from a CCS index, with kibanaUrl when present', () => {
    const result = processCertsResult({
      hits: {
        hits: [
          buildHit({
            index: 'cluster1:.ds-synthetics-http-default-2025.01.01',
            monitorId: 'mon-remote',
            kibanaUrl: 'https://remote.kibana',
            innerMonitors: [],
          }),
        ],
      },
      aggregations: { total: { value: 1 } },
    } as unknown as CertificatesResults);

    expect(result.certs![0].remote).toEqual({
      remoteName: 'cluster1',
      kibanaUrl: 'https://remote.kibana',
    });
  });

  it('derives per-monitor remote from each inner hit independently', () => {
    // A fingerprint can recur across clusters (e.g. a wildcard cert), so each
    // monitor's remote must come from its own inner-hit `_index`.
    const result = processCertsResult({
      hits: {
        hits: [
          buildHit({
            index: 'cluster1:.ds-synthetics-http-default-2025.01.01',
            monitorId: 'mon-1',
            innerMonitors: [
              {
                index: 'cluster1:.ds-synthetics-http-default-2025.01.01',
                id: 'mon-1',
                configId: 'cfg-1',
                kibanaUrl: 'https://remote-1.kibana',
              },
              {
                index: '.ds-synthetics-http-default-2025.01.01',
                id: 'mon-2',
                configId: 'cfg-2',
              },
              {
                index: 'cluster2:.ds-synthetics-http-default-2025.01.01',
                id: 'mon-3',
                configId: 'cfg-3',
              },
            ],
          }),
        ],
      },
      aggregations: { total: { value: 1 } },
    } as unknown as CertificatesResults);

    const monitors = result.certs![0].monitors;
    expect(monitors[0].remote).toEqual({
      remoteName: 'cluster1',
      kibanaUrl: 'https://remote-1.kibana',
    });
    expect(monitors[1].remote).toBeUndefined();
    expect(monitors[2].remote).toEqual({ remoteName: 'cluster2' });
  });
});
