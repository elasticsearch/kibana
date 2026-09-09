/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment/moment';
import datemath from '@kbn/datemath';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { SavedObjectsFindResult } from '@kbn/core-saved-objects-api-server';
import { isEmpty } from 'lodash';
import { withApmSpan } from '@kbn/apm-data-access-plugin/server/utils/with_apm_span';
import { ALL_SPACES_ID } from '@kbn/security-plugin/common/constants';
import { asMutableArray } from '../../../common/utils/as_mutable_array';
import type { OverviewStatusQuery, OverviewStatusStaleBody } from '../common';
import { getMonitorFilters, MONITOR_STATUS_PING_SEARCH_FIELDS } from '../common';
import {
  ConfigKey,
  MONITOR_STATUS_ENUM,
  OVERVIEW_PAGINATION_DEFAULTS,
} from '../../../common/constants/monitor_management';
import { processMonitors } from '../../saved_objects/synthetics_monitor/process_monitors';
import type { RouteContext } from '../types';
import type {
  EncryptedSyntheticsMonitorAttributes,
  OverviewStaleStatus,
  OverviewStalePriorRun,
  OverviewStatusMetaData,
} from '../../../common/runtime_types';
import {
  HEARTBEAT_UNMAPPED_LOCATION_ID,
  HEARTBEAT_UNMAPPED_LOCATION_LABEL,
} from '../../../common/runtime_types';
import { getOverviewConfigKey, isRunStale } from '../../../common/lib';
import { isStatusEnabled } from '../../../common/runtime_types/monitor_management/alert_config';
import {
  FINAL_SUMMARY_FILTER,
  getRangeFilter,
  getTimespanFilter,
} from '../../../common/constants/client_defaults';
import { isRemoteIndexMetadataEnabled, getRemoteMonitorInfo } from '../../lib/remote_result_utils';

// Canonical rank for `sortField: 'status'`. Sorting by this rank (instead of a
// fixed bucket concatenation) means `sortOrder: 'desc'` reverses the whole
// order, not just the up/down pair.
const STATUS_RANK: Record<string, number> = {
  [MONITOR_STATUS_ENUM.DOWN]: 0,
  [MONITOR_STATUS_ENUM.UP]: 1,
  [MONITOR_STATUS_ENUM.DISABLED]: 2,
  [MONITOR_STATUS_ENUM.PENDING]: 3,
  [MONITOR_STATUS_ENUM.STALE]: 4,
};

interface LocationStatusEntry {
  status: string;
  locationId: string;
  timestamp: string;
  monitorUrl?: string;
  index?: string;
  kibanaUrl?: string;
  // Additional fields from ping docs, used to build metadata for remote-only monitors
  monitorName?: string;
  monitorType?: string;
  monitorIntervalSeconds?: number;
  configId?: string;
  tags?: string[];
  // Human-readable location label from observer.geo.name. Resolved via a
  // terms sub-agg because the field is wildcard-typed and top_metrics cannot
  // collect it. Falls back to locationId when unavailable.
  locationLabel?: string;
  // Whether the ping carries `meta.space_id`. Kibana stamps both `config_id`
  // and `meta.space_id` onto every monitor it pushes (public + private, UI +
  // project); standalone Heartbeat / Elastic Agent autodiscovery pings carry
  // neither. Presence of either marker means the ping came from a Kibana-pushed
  // monitor, so a no-saved-object ping with a marker is a *deleted* Kibana
  // monitor and must not be surfaced as an autodiscovery (`origin: 'heartbeat'`)
  // monitor. `config_id` presence is read directly from `configId`.
  hasMetaSpaceId?: boolean;
  // The latest error reason for the most recent final summary on this
  // (monitor, location). Only populated for down checks where the heartbeat
  // doc has an `error` object — `error.message` is `text` so we collect it
  // via `top_hits` rather than `top_metrics`.
  error?: { message?: string; type?: string };
  // Start of the current state segment (down streak) for this location, taken
  // from `state.started_at` on the latest final summary. Used to render
  // "Down · 12m" without having to compute durations on the client.
  downSince?: string;
}
type LocationStatus = LocationStatusEntry[];

export const SUMMARIES_PAGE_SIZE = 5000;

// A monitor/location whose most recent run inside a *live* date-range window
// (one that ends at ~now) is older than ~2 schedule intervals — with a
// 15-minute floor — is surfaced as `stale` rather than its last-known
// up/down. Without this, a monitor that stopped reporting would keep showing a
// stale, falsely-healthy status until it aged out of the window. `stale`
// (had a run, stopped reporting) is deliberately distinct from `pending` (no
// run found in the window at all, e.g. a brand-new first-run monitor). This
// only applies to the windowed overview view; the default (no-range) view
// enforces freshness through the `monitor.timespan` filter instead. The
// schedule-aware threshold itself lives in `isRunStale` (common/lib) so the
// server and client can't drift.
//
// How close a window's end must be to `now` for the freshness guard to kick in.
// Windows that end clearly in the past are treated as historical, where the
// latest in-window run is exactly the status the user asked to see.
const LIVE_WINDOW_TOLERANCE_MINUTES = 5;
// How far back the supplementary "stale before the window" lookup scans for a
// monitor's last-known run. Bounds the query cost and keeps monitors that have
// been dead far longer than anyone would call them "stale" out of the
// promotion — they stay `pending` rather than reaching back through all of
// history.
const STALE_BEFORE_WINDOW_LOOKBACK_DAYS = 30;

/**
 * Upper bound on the number of distinct Heartbeat / Elastic Agent managed
 * monitors (no saved object) surfaced read-only in the overview. Kubernetes/
 * Docker autodiscovery can churn through many short-lived pod-level monitors,
 * so we cap how many we synthesize from ping data to protect the overview.
 */
export const HEARTBEAT_MONITORS_OVERVIEW_LIMIT = 1000;

export class OverviewStatusService {
  filterData: {
    locationIds?: string[] | string;
    filtersStr?: string;
  } = {};
  constructor(
    private readonly routeContext: RouteContext<Record<string, any>, OverviewStatusQuery>
  ) {}

  async getOverviewStatus() {
    this.filterData = await getMonitorFilters(this.routeContext);

    const [rawConfigs, statusResult] = await Promise.all([
      this.getMonitorConfigs(),
      this.getQueryResult(),
    ]);

    // Every configured monitor is always returned rather than dropped, so the
    // overview never silently hides one. Monitors with no run in the queried
    // window surface as `pending`; in a live window, monitors whose latest run
    // went stale surface as `stale` (see `processOverviewStatus`).
    return this.buildOverviewStatusResult(rawConfigs, statusResult);
  }

