/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiButton, EuiCallOut, EuiLink, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibanaSpace } from '../../../../hooks/use_kibana_space';
import { ConfigKey, isRemoteSyntheticsMonitor } from '../../../../../common/runtime_types';
import { createRemoteMonitorDetailUrl } from '../../utils/remote/remote_monitor_urls';
import { useSelectedMonitor } from './hooks/use_selected_monitor';
import { useSelectedLocation } from './hooks/use_selected_location';
import { useMonitorLatestPing } from './hooks/use_monitor_latest_ping';

/**
 * Callout rendered at the top of the monitor detail body when the selected
 * monitor lives on a remote cluster (CCS). Mirrors SLO's `SloRemoteCallout`:
 * surfaces the remote cluster name + Kibana URL and a primary button that
 * deep-links to the same monitor on the origin cluster's Kibana.
 *
 * Renders nothing for local monitors, so non-remote pages are visually
 * unchanged.
 *
 * The overview-status metadata only carries `remote.kibanaUrl` when the remote
 * heartbeat docs surface it via the `top_metrics` aggregation, which silently
 * drops `text`-mapped fields. We fall back to the `kibanaUrl` read straight
 * from the latest ping `_source` so the link is still available when the
 * synthesized {@link RemoteSyntheticsMonitor} lacks one.
 */
export const MonitorRemoteCallout = () => {
  const { monitor } = useSelectedMonitor();
  const location = useSelectedLocation();
  const { space } = useKibanaSpace();
  const { latestPing } = useMonitorLatestPing();

  const isRemote = isRemoteSyntheticsMonitor(monitor);

  const remoteKibanaUrl =
    (isRemote ? monitor.remote?.kibanaUrl : undefined) ??
    latestPing?.remote?.kibanaUrl ??
    latestPing?.kibanaUrl;

  const remoteMonitorUrl = useMemo(() => {
    if (!isRemote) return undefined;
    return createRemoteMonitorDetailUrl({
      // RemoteSyntheticsMonitor stores the config id under `config_id`
      // (ConfigKey.CONFIG_ID), but `createRemoteMonitorDetailUrl` follows
      // OverviewStatusMetaData and expects camelCased `configId`.
      monitor: { configId: monitor[ConfigKey.CONFIG_ID], remote: monitor.remote },
      locationId: location?.id,
      spaceId: space?.id,
      kibanaUrl: remoteKibanaUrl,
    });
  }, [isRemote, monitor, location?.id, space?.id, remoteKibanaUrl]);

  if (!isRemote) {
    return null;
  }

  return (
    <>
      <EuiCallOut
        data-test-subj="syntheticsMonitorRemoteCallout"
        title={REMOTE_MONITOR_TITLE}
        iconType="cluster"
      >
        <p>
          {remoteKibanaUrl ? (
            <FormattedMessage
              id="xpack.synthetics.monitorDetails.remoteCallout.descriptionWithUrl"
              defaultMessage="This is a remote monitor which belongs to another Kibana instance. It is fetched from the remote cluster: {remoteName} with Kibana URL {kibanaUrl}."
              values={{
                remoteName: <strong>{monitor.remote.remoteName}</strong>,
                kibanaUrl: (
                  <EuiLink
                    data-test-subj="syntheticsMonitorRemoteCalloutLink"
                    href={remoteKibanaUrl}
                    target="_blank"
                    external
                  >
                    {remoteKibanaUrl}
                  </EuiLink>
                ),
              }}
            />
          ) : (
            <FormattedMessage
              id="xpack.synthetics.monitorDetails.remoteCallout.description"
              defaultMessage="This is a remote monitor which belongs to another Kibana instance. It is fetched from the remote cluster: {remoteName}."
              values={{ remoteName: <strong>{monitor.remote.remoteName}</strong> }}
            />
          )}
        </p>
        <EuiButton
          data-test-subj="syntheticsMonitorRemoteCalloutButton"
          color="primary"
          fill
          isDisabled={!remoteMonitorUrl}
          href={remoteMonitorUrl}
          target="_blank"
          iconType="popout"
          iconSide="right"
        >
          {VIEW_ON_REMOTE_CLUSTER_LABEL}
        </EuiButton>
      </EuiCallOut>
      <EuiSpacer size="m" />
    </>
  );
};

const REMOTE_MONITOR_TITLE = i18n.translate('xpack.synthetics.monitorDetails.remoteCallout.title', {
  defaultMessage: 'Remote monitor',
});

const VIEW_ON_REMOTE_CLUSTER_LABEL = i18n.translate(
  'xpack.synthetics.monitorDetails.remoteCallout.viewOnRemoteCluster',
  {
    defaultMessage: 'View on remote cluster',
  }
);
