/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import DateMath from '@kbn/datemath';
import { isNonLocalIndexName } from '@kbn/es-query';

// Inlined: the constant lives in a non-public sub-path of `@kbn/spaces-plugin`
// that the public bundle optimizer rejects. Stable saved-objects contract.
const ALL_SPACES_ID = '*';
import {
  EXCLUDE_RUN_ONCE_FILTER,
  FINAL_SUMMARY_FILTER,
  getRangeFilter,
} from '../constants/client_defaults';
import { selectedMimeCategoriesQuery } from '../constants/mime_types';
import type { CertificatesResults } from '../../server/queries/get_certs';
import type { CertResult, GetCertsParams, Ping, RemoteMonitorInfo } from '../runtime_types';
import { createEsQuery } from '../utils/es_search';

import { asMutableArray } from '../utils/as_mutable_array';

enum SortFields {
  'issuer' = 'tls.server.x509.issuer.common_name',
  'not_after' = 'tls.server.x509.not_after',
  'not_before' = 'tls.server.x509.not_before',
  'common_name' = 'tls.server.x509.subject.common_name',
}

export const DEFAULT_SORT = 'not_after';
export const DEFAULT_DIRECTION = 'asc';
export const DEFAULT_SIZE = 20;
export const DEFAULT_FROM = 'now-20m';
export const DEFAULT_TO = 'now';

export const CERT_HASH_SHA256 = 'tls.server.hash.sha256';
export const CERT_SUBJECT_COMMON_NAME = 'tls.server.x509.subject.common_name';
export const CERT_ISSUER_COMMON_NAME = 'tls.server.x509.issuer.common_name';

// `synthetics.type` value stamped on browser monitor network events, which is
// where browser TLS certificates are captured.
export const BROWSER_NETWORK_INFO = 'journey/network_info';

// Values used by the browser-cert "party" quick filter (first- vs third-party).
// Shared with the UI control.
export const FIRST_PARTY = 'first_party';
export const THIRD_PARTY = 'third_party';

// Origin is derived from the browser-emitted `Sec-Fetch-Site` fetch-metadata
// header (captured at `http.request.headers.sec_fetch_site`). The legacy
// `http.request.is_same_site` boolean is no longer collected by the synthetics
// agent, so we read the header instead. It lives only in `_source` (request
// headers are not indexed), hence the no-script runtime field below — the same
// pattern the step waterfall uses for `synthetics.payload.transfer_size`.
export const SEC_FETCH_SITE_FIELD = 'http.request.headers.sec_fetch_site';

// `same-origin`/`same-site` are the monitored site itself; `none` is the
// user-initiated top-level navigation (the page's own document). `cross-site`
// is a different registrable domain, i.e. a third-party resource (CDN, ads…).
export const FIRST_PARTY_SEC_FETCH_VALUES = ['same-origin', 'same-site', 'none'] as const;
export const THIRD_PARTY_SEC_FETCH_VALUES = ['cross-site'] as const;

export const PARTY_RUNTIME_MAPPINGS: estypes.MappingRuntimeFields = {
  [SEC_FETCH_SITE_FIELD]: { type: 'keyword' },
};

export const partyQuery = (
  party: typeof FIRST_PARTY | typeof THIRD_PARTY
): estypes.QueryDslQueryContainer => ({
  terms: {
    [SEC_FETCH_SITE_FIELD]: [
      ...(party === FIRST_PARTY ? FIRST_PARTY_SEC_FETCH_VALUES : THIRD_PARTY_SEC_FETCH_VALUES),
    ],
  },
});

export function absoluteDate(relativeDate: string) {
  return DateMath.parse(relativeDate)?.valueOf() ?? relativeDate;
}

export interface BuildMonitorScopingFilterArgs {
  monitorIds?: string[];
  ccsEnabled: boolean;
  remoteNames?: string[];
  spaceId?: string;
  showFromAllSpaces: boolean;
}

/**
 * Scopes the cert search to local pings whose `monitor.id` is in the enabled
 * SO list, plus (when CCS is on) any remote ping. Remote-only monitors have no
 * local SO to gate them against — mirrors `overview_status_service.ts`.
 */
