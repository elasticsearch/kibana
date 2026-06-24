/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import {
  EXCLUDE_RUN_ONCE_FILTER,
  FINAL_SUMMARY_FILTER,
  getRangeFilter,
} from '../constants/client_defaults';
import type { CertFacets } from '../runtime_types';
import { createEsQuery } from '../utils/es_search';
import { MIME_TYPE_CATEGORIES, mimeCategoryQuery } from '../constants/mime_types';
import {
  absoluteDate,
  BROWSER_NETWORK_INFO,
  buildMonitorScopingFilter,
  CERT_HASH_SHA256,
  CERT_ISSUER_COMMON_NAME,
  CERT_SUBJECT_COMMON_NAME,
  FIRST_PARTY,
  THIRD_PARTY,
  PARTY_RUNTIME_MAPPINGS,
  partyQuery,
  DEFAULT_FROM,
  DEFAULT_TO,
} from './get_certs_request_body';

const NOT_AFTER_FIELD = 'tls.server.x509.not_after';

// Distinct certificates are deduped on the subject common name on the certificates
// page (browser network events carry no sha256 fingerprint), so facet counts use
// the same field for their cardinality to stay consistent with the listed totals.
const CERT_ID_FIELD = CERT_SUBJECT_COMMON_NAME;

// Cumulative "expiring within" windows for the certificate summary dots, ordered
// most→least urgent. `now` means already-expired (`not_after <= now`); the rest are
// upper bounds that also include expired certs. Datemath is understood natively by ES
// range queries, and the values must match the UI's EXPIRY_BUCKET_OPTIONS so the dot
// counts equal what clicking them filters to.
export const EXPIRY_WITHIN_WINDOWS = ['now', 'now+1d', 'now+7d', 'now+15d', 'now+30d'] as const;

interface GetCertsFacetsParams {
  monitorIds?: string[];
  from?: string;
  to?: string;
}

export interface GetCertsFacetsRequestBodyOptions {
  ccsEnabled?: boolean;
  remoteNames?: string[];
  spaceId?: string;
  showFromAllSpaces?: boolean;
}

const distinctAgg: Record<string, estypes.AggregationsAggregationContainer> = {
  distinct: { cardinality: { field: CERT_ID_FIELD } },
};