  /**
   * Same output as {@link getOverviewStatus}, but reuses monitor saved objects already loaded
   * (e.g. diagnostics bundle) to avoid a second full `getAll` over synthetics monitors.
   */
  async getOverviewStatusWithPrefetchedMonitors(
    allConfigs: Array<
      SavedObjectsFindResult<EncryptedSyntheticsMonitorAttributes & { [ConfigKey.URLS]?: string }>
    >
  ) {
    this.filterData = await getMonitorFilters(this.routeContext);
    const statusResult = await this.getQueryResult();
    return this.buildOverviewStatusResult(allConfigs, statusResult);
  }

  private buildOverviewStatusResult(
    allConfigs: Array<
      SavedObjectsFindResult<EncryptedSyntheticsMonitorAttributes & { [ConfigKey.URLS]?: string }>
    >,
    statusResult: Map<string, LocationStatus>
  ) {
    const params = this.routeContext.request.query || {};
    const { page, perPage } = params;
    const isPaginated = page != null && perPage != null;

    const {
      up,
      down,
      pending,
      stale,
      upConfigs,
      downConfigs,
      pendingConfigs,
      staleConfigs,
      disabledConfigs,
    } = this.processOverviewStatus(allConfigs, statusResult);

    const {
      enabledMonitorQueryIds,
      disabledMonitorQueryIds,
      allIds,
      disabledCount,
      disabledMonitorsCount,
      projectMonitorsCount,
    } = processMonitors(allConfigs, this.filterData?.locationIds);

    if (!isPaginated) {
      return {
        allIds,
        allMonitorsCount: allConfigs.length,
        disabledMonitorsCount,
        projectMonitorsCount,
        enabledMonitorQueryIds,
        disabledMonitorQueryIds,
        disabledCount,
        up,
        down,
        pending,
        stale,
        upConfigs,
        downConfigs,
        pendingConfigs,
        staleConfigs,
        disabledConfigs,
      };
    }

    const {
      configs,
      total,
      pageUpConfigs,
      pageDownConfigs,
      pagePendingConfigs,
      pageStaleConfigs,
      pageDisabledConfigs,
    } = this.paginateConfigs({
      upConfigs,
      downConfigs,
      pendingConfigs,
      staleConfigs,
      disabledConfigs,
    });

    return {
      allIds,
      allMonitorsCount: allConfigs.length,
      disabledMonitorsCount,
      projectMonitorsCount,
      enabledMonitorQueryIds,
      disabledMonitorQueryIds,
      disabledCount,
      up,
      down,
      pending,
      stale,
      upConfigs: pageUpConfigs,
      downConfigs: pageDownConfigs,
      pendingConfigs: pagePendingConfigs,
      staleConfigs: pageStaleConfigs,
      disabledConfigs: pageDisabledConfigs,
      configs,
      total,
      page,
      perPage,
    };
  }

  /**
   * Supplementary lookup that lets the client promote `pending` monitors which
   * actually stopped reporting *before* the overview window started.
   *
   * The main overview query scopes status to the window, so a monitor whose last
   * run predates the window has no in-window data and is reported as `pending`
   * (indistinguishable from a brand-new monitor). The client calls this for the
   * pending monitors (passing their `monitorQueryIds`) to find each one's latest
   * run before the window.
   *
   * It deliberately returns only the raw "latest run before the window" facts
   * (timestamp + last status per monitor/location) and does *not* reload saved
   * objects or apply the staleness threshold here: a single bounded `terms`
   * query over the requested monitor ids scales regardless of how many monitors
   * are pending, whereas reloading SOs via an `id:(…)` filter would blow past
   * Elasticsearch's `max_clause_count` once the pending set grows. The client
   * applies {@link isRunStale} and rebuilds the metadata from the `pending`
   * config it already holds.
   *
   * Only runs for live windows (staleness is a "stopped reporting as of now"
   * concept) and is bounded to the requested monitors so it stays cheap.
   */
  async getStaleStatusBeforeWindow(): Promise<OverviewStaleStatus> {
    this.filterData = await getMonitorFilters(this.routeContext);

    if (!this.shouldApplyFreshnessGuard()) {
      return { priorRuns: [] };
    }

    const { monitorQueryIds } =
      (this.routeContext.request.body as OverviewStatusStaleBody | undefined) ??
      this.routeContext.request.query ??
      {};
    const monitorIds = (
      Array.isArray(monitorQueryIds) ? monitorQueryIds : monitorQueryIds ? [monitorQueryIds] : []
    ).filter(Boolean);
    if (monitorIds.length === 0) {
      return { priorRuns: [] };
    }

    const { from } = this.getStatusQueryRange();

    const statusData = await this.getQueryResult({
      // Latest final summary strictly before the window start, capped to a
      // bounded lookback so the promotion doesn't reach back through all of
      // history (a monitor dead longer than this stays `pending`).
      rangeFilter: {
        range: {
          '@timestamp': { gte: `now-${STALE_BEFORE_WINDOW_LOOKBACK_DAYS}d`, lt: from },
        },
      },
      monitorIds,
    });

    const queryLocIds = this.filterData?.locationIds;
    const priorRuns: OverviewStalePriorRun[] = [];

    statusData.forEach((locStatuses, monitorQueryId) => {
      locStatuses.forEach((loc) => {
        if (!isEmpty(queryLocIds) && !queryLocIds?.includes(loc.locationId)) {
          return;
        }
        priorRuns.push({
          monitorQueryId,
          locationId: loc.locationId,
          timestamp: loc.timestamp,
          status: loc.status,
        });
      });
    });

    return { priorRuns };
  }