export const buildMonitorScopingFilter = ({
  monitorIds,
  ccsEnabled,
  remoteNames,
  spaceId,
  showFromAllSpaces,
}: BuildMonitorScopingFilterArgs): estypes.QueryDslQueryContainer[] => {
  const hasMonitorIds = Boolean(monitorIds && monitorIds.length > 0);

  if (!ccsEnabled) {
    return hasMonitorIds ? [{ terms: { 'monitor.id': monitorIds! } }] : [];
  }

  // `_index` only supports `wildcard` (not `terms`), so one clause per alias.
  const remoteAliasFilter: estypes.QueryDslQueryContainer | undefined = remoteNames?.length
    ? {
        bool: {
          should: remoteNames.map((alias) => ({ wildcard: { _index: `${alias}:*` } })),
          minimum_should_match: 1,
        },
      }
    : undefined;

  // Remote pings carry no SO; gate them on the active space directly.
  // (Local pings are space-gated upstream via the SO query.)
  const remoteSpaceFilter: estypes.QueryDslQueryContainer | undefined =
    !showFromAllSpaces && spaceId
      ? { terms: { 'meta.space_id': [spaceId, ALL_SPACES_ID] } }
      : undefined;

  // Drop the local branch when no SO ids — otherwise it collapses to "any
  // local ping", leaking certs from disabled/deleted/other-space monitors
  // (space scoping on the local branch is implicit via `monitor.id`).
  const localBranchFilters: estypes.QueryDslQueryContainer[] | undefined = hasMonitorIds
    ? [
        { bool: { must_not: [{ wildcard: { _index: '*:*' } }] } },
        { terms: { 'monitor.id': monitorIds! } },
      ]
    : undefined;

  const remoteBranchFilters: estypes.QueryDslQueryContainer[] = [
    { wildcard: { _index: '*:*' } },
    ...(remoteAliasFilter ? [remoteAliasFilter] : []),
    ...(remoteSpaceFilter ? [remoteSpaceFilter] : []),
  ];

  return [
    {
      bool: {
        minimum_should_match: 1,
        should: [
          ...(localBranchFilters ? [{ bool: { filter: localBranchFilters } }] : []),
          { bool: { filter: remoteBranchFilters } },
        ],
      },
    },
  ];
};

export interface GetCertsRequestBodyOptions {
  // When true, also admit remote (CCS) pings. See `buildMonitorScopingFilter`.
  ccsEnabled?: boolean;
  // Restrict the remote branch to these cluster aliases.
  remoteNames?: string[];
  // Active Kibana space; scopes the remote branch.
  spaceId?: string;
  // Skip the active-space scoping on the remote branch (for all-spaces readers).
  showFromAllSpaces?: boolean;
}