export const getCertsFacetsRequestBody = (
  { monitorIds, from = DEFAULT_FROM, to = DEFAULT_TO }: GetCertsFacetsParams,
  {
    ccsEnabled = false,
    remoteNames,
    spaceId,
    showFromAllSpaces = false,
  }: GetCertsFacetsRequestBodyOptions = {}
) => {
  const lightweightBranchFilter = [FINAL_SUMMARY_FILTER, { exists: { field: CERT_HASH_SHA256 } }];
  const browserBranchFilter = [
    { term: { 'synthetics.type': BROWSER_NETWORK_INFO } },
    { exists: { field: CERT_SUBJECT_COMMON_NAME } },
    { exists: { field: NOT_AFTER_FIELD } },
  ];

  // Counts are global (independent of the active quick-filter selection), so only the
  // base context applies here: certificate-bearing docs from enabled monitors in range.
  const certTypeFilter = {
    bool: {
      minimum_should_match: 1,
      should: [
        { bool: { filter: lightweightBranchFilter } },
        { bool: { filter: browserBranchFilter } },
      ],
    },
  };

  const expiringWithinFilters: Record<string, estypes.QueryDslQueryContainer> = Object.fromEntries(
    EXPIRY_WITHIN_WINDOWS.map((window) => [
      window,
      { range: { [NOT_AFTER_FIELD]: { lte: window } } },
    ])
  );

  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    monitorTypes: {
      terms: { field: 'monitor.type', size: 10 },
      aggs: distinctAgg,
    },
    tags: {
      terms: { field: 'tags', size: 1000 },
      aggs: distinctAgg,
    },
    // Distinct-cert counts per issuing certificate authority. Issuer is recorded
    // on both lightweight and browser certs, so this spans both branches.
    issuers: {
      terms: { field: CERT_ISSUER_COMMON_NAME, size: 1000 },
      aggs: distinctAgg,
    },
    // Resource type and origin only exist on browser network events. Resource type
    // buckets distinct certs into the shared mime categories (one filter each),
    // mirroring the certificates page resource quick filter.
    resourceTypes: {
      filter: { term: { 'synthetics.type': BROWSER_NETWORK_INFO } },
      aggs: {
        byCategory: {
          filters: {
            filters: Object.fromEntries(
              MIME_TYPE_CATEGORIES.map((category) => [category, mimeCategoryQuery(category)])
            ),
          },
          aggs: distinctAgg,
        },
      },
    },
    // Origin buckets distinct certs by `Sec-Fetch-Site` (via the runtime field),
    // mapping same-site/same-origin/none → first-party and cross-site → third-party.
    party: {
      filter: { term: { 'synthetics.type': BROWSER_NETWORK_INFO } },
      aggs: {
        byParty: {
          filters: {
            filters: {
              [FIRST_PARTY]: partyQuery(FIRST_PARTY),
              [THIRD_PARTY]: partyQuery(THIRD_PARTY),
            },
          },
          aggs: distinctAgg,
        },
      },
    },
    expiringWithin: {
      filters: { filters: expiringWithinFilters },
      aggs: distinctAgg,
    },
  };

  return createEsQuery({
    size: 0,
    // Origin facet reads `Sec-Fetch-Site` from `_source` (request headers are not
    // indexed), so it is exposed through a no-script runtime field.
    runtime_mappings: PARTY_RUNTIME_MAPPINGS,
    query: {
      bool: {
        filter: [
          certTypeFilter,
          EXCLUDE_RUN_ONCE_FILTER,
          ...buildMonitorScopingFilter({
            monitorIds,
            ccsEnabled,
            remoteNames,
            spaceId,
            showFromAllSpaces,
          }),
          getRangeFilter({ from: 'now-7d', to: 'now' }),
          {
            range: {
              'monitor.timespan': {
                gte: absoluteDate(from),
                lte: absoluteDate(to),
              },
            },
          },
        ] as estypes.QueryDslQueryContainer,
      },
    },
    aggs,
  });
};

interface DistinctBucket {
  key: string;
  distinct: { value: number };
}

interface CertsFacetsAggs {
  monitorTypes: { buckets: DistinctBucket[] };
  tags: { buckets: DistinctBucket[] };
  issuers: { buckets: DistinctBucket[] };
  resourceTypes: { byCategory: { buckets: Record<string, { distinct: { value: number } }> } };
  party: { byParty: { buckets: Record<string, { distinct: { value: number } }> } };
  expiringWithin: { buckets: Record<string, { distinct: { value: number } }> };
}

const fromKeyedBuckets = (
  buckets: Record<string, { distinct: { value: number } }>,
  order: readonly string[]
): CertFacets['party'] =>
  order.map((value) => ({ value, count: buckets[value]?.distinct.value ?? 0 }));

export const processCertsFacetsResult = (aggregations?: CertsFacetsAggs): CertFacets => {
  const toCounts = (buckets?: DistinctBucket[]): CertFacets['monitorTypes'] =>
    (buckets ?? []).map(({ key, distinct }) => ({ value: key, count: distinct.value }));

  return {
    monitorTypes: toCounts(aggregations?.monitorTypes.buckets),
    tags: toCounts(aggregations?.tags.buckets),
    issuers: toCounts(aggregations?.issuers.buckets),
    resourceTypes: aggregations
      ? fromKeyedBuckets(aggregations.resourceTypes.byCategory.buckets, MIME_TYPE_CATEGORIES)
      : [],
    party: aggregations
      ? fromKeyedBuckets(aggregations.party.byParty.buckets, [FIRST_PARTY, THIRD_PARTY])
      : [],
    expiringWithin: aggregations
      ? fromKeyedBuckets(aggregations.expiringWithin.buckets, EXPIRY_WITHIN_WINDOWS)
      : [],
  };
};
