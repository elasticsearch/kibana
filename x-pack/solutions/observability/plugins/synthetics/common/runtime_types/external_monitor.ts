/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EncryptedSyntheticsSavedMonitor } from './monitor_management/monitor_types';
import { type RemoteSyntheticsMonitor, isRemoteSyntheticsMonitor } from './remote_monitor';
import { type HeartbeatSyntheticsMonitor, isHeartbeatSyntheticsMonitor } from './heartbeat_monitor';

/**
 * A monitor surfaced in the Synthetics app that has NO local Synthetics saved
 * object and is therefore read-only. Two flavors share this shape — the
 * difference is only where the pings come from:
 *   - `remote` (CCS): lives on another cluster, queried via `${remote}:synthetics-*`.
 *   - `heartbeat`: run locally by Heartbeat / Elastic Agent (e.g. Kubernetes
 *     autodiscovery), pings land in local `synthetics-*`.
 *
 * Both are derived from ping data and must never be treated as editable.
 */
export type ExternalSyntheticsMonitor = RemoteSyntheticsMonitor | HeartbeatSyntheticsMonitor;

/**
 * Union of the shapes a "selected monitor" can take in the detail page: a local
 * saved object or one of the read-only {@link ExternalSyntheticsMonitor}
 * projections. Narrow with {@link isRemoteSyntheticsMonitor},
 * {@link isHeartbeatSyntheticsMonitor}, or {@link isExternalSyntheticsMonitor}.
 */
export type SelectedSyntheticsMonitor = EncryptedSyntheticsSavedMonitor | ExternalSyntheticsMonitor;

/**
 * Single predicate for "this monitor has no local saved object and is
 * read-only" — true for both remote (CCS) and Heartbeat/Agent monitors. Prefer
 * this over `isRemoteSyntheticsMonitor` anywhere the intent is "hide mutating /
 * SO-only UI", and reserve `isRemoteSyntheticsMonitor` for genuinely
 * remote-specific behavior (CCS fetches, cross-cluster deep links).
 */
export const isExternalSyntheticsMonitor = (
  monitor: SelectedSyntheticsMonitor | null | undefined
): monitor is ExternalSyntheticsMonitor =>
  isRemoteSyntheticsMonitor(monitor) || isHeartbeatSyntheticsMonitor(monitor);