export const getCertsRequestBody = (
  {
    monitorIds,
    pageIndex,
    search,
    notValidBefore,
    notValidAfter,
    size = DEFAULT_SIZE,
    to = DEFAULT_TO,
    from = DEFAULT_FROM,
    sortBy = DEFAULT_SORT,
    direction = DEFAULT_DIRECTION,
    filters,
    monitorTypes,
    browserResourceTypes,
    party,
    tags,
    issuers,
    includeBrowserCerts = false,
  }: GetCertsParams,
  {
    ccsEnabled = false,
    remoteNames,
    spaceId,
    showFromAllSpaces = false,
  }: GetCertsRequestBodyOptions = {}
) => {
  const sort = SortFields[sortBy as keyof typeof SortFields];

  // The collapse/dedupe key. For the lightweight-only query we keep using the
  // indexed sha256 fingerprint. When browser certs are included we dedupe on the
  // certificate subject common name instead, because browser network events do
  // not index a `tls.server.hash.sha256` fingerprint (and `collapse` cannot run
  // on a runtime field, which has no doc_values).
  const certIdField = includeBrowserCerts ? CERT_SUBJECT_COMMON_NAME : CERT_HASH_SHA256;

  // Browser-only quick filters, derived from fields that only exist on browser
  // network events. Origin maps the `Sec-Fetch-Site` header (read via the
  // `SEC_FETCH_SITE_FIELD` runtime field) onto first-/third-party; resource type
  // maps the indexed `http.response.mime_type` onto the shared mime categories
  // (the browser engine's own `synthetics.payload.type` is stored unindexed, so
  // it is not queryable — see common/constants/mime_types.ts).
  const wantsFirstParty = party?.includes(FIRST_PARTY);
  const wantsThirdParty = party?.includes(THIRD_PARTY);
  const partyFilter =
    wantsFirstParty && !wantsThirdParty
      ? [partyQuery(FIRST_PARTY)]
      : wantsThirdParty && !wantsFirstParty
      ? [partyQuery(THIRD_PARTY)]
      : [];
  const hasResourceTypeFilter = Boolean(browserResourceTypes && browserResourceTypes.length > 0);

  const browserBranchFilter = [
    { term: { 'synthetics.type': BROWSER_NETWORK_INFO } },
    { exists: { field: CERT_SUBJECT_COMMON_NAME } },
    { exists: { field: 'tls.server.x509.not_after' } },
    ...(hasResourceTypeFilter ? [selectedMimeCategoriesQuery(browserResourceTypes ?? [])] : []),
    ...partyFilter,
  ];

  const lightweightBranchFilter = [FINAL_SUMMARY_FILTER, { exists: { field: CERT_HASH_SHA256 } }];

  // Resource type and origin are browser-only concepts: a lightweight HTTP/TCP
  // cert has no resource type or same-site flag, so when either filter is active
  // we must exclude the lightweight branch entirely. Otherwise lightweight certs
  // would leak through unfiltered (and inconsistently disappear once the user
  // also narrows monitor type to browser).
  const browserOnlyFilterActive = hasResourceTypeFilter || partyFilter.length > 0;

  // Restricts which documents carry a certificate. Lightweight monitors expose
  // the cert on their summary ping; browser monitors expose it on every network
  // event (one per resource), so the certificates page lists all of them.
  const certTypeFilter = !includeBrowserCerts
    ? lightweightBranchFilter
    : browserOnlyFilterActive
    ? browserBranchFilter
    : [
        {
          bool: {
            minimum_should_match: 1,
            should: [
              { bool: { filter: lightweightBranchFilter } },
              { bool: { filter: browserBranchFilter } },
            ],
          },
        },
      ];

  return createEsQuery({
    from: (pageIndex ?? 0) * size,
    size,
    // The origin filter reads `Sec-Fetch-Site` from `_source`; the runtime field
    // is only declared when that filter is active so other callers (e.g. the TLS
    // alert rule) skip the per-doc evaluation entirely.
    ...(partyFilter.length > 0 ? { runtime_mappings: PARTY_RUNTIME_MAPPINGS } : {}),
    sort: asMutableArray([
      {
        [sort]: {
          order: direction,
        },
      },
      // When browser certs are included the collapse key is the subject common
      // name, which a lightweight summary ping and a browser network event can
      // share. On a tie in the primary sort (e.g. same not_after) ES would
      // otherwise pick the group representative by shard order — and picking the
      // browser event hides a fingerprint the lightweight ping actually captured.
      // Sorting fingerprinted docs first (browser events miss sha256, so they
      // sort last) makes the representative deterministic and always surfaces the
      // fingerprint when one exists. The lightweight-only query collapses on
      // sha256 itself, so it needs no tiebreaker and keeps its lean sort.
      ...(includeBrowserCerts
        ? [{ [CERT_HASH_SHA256]: { order: 'asc' as const, missing: '_last' as const } }]
        : []),
    ]) as estypes.SortCombinations[],
    query: {
      bool: {
        ...(search
          ? {
              minimum_should_match: 1,
              should: [
                {
                  multi_match: {
                    query: escape(search),
                    type: 'phrase_prefix' as const,
                    fields: [
                      'monitor.id.text',
                      'monitor.name.text',
                      'url.full.text',
                      'tls.server.x509.subject.common_name.text',
                      'tls.server.x509.issuer.common_name.text',
                    ],
                  },
                },
              ],
            }
          : {}),
        filter: [
          ...certTypeFilter,
          EXCLUDE_RUN_ONCE_FILTER,
          ...(filters ? [filters] : []),
          ...buildMonitorScopingFilter({
            monitorIds,
            ccsEnabled,
            remoteNames,
            spaceId,
            showFromAllSpaces,
          }),
          ...(monitorTypes && monitorTypes.length > 0
            ? [{ terms: { 'monitor.type': monitorTypes } }]
            : []),
          // Tags are stamped on every event a monitor emits (lightweight summary
          // pings and browser network events alike), so this applies uniformly
          // across both branches regardless of monitor type.
          ...(tags && tags.length > 0 ? [{ terms: { tags } }] : []),
          // issuer is present regardless of monitor type.
          ...(issuers && issuers.length > 0
            ? [{ terms: { [CERT_ISSUER_COMMON_NAME]: issuers } }]
            : []),
          // fetch large enough date range to cover the last 7 days, no particular reason for 7 days
          getRangeFilter({
            from: 'now-7d',
            to: 'now',
          }),
          {
            range: {
              'monitor.timespan': {
                gte: absoluteDate(from),
                lte: absoluteDate(to),
              },
            },
          },
          {
            bool: {
              // these notValidBefore and notValidAfter should be inside should block, since
              // we want to match either of the condition, making ir an OR operation
              minimum_should_match: 1,
              should: [
                ...(notValidBefore
                  ? [
                      {
                        range: {
                          'tls.server.x509.not_before': {
                            lte: absoluteDate(notValidBefore),
                          },
                        },
                      },
                    ]
                  : []),
                ...(notValidAfter
                  ? [
                      {
                        range: {
                          'tls.server.x509.not_after': {
                            lte: absoluteDate(notValidAfter),
                          },
                        },
                      },
                    ]
                  : []),
              ],
            },
          },
        ] as estypes.QueryDslQueryContainer,
      },
    },
    _source: [
      '@timestamp',
      'config_id',
      'monitor.id',
      'monitor.name',
      'monitor.type',
      'url.full',
      'observer.geo.name',
      'agent.name',
      'tls.server.x509.issuer.common_name',
      'tls.server.x509.subject.common_name',
      'tls.server.hash.sha1',
      'tls.server.hash.sha256',
      'tls.server.x509.not_after',
      'tls.server.x509.not_before',
      'service',
      'labels',
      'tags',
      'error',
      'kibanaUrl',
    ],
    collapse: {
      field: certIdField,
      inner_hits: {
        size: 100,
        _source: {
          includes: [
            'monitor.id',
            'monitor.name',
            'monitor.type',
            'url.full',
            'config_id',
            // Per-monitor: a fingerprint can recur across clusters.
            'kibanaUrl',
          ],
        },
        collapse: {
          field: 'monitor.id',
        },
        name: 'monitors',
        sort: [{ 'monitor.id': 'asc' as const }],
      },
    },
    aggs: {
      total: {
        cardinality: {
          field: certIdField,
        },
      },
    },
  });
};

