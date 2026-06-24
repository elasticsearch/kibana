/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React from 'react';
import { EuiLink } from '@elastic/eui';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { RemoteMonitorInfo } from '../../../../../common/runtime_types';
import { useKibanaSpace } from '../../../../hooks/use_kibana_space';
import { createRemoteMonitorDetailUrl } from '../../utils/remote/remote_monitor_urls';

interface DetailPageLinkProps {
  configId: string;
  // Remote (CCS) monitor: deep-link to the remote Kibana when `kibanaUrl` is
  // present (matches the overview flyout), else fall back to local with
  // `?remoteName=<alias>`.
  remote?: RemoteMonitorInfo;
}

export const MonitorPageLink: FC<PropsWithChildren<DetailPageLinkProps>> = ({
  children,
  configId,
  remote,
}) => {
  const basePath = useKibana().services.http?.basePath.get();
  const { space } = useKibanaSpace();

  if (remote?.kibanaUrl) {
    const externalUrl = createRemoteMonitorDetailUrl({
      monitor: { configId, remote },
      kibanaUrl: remote.kibanaUrl,
      spaceId: space?.id,
    });
    if (externalUrl) {
      return (
        <EuiLink
          data-test-subj="syntheticsMonitorPageLinkRemoteLink"
          href={externalUrl}
          target="_blank"
          external
        >
          {children}
        </EuiLink>
      );
    }
  }

  const search = remote?.remoteName ? `?remoteName=${encodeURIComponent(remote.remoteName)}` : '';

  return (
    <EuiLink
      data-test-subj="syntheticsMonitorPageLinkLink"
      href={`${basePath}/app/synthetics/monitor/${configId}${search}`}
    >
      {children}
    </EuiLink>
  );
};