  paginateConfigs({
    upConfigs,
    downConfigs,
    pendingConfigs,
    staleConfigs = {},
    disabledConfigs,
  }: {
    upConfigs: Record<string, OverviewStatusMetaData>;
    downConfigs: Record<string, OverviewStatusMetaData>;
    pendingConfigs: Record<string, OverviewStatusMetaData>;
    staleConfigs?: Record<string, OverviewStatusMetaData>;
    disabledConfigs: Record<string, OverviewStatusMetaData>;
  }) {
    const queryParams = this.routeContext.request.query || {};
    const {
      page = OVERVIEW_PAGINATION_DEFAULTS.page,
      perPage = OVERVIEW_PAGINATION_DEFAULTS.perPage,
      sortField = OVERVIEW_PAGINATION_DEFAULTS.sortField,
      sortOrder = OVERVIEW_PAGINATION_DEFAULTS.sortOrder,
      statusFilter,
    } = queryParams;

    const buckets = {
      [MONITOR_STATUS_ENUM.UP]: upConfigs,
      [MONITOR_STATUS_ENUM.DOWN]: downConfigs,
      [MONITOR_STATUS_ENUM.PENDING]: pendingConfigs,
      [MONITOR_STATUS_ENUM.STALE]: staleConfigs,
      [MONITOR_STATUS_ENUM.DISABLED]: disabledConfigs,
    };

    // Base order is arbitrary — `sortConfigs` always re-sorts by `STATUS_RANK`
    // for `sortField: 'status'` (the default), so `sortOrder` is honored as a
    // true full reverse rather than a fixed bucket concatenation.
    const pageSource = statusFilter
      ? Object.values(buckets[statusFilter] ?? {})
      : [
          ...Object.values(downConfigs),
          ...Object.values(upConfigs),
          ...Object.values(disabledConfigs),
          ...Object.values(pendingConfigs),
          ...Object.values(staleConfigs),
        ];

    this.sortConfigs(pageSource, sortField, sortOrder);

    const total = pageSource.length;
    const start = (page - 1) * perPage;
    const pageConfigs = pageSource.slice(start, start + perPage);

    const pageUpConfigs: Record<string, OverviewStatusMetaData> = {};
    const pageDownConfigs: Record<string, OverviewStatusMetaData> = {};
    const pagePendingConfigs: Record<string, OverviewStatusMetaData> = {};
    const pageStaleConfigs: Record<string, OverviewStatusMetaData> = {};
    const pageDisabledConfigs: Record<string, OverviewStatusMetaData> = {};

    for (const config of pageConfigs) {
      const key = getOverviewConfigKey(config);
      switch (config.overallStatus) {
        case MONITOR_STATUS_ENUM.DOWN:
          pageDownConfigs[key] = config;
          break;
        case MONITOR_STATUS_ENUM.UP:
          pageUpConfigs[key] = config;
          break;
        case MONITOR_STATUS_ENUM.DISABLED:
          pageDisabledConfigs[key] = config;
          break;
        case MONITOR_STATUS_ENUM.STALE:
          pageStaleConfigs[key] = config;
          break;
        default:
          pagePendingConfigs[key] = config;
      }
    }

    return {
      configs: pageConfigs,
      total,
      pageUpConfigs,
      pageDownConfigs,
      pagePendingConfigs,
      pageStaleConfigs,
      pageDisabledConfigs,
    };
  }

  private sortConfigs(
    configs: OverviewStatusMetaData[],
    sortField: string | undefined,
    sortOrder: string | undefined
  ) {
    const dir = sortOrder === 'desc' ? -1 : 1;

    switch (sortField) {
      case 'name.keyword':
        configs.sort((a, b) => dir * a.name.localeCompare(b.name));
        break;
      case 'updated_at': {
        // Monitors with no `updated_at` (Heartbeat / CCS remote — no local saved
        // object) sort as "now", matching the legacy client-side sort's
        // `moment(undefined)` fallback, so they surface as most-recently-updated
        // rather than sinking to the end of a large fleet. Computed once so the
        // comparator stays a stable, deterministic total order.
        const now = Date.now();
        configs.sort((a, b) => {
          const aTime = a.updated_at ? new Date(a.updated_at).getTime() : now;
          const bTime = b.updated_at ? new Date(b.updated_at).getTime() : now;
          return dir * (aTime - bTime);
        });
        break;
      }
      case 'urls': {
        const withUrl = configs.filter((m) => m.urls);
        const withoutUrl = configs.filter((m) => !m.urls);
        withUrl.sort((a, b) => dir * (a.urls ?? '').localeCompare(b.urls ?? ''));
        configs.length = 0;
        configs.push(...withUrl, ...withoutUrl);
        break;
      }
      case 'type.keyword':
        configs.sort((a, b) => dir * (a.type ?? '').localeCompare(b.type ?? ''));
        break;
      case 'status':
      default:
        configs.sort((a, b) => {
          const aRank = STATUS_RANK[a.overallStatus] ?? Number.MAX_SAFE_INTEGER;
          const bRank = STATUS_RANK[b.overallStatus] ?? Number.MAX_SAFE_INTEGER;
          return dir * (aRank - bRank);
        });
        break;
    }
  }

  async getEsDataFilters() {
    const { spaceId, request } = this.routeContext;
    const params = request.query || {};
    const {
      query,
      scopeStatusByLocation = true,
      tags,
      monitorTypes,
      projects,
      remoteNames,
      showFromAllSpaces,
    } = params;
    const { locationIds } = this.filterData;
    const remoteIndexMetadataEnabled = isRemoteIndexMetadataEnabled(this.routeContext.server);
    const getTermFilter = (field: string, value: string | string[] | undefined) => {
      if (!value || isEmpty(value)) {
        return [];
      }
      if (Array.isArray(value)) {
        return [
          {
            terms: {
              [field]: value,
            },
          },
        ];
      }
      return [
        {
          term: {
            [field]: value,
          },
        },
      ];
    };
    const filters: QueryDslQueryContainer[] = [
      ...(await this.getSpaceFilters(spaceId, Boolean(showFromAllSpaces))),
      ...getTermFilter('monitor.type', monitorTypes),
      ...getTermFilter('tags', tags),
      ...getTermFilter('monitor.project.id', projects),
    ];

    // `remoteNames` filters pings to those originating from the selected
    // remote clusters or CPS linked projects. The alias is encoded in `_index`
    // as `<alias>:<index>`. `_index` does not support `terms`/`regexp`, so we
    // use a `bool.should` of `wildcard` filters — one per selected alias.
    if (remoteIndexMetadataEnabled && remoteNames?.length) {
      const aliases = Array.isArray(remoteNames) ? remoteNames : [remoteNames];
      filters.push({
        bool: {
          should: aliases.map((alias) => ({ wildcard: { _index: `${alias}:*` } })),
          minimum_should_match: 1,
        },
      });
    }

    if (query) {
      filters.push({
        simple_query_string: {
          query,
          // Mirror the saved-object search fields so a monitor matched by the
          // list query keeps its ping data here. A narrower field set would
          // list a monitor (e.g. by location or host) while excluding its
          // pings, stripping its status — a `stale` monitor would read as
          // `pending` and change color once a search filter is applied.
          fields: MONITOR_STATUS_PING_SEARCH_FIELDS,
          default_operator: 'OR',
        },
      });
    }

    if (scopeStatusByLocation && !isEmpty(locationIds) && locationIds) {
      filters.push({
        terms: {
          'observer.name': locationIds,
        },
      });
    }
    return filters;
  }

