/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useParams } from 'react-router-dom';
import { i18n } from '@kbn/i18n';
import { EuiButton, EuiContextMenuItem } from '@elastic/eui';

import { useCanEditSynthetics } from '../../../../../hooks/use_capabilities';
import { useSyntheticsSettingsContext } from '../../../contexts';
import { NoPermissionsTooltip } from '../../common/components/permissions';
import { useGetUrlParams } from '../../../hooks';
import { isRemoteSyntheticsMonitor } from '../../../../../../common/runtime_types';
import { createRemoteMonitorEditUrl } from '../../../utils/remote/remote_monitor_urls';
import { useSelectedMonitor } from '../hooks/use_selected_monitor';

export const EditMonitorLink = () => {
  const { basePath } = useSyntheticsSettingsContext();

  const { monitorId } = useParams<{ monitorId: string }>();
  const { spaceId } = useGetUrlParams();
  const canEditSynthetics = useCanEditSynthetics();
  const isLinkDisabled = !canEditSynthetics;
  const linkProps = isLinkDisabled
    ? { disabled: true }
    : {
        href:
          `${basePath}/app/synthetics/edit-monitor/${monitorId}` +
          (spaceId ? `?spaceId=${spaceId}` : ''),
      };

  return (
    <NoPermissionsTooltip canEditSynthetics={canEditSynthetics}>
      <EuiButton
        data-test-subj="syntheticsEditMonitorLinkButton"
        fill
        iconType="pencil"
        iconSide="left"
        {...linkProps}
      >
        {EDIT_MONITOR}
      </EuiButton>
    </NoPermissionsTooltip>
  );
};

export const EditMonitorContextItem = ({ isRemote = false }: { isRemote?: boolean }) => {
  const { basePath } = useSyntheticsSettingsContext();
  const { monitorId } = useParams<{ monitorId: string }>();
  const { remoteName, spaceId } = useGetUrlParams();
  const canEditSynthetics = useCanEditSynthetics();
  const { monitor } = useSelectedMonitor();

  if (isRemote) {
    const remoteKibanaUrl = isRemoteSyntheticsMonitor(monitor)
      ? monitor.remote.kibanaUrl
      : undefined;
    const remoteEditUrl = remoteName
      ? createRemoteMonitorEditUrl({
          monitor: {
            configId: monitorId,
            remote: { remoteName, ...(remoteKibanaUrl ? { kibanaUrl: remoteKibanaUrl } : {}) },
          },
          spaceId,
        })
      : undefined;
    const hasUndefinedRemoteKibanaUrl = !remoteEditUrl;

    // `EuiContextMenuItem` auto-renders a popout icon for `target="_blank"`.
    return (
      <EuiContextMenuItem
        icon="pencil"
        data-test-subj="syntheticsEditMonitorContextItem"
        href={remoteEditUrl}
        target={remoteEditUrl ? '_blank' : undefined}
        disabled={hasUndefinedRemoteKibanaUrl}
        toolTipContent={
          hasUndefinedRemoteKibanaUrl
            ? NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL
            : canEditSynthetics
            ? undefined
            : PERMISSIONS_ON_ORIGIN_CLUSTER
        }
      >
        {EDIT_MONITOR}
      </EuiContextMenuItem>
    );
  }

  const isLinkDisabled = !canEditSynthetics;
  const linkProps = isLinkDisabled
    ? { disabled: true }
    : {
        href:
          `${basePath}/app/synthetics/edit-monitor/${monitorId}` +
          (spaceId ? `?spaceId=${spaceId}` : ''),
      };

  return (
    <EuiContextMenuItem
      icon={'pencil'}
      data-test-subj="syntheticsEditMonitorContextItem"
      {...linkProps}
      disabled={isLinkDisabled}
    >
      {EDIT_MONITOR}
    </EuiContextMenuItem>
  );
};

const EDIT_MONITOR = i18n.translate('xpack.synthetics.monitorSummary.editMonitor', {
  defaultMessage: 'Edit monitor',
});

const NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL = i18n.translate(
  'xpack.synthetics.monitorDetails.actions.remoteKibanaUrlUndefined',
  {
    defaultMessage: 'This action is not available for remote monitors with undefined kibanaUrl',
  }
);

const PERMISSIONS_ON_ORIGIN_CLUSTER = i18n.translate(
  'xpack.synthetics.monitorDetails.actions.permissionsOnOriginCluster',
  {
    defaultMessage: 'Permissions are enforced on the origin cluster.',
  }
);
