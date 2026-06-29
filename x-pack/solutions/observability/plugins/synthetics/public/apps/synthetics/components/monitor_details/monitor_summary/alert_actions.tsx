/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useState } from 'react';
import {
  EuiButtonEmpty,
  EuiContextMenuPanel,
  EuiContextMenuItem,
  EuiPopover,
  EuiSkeletonText,
  EuiLoadingSpinner,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FETCH_STATUS } from '@kbn/observability-shared-plugin/public';
import rison from '@kbn/rison';
import { useMonitorQueryId } from '../hooks/use_monitor_query_id';
import { toggleStatusAlert } from '../../../../../../common/runtime_types/monitor_management/alert_config';
import { useMonitorAlertEnable } from '../../../hooks/use_monitor_alert_enable';
import { ConfigKey, isExternalSyntheticsMonitor } from '../../../../../../common/runtime_types';
import { useSelectedMonitor } from '../hooks/use_selected_monitor';
import {
  DISABLE_STATUS_ALERT,
  ENABLE_STATUS_ALERT,
} from '../../monitors_page/management/monitor_list_table/labels';
import { useSyntheticsSettingsContext } from '../../../contexts';

export const AlertActions = ({ from, to }: { from: string; to: string }) => {
  const [isPopoverOpen, setPopover] = useState(false);

  const { monitor } = useSelectedMonitor();
  const monitorQueryId = useMonitorQueryId();
  const { alertStatus, updateAlertEnabledState } = useMonitorAlertEnable();

  const alertsUrl = useAlertsUrl({ rangeFrom: from, rangeTo: to, monitorId: monitorQueryId });

  const onButtonClick = () => {
    setPopover(!isPopoverOpen);
  };

  const isActionLoading = (configId: string) => {
    return alertStatus(configId) === FETCH_STATUS.LOADING;
  };

  if (!monitor) {
    return <EuiSkeletonText lines={1} />;
  }

  // Alert config lives on the local saved object; read-only (remote / heartbeat)
  // monitors have none, so hide the actions menu here entirely.
  if (isExternalSyntheticsMonitor(monitor)) {
    return null;
  }

  const onToggleAlertClick = () => {
    updateAlertEnabledState({
      monitor: {
        [ConfigKey.ALERT_CONFIG]: toggleStatusAlert(monitor[ConfigKey.ALERT_CONFIG]),
      },
      name: monitor[ConfigKey.NAME],
      configId: monitor[ConfigKey.CONFIG_ID],
    });
  };

  const isAlertEnabled = monitor.alert?.status?.enabled;

  const isLoading = isActionLoading(monitor[ConfigKey.CONFIG_ID]);
  const items = [
    <EuiContextMenuItem
      key="edit"
      icon={isAlertEnabled ? 'bellSlash' : 'bell'}
      onClick={onToggleAlertClick}
      disabled={isLoading}
    >
      {isAlertEnabled ? DISABLE_STATUS_ALERT : ENABLE_STATUS_ALERT}{' '}
      {isLoading && <EuiLoadingSpinner />}
    </EuiContextMenuItem>,
    <EuiContextMenuItem key="share" icon="listBullet" href={alertsUrl}>
      {VIEW_ALERTS_LABEL}
    </EuiContextMenuItem>,
  ];

  const button = (
    <EuiButtonEmpty
      data-test-subj="syntheticsAlertActionsButton"
      iconType="chevronSingleDown"
      iconSide="right"
      onClick={onButtonClick}
    >
      {ACTIONS_LABEL}
    </EuiButtonEmpty>
  );

  return (
    <EuiPopover
      id="monitorAlertActionsContext"
      button={button}
      isOpen={isPopoverOpen}
      closePopover={() => setPopover(false)}
      panelPaddingSize="none"
      anchorPosition="downLeft"
      aria-label={i18n.translate('xpack.synthetics.alertActions.popoverAriaLabel', {
        defaultMessage: 'Alert actions menu',
      })}
    >
      <EuiContextMenuPanel items={items} />
    </EuiPopover>
  );
};

export const useAlertsUrl = ({
  rangeFrom,
  rangeTo,
  monitorId,
}: {
  monitorId?: string;
  rangeFrom: string;
  rangeTo: string;
}) => {
  const { basePath } = useSyntheticsSettingsContext();

  let kuery = 'kibana.alert.rule.category : "Synthetics monitor status" ';

  if (monitorId) {
    kuery += `AND monitor.id : "${monitorId}"`;
  }

  return `${basePath}/app/observability/alerts?_a=${rison.encode({
    kuery,
    rangeFrom,
    rangeTo,
  })}`;
};

export const ACTIONS_LABEL = i18n.translate('xpack.synthetics.management.actions', {
  defaultMessage: 'Actions',
});

export const VIEW_ALERTS_LABEL = i18n.translate('xpack.synthetics.management.actions.viewAlerts', {
  defaultMessage: 'View alerts',
});