  /**
   * Build the `meta.space_id` scoping for the status query.
   *
   * Local pings are already bounded by the saved-object query, which fetches
   * monitors with `namespaces: ['*']` intersected with the user's permitted
   * spaces; any local ping without a matching saved object is dropped during
   * reconciliation. So local pings never need a `meta.space_id` constraint here.
   *
   * Remote (CCS) pings have *no* local saved object to join against, so they are
   * the only pings that can leak across spaces. We therefore tie remote pings to
   * the active space's `meta.space_id` (plus `*`). The one exception is a user
   * who can read synthetics in *all* spaces — they are allowed to see remote
   * pings from every space, so the constraint is dropped entirely for them.
   *
   * Elastic Agent autodiscovery pings have no local saved object *and* no
   * `meta.space_id` at all, so they belong to no space. Per product decision
   * these are shown in every space, so the space scope always also matches docs
   * where `meta.space_id` is missing.
   */
  private async getSpaceFilters(
    spaceId: string,
    showFromAllSpaces: boolean
  ): Promise<QueryDslQueryContainer[]> {
    if (!spaceId || spaceId === ALL_SPACES_ID) {
      return [];
    }

    const activeSpaceTerms: QueryDslQueryContainer = {
      bool: {
        minimum_should_match: 1,
        should: [
          { terms: { 'meta.space_id': [spaceId, ALL_SPACES_ID] } },
          // Space-less autodiscovery pings belong to no space → shown everywhere.
          { bool: { must_not: { exists: { field: 'meta.space_id' } } } },
        ],
      },
    };

    // Single-space view: both local and remote pings are tied to the active space.
    if (!showFromAllSpaces) {
      return [activeSpaceTerms];
    }

    // "All permitted spaces" with no remote `_index` prefix possible: there are
    // no CCS/CPS remotes, and local pings are bounded by the SO join.
    if (!isRemoteIndexMetadataEnabled(this.routeContext.server)) {
      return [];
    }

    // "All permitted spaces" + the user can read synthetics everywhere: no
    // scoping at all (local via the SO join, remote unbounded across clusters).
    if (await this.hasAllSpacesReadAccess()) {
      return [];
    }

    // "All permitted spaces" without all-spaces access: keep local pings
    // unconstrained (bounded by the SO join) while tying remote pings to the
    // active space so they cannot leak in from spaces the user isn't viewing.
    return [
      {
        bool: {
          minimum_should_match: 1,
          should: [
            // Local pings have no cluster-alias prefix in `_index` → any space.
            { bool: { must_not: [{ wildcard: { _index: '*:*' } }] } },
            // Remote pings carry a cluster-alias prefix → tied to the active space.
            { bool: { filter: [{ wildcard: { _index: '*:*' } }, activeSpaceTerms] } },
          ],
        },
      },
    ];
  }

  /**
   * Whether the current user can read synthetics in every space (current and
   * future). Mirrors the saved-object query's permitted-spaces semantics for the
   * remote-ping path, which has no saved-object join to rely on.
   */
  private async hasAllSpacesReadAccess(): Promise<boolean> {
    const { server, request } = this.routeContext;
    const { authz } = server.security;
    if (!authz.mode.useRbacForRequest(request)) {
      return true;
    }
    const { hasAllRequested } = await authz
      .checkPrivilegesWithRequest(request)
      .globally({ kibana: [authz.actions.api.get('uptime-read')] });
    return hasAllRequested;
  }