// Mirrors `server/lib/remote_result_utils.getRemoteMonitorInfo`
const remoteFromIndex = (index: string, kibanaUrl?: string): RemoteMonitorInfo | undefined => {
  if (!isNonLocalIndexName(index)) {
    return undefined;
  }
  const remoteName = index.substring(0, index.indexOf(':'));
  return { remoteName, ...(kibanaUrl ? { kibanaUrl } : {}) };
};

export const processCertsResult = (result: CertificatesResults): CertResult => {
  const certs = result.hits?.hits?.map((hit) => {
    const ping = hit._source;
    const server = ping.tls?.server!;

    const notAfter = server?.x509?.not_after;
    const notBefore = server?.x509?.not_before;
    const issuer = server?.x509?.issuer?.common_name;
    const commonName = server?.x509?.subject?.common_name;
    const sha1 = server?.hash?.sha1;
    const sha256 = server?.hash?.sha256;

    const monitors = hit.inner_hits!.monitors.hits.hits.map((monitor) => {
      const monitorPing = monitor._source as Ping & { kibanaUrl?: string };
      const remote = remoteFromIndex(monitor._index, monitorPing?.kibanaUrl);

      return {
        name: monitorPing?.monitor.name,
        id: monitorPing?.monitor.id,
        configId: monitorPing?.config_id,
        url: monitorPing?.url?.full,
        type: monitorPing?.monitor?.type,
        ...(remote ? { remote } : {}),
      };
    });

    const remote = remoteFromIndex(hit._index, (ping as Ping & { kibanaUrl?: string })?.kibanaUrl);

    return {
      monitors,
      issuer,
      sha1,
      sha256,
      not_after: notAfter,
      not_before: notBefore,
      common_name: commonName,
      monitorName: ping.monitor.name,
      monitorId: ping.monitor.id,
      serviceName: ping?.service?.name,
      configId: ping.config_id!,
      monitorUrl: ping?.url?.full,
      labels: ping?.labels,
      tags: ping?.tags,
      '@timestamp': ping['@timestamp'],
      monitorType: ping?.monitor?.type,
      locationId: ping.observer.name,
      hostName: ping?.agent?.name,
      locationName: ping?.observer?.geo?.name,
      errorMessage: ping?.error?.message,
      errorStackTrace: ping?.error?.stack_trace,
      ...(remote ? { remote } : {}),
    };
  });
  const total = result.aggregations?.total?.value ?? 0;
  return { certs, total };
};
