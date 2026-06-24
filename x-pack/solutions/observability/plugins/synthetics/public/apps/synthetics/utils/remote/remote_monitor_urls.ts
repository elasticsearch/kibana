/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import path from 'path';
import { paths } from '../../../../../common/constants/ui';
import type { OverviewStatusMetaData } from '../../../../../common/runtime_types';

type RemoteMonitorLike = Pick<OverviewStatusMetaData, 'remote' | 'configId'>;

interface CreateBaseUrlArgs {
  monitor: RemoteMonitorLike;
  spaceId?: string;
  // Fallback for `monitor.remote.kibanaUrl` when the overview-status metadata
  // lacks it (e.g. older pings, or origin Kibana with no `server.publicBaseUrl`).
  kibanaUrl?: string;
}

// Same-named spaces are assumed to federate across clusters: the local active
// space maps to `/s/<spaceId>` on the remote. The server-side `meta.space_id`
// filter enforces this (#268720). Mirrors SLO's `createBaseRemoteSloDetailsUrl`.
function createBaseRemoteMonitorUrl(
  { monitor, spaceId, kibanaUrl }: CreateBaseUrlArgs,
  appPath: string
): URL | undefined {
  const resolvedKibanaUrl = kibanaUrl ?? monitor.remote?.kibanaUrl;
  if (!resolvedKibanaUrl) {
    return undefined;
  }

  const spacePath = spaceId && spaceId !== 'default' ? `/s/${spaceId}` : '';
  return new URL(path.join(spacePath, appPath), resolvedKibanaUrl);
}

interface CreateRemoteMonitorDetailUrlArgs extends CreateBaseUrlArgs {
  locationId?: string;
}

export function createRemoteMonitorDetailUrl({
  monitor,
  locationId,
  spaceId,
  kibanaUrl,
}: CreateRemoteMonitorDetailUrlArgs): string | undefined {
  const url = createBaseRemoteMonitorUrl(
    { monitor, spaceId, kibanaUrl },
    paths.monitorDetail(monitor.configId)
  );
  if (!url) {
    return undefined;
  }
  if (locationId) {
    url.searchParams.append('locationId', locationId);
  }
  return url.toString();
}

export function createRemoteMonitorEditUrl({
  monitor,
  spaceId,
  kibanaUrl,
}: CreateBaseUrlArgs): string | undefined {
  return createBaseRemoteMonitorUrl(
    { monitor, spaceId, kibanaUrl },
    paths.monitorEdit(monitor.configId)
  )?.toString();
}

export function createRemoteMonitorCloneUrl({
  monitor,
  spaceId,
  kibanaUrl,
}: CreateBaseUrlArgs): string | undefined {
  const url = createBaseRemoteMonitorUrl({ monitor, spaceId, kibanaUrl }, paths.monitorAdd);
  if (!url) {
    return undefined;
  }
  url.searchParams.append('cloneId', monitor.configId);
  return url.toString();
}
