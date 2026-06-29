/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import { remoteMonitorInfoSchema } from './remote';
import { ConfigKey } from './monitor_management/config_key';
import { MonitorTypeCodec } from './monitor_management/monitor_configs';
import { MonitorServiceLocationCodec } from './monitor_management/locations';
// Type-only import; the runtime value edge is external_monitor -> remote_monitor.
import type { SelectedSyntheticsMonitor } from './external_monitor';

/**
 * Read-only projection of a Synthetics monitor that lives on a remote cluster
 * (CCS). Because the source-cluster's saved object is NOT accessible from
 * Kibana, this type is derived from remote-cluster heartbeat data via
 * Cross-Cluster Search of `${remoteName}:synthetics-*`.
 *
 * This is intentionally a strict, narrow subset of
 * `EncryptedSyntheticsSavedMonitor`. Anything not listed here — enabled flag,
 * schedule, alert config, encrypted params, namespace, project script hash,
 * the SO's full configured locations array — is unavailable for remote
 * monitors and must not be inferred from this type.
 *
 * The `remote` field is REQUIRED (never undefined) and serves as the
 * discriminant for `useSelectedMonitor` consumers: a returned monitor with
 * `monitor.remote` populated is remote, anything else is the local SO. Use the
 * {@link isRemoteSyntheticsMonitor} type guard to narrow.
 *
 * @see useSelectedMonitor — the public consumer
 * @see useExternalMonitor — the hook that synthesizes values of this type from pings
 */
export const RemoteSyntheticsMonitorCodec = t.type({
  [ConfigKey.CONFIG_ID]: t.string,
  [ConfigKey.MONITOR_QUERY_ID]: t.string,
  [ConfigKey.NAME]: t.string,
  [ConfigKey.MONITOR_TYPE]: MonitorTypeCodec,
  [ConfigKey.TAGS]: t.array(t.string),
  [ConfigKey.LOCATIONS]: t.array(MonitorServiceLocationCodec),
  remote: remoteMonitorInfoSchema,
});

export type RemoteSyntheticsMonitor = t.TypeOf<typeof RemoteSyntheticsMonitorCodec>;

/**
 * Type guard distinguishing remote monitors from local saved objects.
 * Mirrors the `Boolean(thing.remote)` convention used by
 * `OverviewStatusMetaData` and SLO's `SLODefinition.remote` — but since
 * `EncryptedSyntheticsSavedMonitor` does not declare a `remote` field at all,
 * consumers cannot narrow on `monitor.remote` directly without this guard.
 */
export const isRemoteSyntheticsMonitor = (
  monitor: SelectedSyntheticsMonitor | null | undefined
): monitor is RemoteSyntheticsMonitor => {
  return !!monitor && 'remote' in monitor && !!monitor.remote;
};
