/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { EuiLink, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { MonitorPageLink } from './monitor_page_link';
import type { CertMonitor } from '../../../../../common/runtime_types';

const DEFAULT_DISPLAY_COUNT = 10;

const getRemoteClusterLabel = (remoteName: string) =>
  i18n.translate('xpack.synthetics.certs.monitors.remoteClusterTooltip', {
    defaultMessage: 'Loaded from remote cluster {remoteName}',
    values: { remoteName },
  });

interface Props {
  monitors: CertMonitor[];
}

export const CertMonitors: React.FC<Props> = ({ monitors }) => {
  const [showAll, setShowAll] = useState(false);
  const monitorsToDisplay = showAll ? monitors : monitors.slice(0, DEFAULT_DISPLAY_COUNT);
  const remainingCount = monitors.length - DEFAULT_DISPLAY_COUNT;

  return (
    <span>
      {monitorsToDisplay.map((mon: CertMonitor, ind: number) => (
        <span key={mon.id}>
          {ind > 0 && ', '}
          <EuiToolTip
            content={mon.url}
            title={
              mon.remote?.remoteName ? getRemoteClusterLabel(mon.remote.remoteName) : undefined
            }
          >
            <MonitorPageLink configId={mon.configId!} remote={mon.remote}>
              {mon.name || mon.id}
            </MonitorPageLink>
          </EuiToolTip>
        </span>
      ))}
      {monitors.length > DEFAULT_DISPLAY_COUNT && !showAll && (
        <span>
          {', '}
          <EuiLink data-test-subj="certMonitorsViewAll" onClick={() => setShowAll(true)}>
            {i18n.translate('xpack.synthetics.certs.monitors.viewAll', {
              defaultMessage: '+{remainingCount} more',
              values: { remainingCount },
            })}
          </EuiLink>
        </span>
      )}
      {monitors.length > DEFAULT_DISPLAY_COUNT && showAll && (
        <span>
          {' '}
          <EuiLink data-test-subj="certMonitorsShowFewer" onClick={() => setShowAll(false)}>
            {i18n.translate('xpack.synthetics.certs.monitors.showFewer', {
              defaultMessage: 'Show fewer',
            })}
          </EuiLink>
        </span>
      )}
    </span>
  );
};
