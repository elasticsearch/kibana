/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useKibanaSpace } from '../../../../../hooks/use_kibana_space';
import { ConfigKey, type SelectedSyntheticsMonitor } from '../../../../../../common/runtime_types';
import { useSyntheticsRefreshContext } from '../../../contexts';
import {
  getMonitorAction,
  selectEncryptedSyntheticsSavedMonitors,
  selectMonitorListState,
  selectorMonitorDetailsState,
  selectSyntheticsMonitorError,
} from '../../../state';
import { useGetUrlParams } from '../../../hooks';
import { useExternalMonitor } from './use_external_monitor';

interface UseSelectedMonitorOptions {
  refetchMonitorEnabled?: boolean;
}

interface UseSelectedMonitorResult {
  monitor: SelectedSyntheticsMonitor | null;
  loading: boolean;
  error: ReturnType<typeof selectSyntheticsMonitorError>;
  isMonitorMissing: boolean;
}

export const useSelectedMonitor = ({
  refetchMonitorEnabled = true,
}: UseSelectedMonitorOptions = {}): UseSelectedMonitorResult => {
  const { monitorId } = useParams<{ monitorId: string }>();
  const { space } = useKibanaSpace();
  const { spaceId, remoteName } = useGetUrlParams();

  // Remote (CCS) monitors have no local saved object — the local fetch would 404.
  // Heartbeat/Agent monitors also have no saved object, but there is no URL
  // discriminant for them, so we detect them by probing local pings ONLY after
  // the local SO fetch 404s (see `localSoMissing` below). Both flavors are
  // synthesized into read-only projections by `useExternalMonitor`.
  const isRemote = Boolean(remoteName);

  const monitorsList = useSelector(selectEncryptedSyntheticsSavedMonitors);
  const { loading: monitorListLoading } = useSelector(selectMonitorListState);

  const monitorFromList = useMemo(
    () => monitorsList.find((monitor) => monitor[ConfigKey.CONFIG_ID] === monitorId) ?? null,
    [monitorId, monitorsList]
  );
  const error = useSelector(selectSyntheticsMonitorError);
  const { lastRefresh, refreshInterval } = useSyntheticsRefreshContext();
  const { syntheticsMonitor, syntheticsMonitorLoading, syntheticsMonitorDispatchedAt } =
    useSelector(selectorMonitorDetailsState);
  const dispatch = useDispatch();

  // A local 404 means there is no saved object for this id — it may instead be a
  // Heartbeat/Agent monitor whose data lives in local `synthetics-*`. This is
  // also what lets cert links / deep links to such monitors resolve without
  // carrying any extra URL param.
  const localSoMissing =
    !isRemote &&
    error?.body?.statusCode === 404 &&
    (error.getPayload as { monitorId: string })?.monitorId === monitorId;

  // External error is not propagated through this hook's `error` field; the
  // local-monitor `error` is an HTTP-fetch error with `body.statusCode`, whereas
  // the external (ES) error is a plain `Error`. `useExternalMonitor` queries the
  // remote cluster when `remoteName` is set, otherwise probes local pings for a
  // heartbeat projection — but only once the local SO is known to be missing.
  const { data: externalMonitor, loading: externalMonitorLoading } = useExternalMonitor({
    configId: monitorId,
    remoteName,
    origin: localSoMissing ? 'heartbeat' : undefined,
  });

  const isMonitorFromListValid =
    monitorId && monitorFromList && monitorFromList[ConfigKey.CONFIG_ID] === monitorId;
  const isLoadedSyntheticsMonitorValid =
    monitorId && syntheticsMonitor && syntheticsMonitor[ConfigKey.CONFIG_ID] === monitorId;

  const availableLocalMonitor = isLoadedSyntheticsMonitorValid
    ? syntheticsMonitor
    : isMonitorFromListValid
    ? monitorFromList
    : null;

  const availableMonitor: SelectedSyntheticsMonitor | null = isRemote
    ? externalMonitor ?? null
    : availableLocalMonitor ?? externalMonitor ?? null;

  // Only declare the monitor truly missing once the heartbeat probe has had its
  // say: while it is loading we hold off (avoids a flash redirect to "not
  // found"), and if it resolves a projection the monitor is not missing.
  const isMonitorMissing = localSoMissing && !externalMonitor && !externalMonitorLoading;

  useEffect(() => {
    if (
      monitorId &&
      !isRemote &&
      !availableMonitor &&
      !syntheticsMonitorLoading &&
      !localSoMissing
    ) {
      dispatch(
        getMonitorAction.get({
          monitorId,
          ...(spaceId && spaceId !== space?.id ? { spaceId } : {}),
        })
      );
    }
  }, [
    dispatch,
    monitorId,
    isRemote,
    availableMonitor,
    syntheticsMonitorLoading,
    localSoMissing,
    spaceId,
    space?.id,
  ]);

  useEffect(() => {
    // Only perform periodic refresh if the last dispatch was earlier enough.
    // Skip once the SO is known missing — re-fetching only 404s again.
    if (
      monitorId &&
      !isRemote &&
      !localSoMissing &&
      !syntheticsMonitorLoading &&
      !monitorListLoading &&
      syntheticsMonitorDispatchedAt > 0 &&
      Date.now() - syntheticsMonitorDispatchedAt > refreshInterval * 1000 &&
      refetchMonitorEnabled
    ) {
      dispatch(
        getMonitorAction.get({
          monitorId,
          ...(spaceId && spaceId !== space?.id ? { spaceId } : {}),
        })
      );
    }
  }, [
    dispatch,
    lastRefresh,
    refreshInterval,
    monitorId,
    isRemote,
    localSoMissing,
    monitorListLoading,
    syntheticsMonitorLoading,
    syntheticsMonitorDispatchedAt,
    spaceId,
    space?.id,
    refetchMonitorEnabled,
  ]);

  return {
    monitor: availableMonitor,
    loading: isRemote
      ? externalMonitorLoading
      : syntheticsMonitorLoading || monitorListLoading || externalMonitorLoading,
    // Suppress the local 404 once we treat it as a heartbeat candidate; real
    // (non-404) errors still surface.
    error: isRemote || localSoMissing ? null : error,
    isMonitorMissing,
  };
};
