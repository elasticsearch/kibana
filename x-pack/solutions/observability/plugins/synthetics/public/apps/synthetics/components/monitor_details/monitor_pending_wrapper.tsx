/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useHistory, useParams, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { i18n } from '@kbn/i18n';
import { EuiLoadingSpinner, EuiLoadingChart } from '@elastic/eui';
import { PageLoader } from '../common/components/page_loader';
import { resetMonitorLastRunAction } from '../../state';
import { useMonitorLatestPing } from './hooks/use_monitor_latest_ping';
import { useSyntheticsRefreshContext } from '../../contexts';
import { MonitorRemoteCallout } from './monitor_remote_callout';

export const MonitorPendingWrapper: FC<PropsWithChildren<unknown>> = ({ children }) => {
  const dispatch = useDispatch();
  const history = useHistory();
  const currentLocation = useLocation();
  const locationRef = useRef(currentLocation);
  const { monitorId } = useParams<{ monitorId: string }>();
  const { refreshApp } = useSyntheticsRefreshContext();

  const { latestPing, loaded: pingsLoaded } = useMonitorLatestPing();
  const [loaded, setLoaded] = useState(false);
  const [hasPing, setHasPing] = useState(false);

  const unlisten = useMemo(
    () =>
      history.listen((location) => {
        const currentMonitorId = location.pathname.split('/')[2] || '';
        const hasDifferentSearch = locationRef.current.search !== location.search;
        const hasDifferentId = currentMonitorId !== monitorId;
        locationRef.current = location;
        if (hasDifferentSearch || hasDifferentId) {
          setLoaded(false);
          setHasPing(false);
          dispatch(resetMonitorLastRunAction());
          refreshApp();
        }
      }),
    [history, monitorId, dispatch, refreshApp]
  );

  useEffect(() => {
    return function cleanup() {
      unlisten();
    };
  }, [unlisten]);

  useEffect(() => {
    if (pingsLoaded) {
      setLoaded(true);
    }
    if (pingsLoaded && latestPing) {
      setHasPing(true);
    }
  }, [pingsLoaded, latestPing, dispatch, unlisten]);

  return (
    <>
      <MonitorRemoteCallout />
      {!loaded ? (
        <PageLoader
          icon={<EuiLoadingSpinner size="xxl" />}
          title={<h3>{LOADING_TITLE}</h3>}
          body={<p>{LOADING_DESCRIPTION}</p>}
        />
      ) : null}
      {loaded && !hasPing ? (
        <PageLoader
          icon={<EuiLoadingChart size="xl" />}
          title={<h3>{MONITOR_PENDING_HEADING}</h3>}
          body={<p>{MONITOR_PENDING_CONTENT}</p>}
        />
      ) : null}
      <div
        style={loaded && hasPing ? undefined : { display: 'none' }}
        data-test-subj="syntheticsPendingWrapperChildren"
      >
        {children}
      </div>
    </>
  );
};

export const MONITOR_PENDING_HEADING = i18n.translate(
  'xpack.synthetics.monitorDetails.pending.heading',
  {
    defaultMessage: 'Initial test run pending...',
  }
);

export const MONITOR_PENDING_CONTENT = i18n.translate(
  'xpack.synthetics.monitorDetails.pending.content',
  {
    defaultMessage: 'This page will refresh when data becomes available.',
  }
);

export const LOADING_DESCRIPTION = i18n.translate(
  'xpack.synthetics.monitorDetails.loading.content',
  {
    defaultMessage: 'This will take just a second.',
  }
);

export const LOADING_TITLE = i18n.translate('xpack.synthetics.monitorDetails.loading.heading', {
  defaultMessage: 'Loading monitor details',
});
