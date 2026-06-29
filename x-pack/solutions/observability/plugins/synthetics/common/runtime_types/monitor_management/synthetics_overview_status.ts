/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import { ObserverCodec } from '../ping/observer';
import { ErrorStateCodec } from '../ping/error_state';
import { AgentType, MonitorType, PingErrorType, UrlType } from '..';
import { remoteMonitorInfoSchema } from '../remote';
import { MonitorOriginCodec } from '../heartbeat_monitor';

export const OverviewPingCodec = t.intersection([
  t.interface({
    '@timestamp': t.string,
    summary: t.partial({
      down: t.number,
      up: t.number,
    }),
    monitor: MonitorType,
    observer: ObserverCodec,
    config_id: t.string,
    agent: AgentType,
    url: UrlType,
    state: ErrorStateCodec,
  }),
  t.partial({
    error: PingErrorType,
    tags: t.array(t.string),
    service: t.type({
      name: t.string,
    }),
    labels: t.record(t.string, t.string),
  }),
]);

export const OverviewStatusMetaDataCodec = t.intersection([
  t.interface({
    monitorQueryId: t.string,
    configId: t.string,
    locations: t.array(
      t.intersection([
        t.interface({
          id: t.string,
          label: t.string,
          status: t.string,
        }),
        t.partial({
          // The last-known up/down for this location before it was demoted to
          // `stale` by the live-window freshness guard. Lets the UI optionally
          // render the stale last run (via the "show last run" toggle) without a
          // refetch. Only set when `status === 'stale'`.
          lastStatus: t.string,
          // ISO timestamp of when this location entered its current state
          // segment. Only set when the location is currently down so the UI
          // can render "Down · 12m" without stale data.
          downSince: t.string,
          // Latest error reason for this location's most recent down check.
          // `error.message` is `text` in the heartbeat mapping so it's pulled
          // via top_hits on the backend.
          error: t.partial({
            message: t.string,
            type: t.string,
          }),
        }),
      ])
    ),
    name: t.string,
    schedule: t.string,
    isEnabled: t.boolean,
    tags: t.array(t.string),
    isStatusAlertEnabled: t.boolean,
    type: t.string,
    overallStatus: t.string,
  }),
  t.partial({
    projectId: t.string,
    updated_at: t.string,
    timestamp: t.string,
    spaces: t.array(t.string),
    urls: t.string,
    maintenanceWindows: t.array(t.string),
    remote: remoteMonitorInfoSchema,
    // Provenance for monitors that have no Synthetics saved object and are
    // therefore read-only in the app. `heartbeat` marks a monitor discovered
    // purely from local ping data (Heartbeat / Elastic Agent autodiscovery),
    // mirroring how `remote` marks a CCS-only monitor.
    origin: MonitorOriginCodec,
  }),
]);

export const OverviewStatusCodec = t.interface({
  allMonitorsCount: t.number,
  disabledMonitorsCount: t.number,
  projectMonitorsCount: t.number,
  up: t.number,
  down: t.number,
  pending: t.number,
  stale: t.number,
  disabledCount: t.number,
  upConfigs: t.record(t.string, OverviewStatusMetaDataCodec),
  downConfigs: t.record(t.string, OverviewStatusMetaDataCodec),
  pendingConfigs: t.record(t.string, OverviewStatusMetaDataCodec),
  staleConfigs: t.record(t.string, OverviewStatusMetaDataCodec),
  disabledConfigs: t.record(t.string, OverviewStatusMetaDataCodec),
  enabledMonitorQueryIds: t.array(t.string),
  disabledMonitorQueryIds: t.array(t.string),
  allIds: t.array(t.string),
});

// Response of the supplementary "stale before the window" lookup. The overview
// status endpoint only classifies a monitor as `stale` when it has a run inside
// the window that then went quiet; a monitor that stopped reporting *before* the
// window starts has no in-window run, so it lands in `pending`. The client
// fetches this separately (so the main overview request stays fast) to promote
// those `pending` monitors to `stale` once their last-known run is resolved.
//
// The endpoint returns only the raw "latest run before the window" facts per
// monitor/location — no saved-object reload and no `id:(…)` filter — so it stays
// cheap regardless of how many monitors are pending. The client applies the
// staleness threshold and rebuilds the metadata from the `pending` config it
// already holds.
export const OverviewStalePriorRunCodec = t.interface({
  monitorQueryId: t.string,
  locationId: t.string,
  timestamp: t.string,
  status: t.string,
});

export const OverviewStaleStatusCodec = t.interface({
  priorRuns: t.array(OverviewStalePriorRunCodec),
});

export type OverviewPing = t.TypeOf<typeof OverviewPingCodec>;
export type OverviewStatus = t.TypeOf<typeof OverviewStatusCodec>;
export type OverviewStatusState = t.TypeOf<typeof OverviewStatusCodec>;
export type OverviewStatusMetaData = t.TypeOf<typeof OverviewStatusMetaDataCodec>;
export type OverviewStalePriorRun = t.TypeOf<typeof OverviewStalePriorRunCodec>;
export type OverviewStaleStatus = t.TypeOf<typeof OverviewStaleStatusCodec>;