  /**
   * Compute the `[from, to]` window we use to pull final-summary docs. The
   * overview page always sends the date picker's range, so we honor it whenever
   * it's present. Callers that don't pass a range (e.g. the diagnostics bundle
   * or embeddables) fall back to a 4h+20m look-back, which always captures the
   * latest summary for every enabled monitor (max schedule is 4h) — preserving
   * the legacy "current status" behavior for those consumers.
   */
  getStatusQueryRange(): { from: string; to: string } {
    const params = this.routeContext.request.query || {};
    const { dateRangeStart, dateRangeEnd } = params;
    const defaultFrom = moment().subtract(4, 'hours').subtract(20, 'minutes').toISOString();

    if (!dateRangeStart || !dateRangeEnd) {
      return { from: defaultFrom, to: 'now' };
    }

    // Datemath returns undefined on bad input; fall back to defaults rather
    // than failing the query.
    const fromDate = datemath.parse(dateRangeStart);
    const toDate = datemath.parse(dateRangeEnd, { roundUp: true });
    if (!fromDate?.isValid() || !toDate?.isValid()) {
      return { from: defaultFrom, to: 'now' };
    }

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    };
  }

  /**
   * Whether the status freshness guard should run. It only applies to the
   * windowed overview view (both picker bounds present) whose window ends at
   * ~now — i.e. a live "what's happening right now" view. Historical windows and
   * the default no-range view (which relies on the `monitor.timespan` filter)
   * are left untouched.
   */
  shouldApplyFreshnessGuard(): boolean {
    const { dateRangeStart, dateRangeEnd } = this.routeContext.request.query || {};
    if (!dateRangeStart || !dateRangeEnd) {
      return false;
    }
    const toDate = datemath.parse(dateRangeEnd, { roundUp: true });
    if (!toDate?.isValid()) {
      return false;
    }
    return toDate.isSameOrAfter(moment().subtract(LIVE_WINDOW_TOLERANCE_MINUTES, 'minutes'));
  }

  /**
   * A run is "stale" when its latest summary in a live window is older than
   * ~2 schedule intervals (15-minute floor) — the monitor has effectively
   * stopped reporting and its last status can no longer be trusted as current.
   */
  isStaleRun(timestamp: string | undefined, scheduleMinutes: number): boolean {
    return isRunStale(timestamp, scheduleMinutes);
  }

  async getQueryResult(options?: {
    // Overrides the default `[from, to]` window. Used by the stale-before-window
    // lookup to fetch the latest run *before* the overview window starts.
    rangeFilter?: QueryDslQueryContainer;
    // Restricts the aggregation to specific `monitor.id`s so the supplementary
    // lookup stays cheap (scoped to the pending monitors being probed).
    monitorIds?: string[];
  }) {
    const remoteIndexMetadataEnabled = isRemoteIndexMetadataEnabled(this.routeContext.server);

    return withApmSpan('monitor_status_data', async () => {
      const range = this.getStatusQueryRange();

      let hasMoreData = true;
      const monitorByIds = new Map<string, LocationStatus>();
      let afterKey: any;
      let count = 0;

      const topMetricsFields = [
        { field: 'monitor.status' },
        { field: 'url.full.keyword' },
        // These ping fields are used to construct metadata for monitors that
        // have no local saved object — both remote (CCS) monitors and local
        // Heartbeat / Elastic Agent managed monitors. Heartbeat detection is
        // always-on, so they are always retrieved.
        // observer.geo.name is excluded because it is a wildcard type field
        // which top_metrics cannot collect. We use a separate terms sub-agg instead.
        { field: 'monitor.name' },
        { field: 'monitor.type' },
        { field: 'monitor.interval' },
        { field: 'config_id' },
        { field: 'tags' },
        // kibanaUrl / `_index` are only needed to detect and deep-link CCS / CPS
        // remotes. `_index` is a virtual metadata field, but it still exposes
        // keyword ordinals, so top_metrics can collect it from the same winning
        // ping as the other metrics (rather than a sibling terms agg, which
        // would return the most common index in the bucket, not the latest).
        ...(remoteIndexMetadataEnabled ? [{ field: 'kibanaUrl' }, { field: '_index' }] : []),
      ];

      // The `timespan` filter is a "currently fresh" constraint anchored to
      // `now`. When the caller passes an explicit date range (the overview page
      // always does) we drop it, otherwise older summaries inside the window
      // would be filtered out unfairly. Callers without a range keep it so they
      // still get a "current status" snapshot.
      const { dateRangeStart, dateRangeEnd } = this.routeContext.request.query || {};
      const isUserSelectedRange = Boolean(dateRangeStart && dateRangeEnd);

      const rangeFilter =
        options?.rangeFilter ?? getRangeFilter({ from: range.from, to: range.to });
      const monitorIdsFilter: QueryDslQueryContainer[] =
        options?.monitorIds && options.monitorIds.length
          ? [{ terms: { 'monitor.id': options.monitorIds } }]
          : [];

      do {
        const result = await this.routeContext.syntheticsEsClient.search(
          {
            size: 0,
            query: {
              bool: {
                filter: [
                  FINAL_SUMMARY_FILTER,
                  rangeFilter,
                  // The "currently fresh" timespan guard is anchored to `now`,
                  // so it must be dropped whenever the caller scopes to an
                  // explicit window (user range) or looks before it (override).
                  ...(options?.rangeFilter || isUserSelectedRange
                    ? []
                    : [getTimespanFilter({ from: 'now-15m', to: 'now' })]),
                  ...monitorIdsFilter,
                  ...(await this.getEsDataFilters()),
                ] as QueryDslQueryContainer[],
              },
            },
            aggs: {
              monitors: {
                composite: {
                  size: SUMMARIES_PAGE_SIZE,
                  sources: asMutableArray([
                    {
                      monitorId: {
                        terms: {
                          field: 'monitor.id',
                        },
                      },
                    },
                    {
                      locationId: {
                        terms: {
                          // Heartbeat / Agent autodiscovery pings can lack
                          // `observer.name` (no location configured). Without
                          // `missing_bucket` the composite source drops them, so
                          // location-less monitors would never bucket and never
                          // surface. The null key is mapped to a placeholder
                          // location below.
                          field: 'observer.name',
                          missing_bucket: true,
                        },
                      },
                    },
                  ] as const),
                  after: afterKey,
                },
                aggs: {
                  status: {
                    top_metrics: {
                      metrics: topMetricsFields,
                      sort: {
                        '@timestamp': 'desc',
                      },
                    },
                  },
                  // observer.geo.name is a wildcard field which top_metrics
                  // cannot collect, so we use a terms sub-agg to resolve the
                  // human-readable location label. Needed for both remote and
                  // local Heartbeat monitors, so it always runs.
                  location_name: {
                    terms: {
                      field: 'observer.geo.name',
                      size: 1,
                    },
                  },
                  // Presence of `meta.space_id` distinguishes a Kibana-pushed
                  // monitor (always stamped, even for a deleted monitor's
                  // leftover pings) from a standalone Heartbeat / Agent
                  // autodiscovery monitor (never stamped). `terms` handles the
                  // multi-space (array) case; a non-empty bucket list means the
                  // field is present. Always run, since heartbeat detection is.
                  space_id: {
                    terms: {
                      field: 'meta.space_id',
                      size: 1,
                    },
                  },
                  // `error.message` is mapped as `text` so it can't be pulled
                  // via `top_metrics`; fetch the latest final summary doc and
                  // grab `error` + `state` from its source.
                  //
                  // We only need this for currently-down locations — for up
                  // locations the data is dropped at propagation time anyway.
                  // Wrapping the (expensive) `top_hits` in a `filter` agg
                  // keyed on `monitor.status: down` keeps `_source` loading
                  // off the hot up-bucket path, which dominates real
                  // deployments.
                  errorAndState: {
                    filter: {
                      term: { 'monitor.status': 'down' },
                    },
                    aggs: {
                      latest: {
                        top_hits: {
                          size: 1,
                          _source: {
                            includes: [
                              'error.message',
                              'error.type',
                              'state.started_at',
                              'state.duration_ms',
                            ],
                          },
                          sort: [{ '@timestamp': 'desc' as const }],
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          'getCurrentStatusOverview' + count
        );
        count += 1;
        const data = result.body.aggregations?.monitors;

        hasMoreData = (data?.buckets ?? []).length >= SUMMARIES_PAGE_SIZE;
        afterKey = data?.after_key;

        data?.buckets.forEach((bucket) => {
          const { status: statusAgg, key: bKey, ...rest } = bucket;
          const monitorId = String(bKey.monitorId);
          // `missing_bucket` yields a null key for pings with no `observer.name`
          // (location-less Heartbeat / Agent monitors) — map it to a placeholder.
          const locationId =
            bKey.locationId == null ? HEARTBEAT_UNMAPPED_LOCATION_ID : String(bKey.locationId);
          const metrics = statusAgg.top?.[0].metrics;
          const status = String(metrics?.['monitor.status']);
          const rawMonitorUrl = metrics?.['url.full.keyword'];

          const timestamp = String(statusAgg.top[0].sort[0]);

          // Pull error + state from the latest *down* doc in the bucket. The
          // `filter > top_hits` shape means up buckets short-circuit with
          // `doc_count: 0` and no `latest.hits.hits[0]`.
          const latestSource =
            (
              bucket as unknown as {
                errorAndState?: {
                  doc_count?: number;
                  latest?: {
                    hits?: {
                      hits?: Array<{
                        _source?: {
                          error?: { message?: unknown; type?: unknown };
                          state?: { started_at?: unknown };
                        };
                      }>;
                    };
                  };
                };
              }
            ).errorAndState?.latest?.hits?.hits?.[0]?._source ?? undefined;
          const errorMessage =
            latestSource?.error?.message != null ? String(latestSource.error.message) : undefined;
          const errorType =
            latestSource?.error?.type != null ? String(latestSource.error.type) : undefined;
          const downSince =
            latestSource?.state?.started_at != null
              ? String(latestSource.state.started_at)
              : undefined;

          if (!monitorByIds.has(String(monitorId))) {
            monitorByIds.set(monitorId, []);
          }

          // observer.geo.name comes from a terms sub-agg (wildcard, not
          // collectable by top_metrics). `_index` is on the winning ping.
          const indexName = remoteIndexMetadataEnabled ? metrics?._index : undefined;
          const locationNameAgg = (rest as any).location_name;
          const locationLabel =
            locationNameAgg?.buckets?.[0]?.key ??
            (bKey.locationId == null ? HEARTBEAT_UNMAPPED_LOCATION_LABEL : undefined);
          const spaceIdAgg = (rest as any).space_id;
          const hasMetaSpaceId = (spaceIdAgg?.buckets?.length ?? 0) > 0;
          const kibanaUrl = remoteIndexMetadataEnabled ? metrics?.kibanaUrl : undefined;
          const monitorName = metrics?.['monitor.name'];
          const monitorType = metrics?.['monitor.type'];
          const monitorInterval = metrics?.['monitor.interval'];
          const configId = metrics?.config_id;
          const tags = metrics?.tags;

          monitorByIds.get(monitorId)?.push({
            status,
            locationId,
            timestamp,
            monitorUrl: rawMonitorUrl != null ? String(rawMonitorUrl) : undefined,
            ...(indexName ? { index: String(indexName) } : {}),
            ...(locationLabel ? { locationLabel: String(locationLabel) } : {}),
            ...(kibanaUrl ? { kibanaUrl: String(kibanaUrl) } : {}),
            ...(monitorName ? { monitorName: String(monitorName) } : {}),
            ...(monitorType ? { monitorType: String(monitorType) } : {}),
            ...(monitorInterval != null ? { monitorIntervalSeconds: Number(monitorInterval) } : {}),
            ...(configId ? { configId: String(configId) } : {}),
            ...(tags ? { tags: Array.isArray(tags) ? tags.map(String) : [String(tags)] } : {}),
            ...(hasMetaSpaceId ? { hasMetaSpaceId } : {}),
            error:
              errorMessage || errorType ? { message: errorMessage, type: errorType } : undefined,
            downSince,
          });
        });
      } while (hasMoreData && afterKey);
      return monitorByIds;
    });
  }

  processOverviewStatus(
    monitors: Array<
      SavedObjectsFindResult<EncryptedSyntheticsMonitorAttributes & { [ConfigKey.URLS]?: string }>
    >,
    statusData: Map<string, LocationStatus>
  ) {
    let up = 0;
    let down = 0;
    const upConfigs: Record<string, OverviewStatusMetaData> = {};
    const downConfigs: Record<string, OverviewStatusMetaData> = {};
    const pendingConfigs: Record<string, OverviewStatusMetaData> = {};
    const staleConfigs: Record<string, OverviewStatusMetaData> = {};
    const disabledConfigs: Record<string, OverviewStatusMetaData> = {};

    const enabledMonitors = monitors.filter((monitor) => monitor.attributes[ConfigKey.ENABLED]);
    const disabledMonitors = monitors.filter((monitor) => !monitor.attributes[ConfigKey.ENABLED]);

    const queryLocIds = this.filterData?.locationIds;

    // In a live windowed view, demote monitors that stopped reporting to
    // `stale` so a stale last-known status can't look falsely healthy.
    const applyFreshnessGuard = this.shouldApplyFreshnessGuard();

    // Track which monitor IDs have been processed via local saved objects
    const processedMonitorIds = new Set<string>();

    disabledMonitors.forEach((monitor) => {
      const monitorQueryId = monitor.attributes[ConfigKey.MONITOR_QUERY_ID];
      const meta = this.getMonitorMeta(monitor);
      processedMonitorIds.add(monitorQueryId);
      monitor.attributes[ConfigKey.LOCATIONS]?.forEach((location) => {
        if (disabledConfigs[meta.configId]) {
          disabledConfigs[meta.configId].locations.push({
            id: location.id,
            label: location.label,
            status: MONITOR_STATUS_ENUM.DISABLED,
          });
        } else {
          disabledConfigs[meta.configId] = {
            monitorQueryId,
            overallStatus: MONITOR_STATUS_ENUM.DISABLED,
            locations: [
              {
                id: location.id,
                label: location.label,
                status: MONITOR_STATUS_ENUM.DISABLED,
              },
            ],
            ...meta,
          };
        }
      });
    });

    enabledMonitors.forEach((monitor) => {
      const monitorId = monitor.attributes[ConfigKey.MONITOR_QUERY_ID];
      processedMonitorIds.add(monitorId);
      const monitorStatus = statusData.get(monitorId);

      // discard any locations that are not in the monitorLocationsMap for the given monitor as well as those which are
      // in monitorLocationsMap but not in listOfLocations
      const monLocations = monitor.attributes[ConfigKey.LOCATIONS];
      monLocations?.forEach((monLocation) => {
        if (!isEmpty(queryLocIds) && !queryLocIds?.includes(monLocation.id)) {
          // filter out location provided via query
          return;
        }
        const locData = monitorStatus?.find((loc) => loc.locationId === monLocation.id);
        const metaInfo = this.getMonitorMeta(monitor);
        const remote = locData?.index
          ? getRemoteMonitorInfo(locData.index, locData.kibanaUrl)
          : undefined;
        const scheduleMinutes = Number(monitor.attributes[ConfigKey.SCHEDULE]?.number) || 0;
        const status =
          applyFreshnessGuard && this.isStaleRun(locData?.timestamp, scheduleMinutes)
            ? MONITOR_STATUS_ENUM.STALE
            : locData?.status || MONITOR_STATUS_ENUM.PENDING;
        // Only attach `error` / `downSince` when this location is currently
        // down — otherwise we'd carry stale error text from the previous
        // failure which is misleading on the overview row.
        const isDown = status === MONITOR_STATUS_ENUM.DOWN;
        // When the freshness guard demotes this location to `stale`, keep the
        // stale last-known up/down so the UI can optionally surface the last run
        // without a refetch.
        const isStale = status === MONITOR_STATUS_ENUM.STALE;
        const location = {
          status,
          id: monLocation.id,
          label: monLocation.label,
          ...(isDown && locData?.error ? { error: locData.error } : {}),
          ...(isDown && locData?.downSince ? { downSince: locData.downSince } : {}),
          ...(isStale && locData?.status ? { lastStatus: locData.status } : {}),
        };
        const meta = {
          ...metaInfo,
          monitorQueryId: monitorId,
          timestamp: locData?.timestamp,
          urls: monitor.attributes[ConfigKey.URLS] || locData?.monitorUrl,
          ...(remote ? { remote } : {}),
          locations: [location],
          overallStatus: status,
        };
        switch (status) {
          case MONITOR_STATUS_ENUM.DOWN:
            down += 1;
            break;
          case MONITOR_STATUS_ENUM.UP:
            up += 1;
            break;
          default:
            break;
        }

        if (
          downConfigs[meta.configId] ||
          upConfigs[meta.configId] ||
          pendingConfigs[meta.configId]
        ) {
          const existingMeta =
            downConfigs[meta.configId] || upConfigs[meta.configId] || pendingConfigs[meta.configId];
          existingMeta.locations.push(location);
          // check if urls is missing from existing meta and update it
          if (!existingMeta.urls && meta.urls) {
            existingMeta.urls = meta.urls;
          }
          // also update timestamp if it is missing or older
          if (
            !existingMeta.timestamp ||
            (meta.timestamp && moment(meta.timestamp).isAfter(existingMeta.timestamp))
          ) {
            existingMeta.timestamp = meta.timestamp;
          }
          if (status === MONITOR_STATUS_ENUM.DOWN) {
            existingMeta.overallStatus = MONITOR_STATUS_ENUM.DOWN;
          }
        } else {
          switch (status) {
            case MONITOR_STATUS_ENUM.DOWN:
              downConfigs[meta.configId] = meta;
              break;
            case MONITOR_STATUS_ENUM.UP:
              upConfigs[meta.configId] = meta;
              break;
            default:
              pendingConfigs[meta.configId] = meta;
              break;
          }
        }
      });
    });
    // Reconcile bucket placement: processing order from ES is not
    // deterministic, so a monitor may land in upConfigs or pendingConfigs
    // even though a later location flipped overallStatus to DOWN. Walk
    // every non-down bucket and relocate entries whose overallStatus
    // disagrees with the bucket they currently sit in.
    for (const [id, meta] of Object.entries(upConfigs)) {
      if (meta.locations.some((loc) => loc.status === MONITOR_STATUS_ENUM.DOWN)) {
        meta.overallStatus = MONITOR_STATUS_ENUM.DOWN;
        meta.locations = movePendingToEnd(meta.locations);
        downConfigs[id] = meta;
        delete upConfigs[id];
      }
    }
    for (const [id, meta] of Object.entries(pendingConfigs)) {
      if (meta.locations.some((loc) => loc.status === MONITOR_STATUS_ENUM.DOWN)) {
        meta.overallStatus = MONITOR_STATUS_ENUM.DOWN;
        meta.locations = movePendingToEnd(meta.locations);
        downConfigs[id] = meta;
        delete pendingConfigs[id];
      } else if (meta.locations.some((loc) => loc.status === MONITOR_STATUS_ENUM.UP)) {
        meta.overallStatus = MONITOR_STATUS_ENUM.UP;
        meta.locations = movePendingToEnd(meta.locations);
        upConfigs[id] = meta;
        delete pendingConfigs[id];
      }
    }

    // Split the "no status in window" catch-all. At this point pendingConfigs
    // holds only monitors with no up/down location, so each location is either
    // `pending` (never ran in the window) or `stale` (ran, then went stale).
    // A monitor with at least one stale location stopped reporting → surface it
    // as `stale`; monitors that are purely first-run stay `pending`. Inspect
    // the locations directly (rather than the incrementally-built
    // `overallStatus`) so classification is deterministic regardless of the
    // order ES returned the buckets in.
    for (const [id, meta] of Object.entries(pendingConfigs)) {
      if (meta.locations.some((loc) => loc.status === MONITOR_STATUS_ENUM.STALE)) {
        meta.overallStatus = MONITOR_STATUS_ENUM.STALE;
        meta.locations = movePendingToEnd(meta.locations);
        staleConfigs[id] = meta;
        delete pendingConfigs[id];
      }
    }

    // Process monitors that have no local saved object, discovered purely from
    // ping data. Two flavors share the exact same shape (pings exist, no SO):
    //   - remote (CCS / CPS) monitors: pings from a remote cluster or linked
    //     project, identified by a `<alias>:` prefix on `_index`.
    //   - local Heartbeat / Elastic Agent monitors: local pings whose
    //     `monitor.id` has no matching saved object (most notably Kubernetes/
    //     Docker autodiscovery). Surfaced read-only via `origin: 'heartbeat'`,
    //     capped to protect the overview against autodiscovery churn.
    // Opt-out (persisted client-side) to hide read-only local Heartbeat / Agent
    // monitors. Only skips when explicitly `false`; remote (CCS) monitors are
    // synthesized regardless.
    const includeHeartbeatMonitors =
      (this.routeContext.request.query || {}).includeHeartbeatMonitors !== false;
    const heartbeatMonitorIds = new Set<string>();

    const placeExternalConfig = (key: string, meta: OverviewStatusMetaData, status: string) => {
      if (status === MONITOR_STATUS_ENUM.DOWN) {
        down += 1;
        downConfigs[key] = meta;
      } else if (status === MONITOR_STATUS_ENUM.UP) {
        up += 1;
        upConfigs[key] = meta;
      } else if (status === MONITOR_STATUS_ENUM.STALE) {
        staleConfigs[key] = { ...meta, overallStatus: MONITOR_STATUS_ENUM.STALE };
      } else {
        pendingConfigs[key] = { ...meta, overallStatus: MONITOR_STATUS_ENUM.PENDING };
      }
    };

    statusData.forEach((locationStatuses, monitorId) => {
      if (processedMonitorIds.has(monitorId)) {
        return; // Already processed via local saved object
      }

      locationStatuses.forEach((locData) => {
        if (!isEmpty(queryLocIds) && !queryLocIds?.includes(locData.locationId)) {
          return;
        }

        const remote = locData.index
          ? getRemoteMonitorInfo(locData.index, locData.kibanaUrl)
          : undefined;

        const configId = locData.configId || monitorId;
        const scheduleMinutes = locData.monitorIntervalSeconds
          ? locData.monitorIntervalSeconds / 60
          : 0;
        const status =
          applyFreshnessGuard && this.isStaleRun(locData.timestamp, scheduleMinutes)
            ? MONITOR_STATUS_ENUM.STALE
            : locData.status;
        // Mirror local-monitor handling: only attach `error` / `downSince`
        // for currently-down locations to avoid surfacing stale failure
        // text from a previous run.
        const isDown = status === MONITOR_STATUS_ENUM.DOWN;
        // Keep the stale last-known status when demoted to `stale` so the
        // "show last run" toggle can render it without a refetch.
        const isStale = status === MONITOR_STATUS_ENUM.STALE;
        const location = {
          id: locData.locationId,
          label: locData.locationLabel || locData.locationId,
          status,
          ...(isDown && locData.error ? { error: locData.error } : {}),
          ...(isDown && locData.downSince ? { downSince: locData.downSince } : {}),
          ...(isStale && locData.status ? { lastStatus: locData.status } : {}),
        };
        const baseMeta = {
          monitorQueryId: monitorId,
          configId,
          name: locData.monitorName || monitorId,
          type: locData.monitorType || 'unknown',
          schedule: locData.monitorIntervalSeconds
            ? String(Math.round(locData.monitorIntervalSeconds / 60))
            : '',
          tags: locData.tags ?? [],
          isEnabled: true,
          isStatusAlertEnabled: false,
          timestamp: locData.timestamp,
          urls: locData.monitorUrl,
          locations: [location],
          overallStatus: status,
        };

        if (remote) {
          // Include the remote cluster name in the bucket key so that two
          // remote clusters that host the same monitor configId in the same
          // locationId (e.g. an imported project monitor synced to both)
          // don't collide and silently overwrite each other.
          const remoteMeta = { ...baseMeta, remote };
          placeExternalConfig(getOverviewConfigKey(remoteMeta), remoteMeta, status);
          return;
        }

        // Local Heartbeat / Elastic Agent managed monitor (no saved object).
        if (!includeHeartbeatMonitors) {
          return;
        }
        // A genuine autodiscovery ping carries NEITHER of Kibana's provenance
        // markers — `config_id` and `meta.space_id`, both stamped on every
        // monitor Kibana pushes. If either is present the ping came from a
        // Kibana-pushed monitor; with no saved object it's a *deleted* Kibana
        // monitor whose pings haven't aged out yet, so it must not resurrect as
        // `heartbeat`. Requiring both to be absent is also the safe stance for
        // standalone Heartbeat pings that happen to set either field.
        if (locData.configId || locData.hasMetaSpaceId) {
          return;
        }
        // Cap the number of distinct monitors we synthesize from ping data.
        if (!heartbeatMonitorIds.has(monitorId)) {
          if (heartbeatMonitorIds.size >= HEARTBEAT_MONITORS_OVERVIEW_LIMIT) {
            return;
          }
          heartbeatMonitorIds.add(monitorId);
        }
        const heartbeatMeta = { ...baseMeta, origin: 'heartbeat' as const };
        placeExternalConfig(getOverviewConfigKey(heartbeatMeta), heartbeatMeta, status);
      });
    });

    return {
      up,
      down,
      pending: Object.values(pendingConfigs).length,
      stale: Object.values(staleConfigs).length,
      upConfigs,
      downConfigs,
      pendingConfigs,
      staleConfigs,
      disabledConfigs,
    };
  }

  async getMonitorConfigs() {
    const { request, server } = this.routeContext;
    const { query, showFromAllSpaces, remoteNames } = request.query || {};
    /**
     * Walk through all monitor saved objects, bucket IDs by disabled/enabled status.
     *
     * Track max period to make sure the snapshot query should reach back far enough to catch
     * latest ping for all enabled monitors.
     */

    // When the user has narrowed the overview to specific remote clusters,
    // skip the local saved-object lookup entirely. Local monitors don't belong
    // to any remote cluster, so a remote-cluster filter implies "remote-only".
    // Returning an empty list here also avoids dragging local monitors through
    // `processOverviewStatus`, where the filtered ping query has no rows for
    // them and they would otherwise surface as misleading "Pending" entries.
    if (isRemoteIndexMetadataEnabled(server) && remoteNames?.length) {
      return [];
    }

    const { filtersStr } = this.filterData;

    return this.routeContext.monitorConfigRepository.getAll<
      EncryptedSyntheticsMonitorAttributes & { [ConfigKey.URLS]?: string }
    >({
      showFromAllSpaces,
      search: query,
      filter: filtersStr,
      fields: [
        ConfigKey.ENABLED,
        ConfigKey.LOCATIONS,
        ConfigKey.MONITOR_QUERY_ID,
        ConfigKey.CONFIG_ID,
        ConfigKey.SCHEDULE,
        ConfigKey.MONITOR_SOURCE_TYPE,
        ConfigKey.MONITOR_TYPE,
        ConfigKey.NAME,
        ConfigKey.TAGS,
        ConfigKey.PROJECT_ID,
        ConfigKey.ALERT_CONFIG,
        ConfigKey.URLS,
        ConfigKey.MAINTENANCE_WINDOWS,
      ],
    });
  }

  getMonitorMeta(
    monitor: SavedObjectsFindResult<
      EncryptedSyntheticsMonitorAttributes & { [ConfigKey.URLS]?: string }
    >
  ) {
    return {
      name: monitor.attributes[ConfigKey.NAME],
      configId: monitor.attributes[ConfigKey.CONFIG_ID],
      schedule: monitor.attributes[ConfigKey.SCHEDULE].number,
      tags: monitor.attributes[ConfigKey.TAGS],
      isEnabled: monitor.attributes[ConfigKey.ENABLED],
      type: monitor.attributes[ConfigKey.MONITOR_TYPE],
      projectId: monitor.attributes[ConfigKey.PROJECT_ID],
      isStatusAlertEnabled: isStatusEnabled(monitor.attributes[ConfigKey.ALERT_CONFIG]),
      created_at: monitor.created_at,
      updated_at: monitor.updated_at,
      spaces: monitor.namespaces,
      urls: monitor.attributes[ConfigKey.URLS],
      maintenanceWindows: monitor.attributes[ConfigKey.MAINTENANCE_WINDOWS]?.map((mw) => mw),
    };
  }
}

function movePendingToEnd<T extends { status: string }>(locations: T[]): T[] {
  return locations.sort((a, b) => {
    if (a.status === MONITOR_STATUS_ENUM.PENDING && b.status !== MONITOR_STATUS_ENUM.PENDING) {
      return 1;
    }
    if (b.status === MONITOR_STATUS_ENUM.PENDING && a.status !== MONITOR_STATUS_ENUM.PENDING) {
      return -1;
    }
    return 0;
  });
}
