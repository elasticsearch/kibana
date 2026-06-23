/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useContext, useState } from 'react';

import { EuiButton, EuiContextMenu, EuiIcon, EuiPopover } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useSelector, useDispatch } from 'react-redux';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { CLIENT_ALERT_TYPES } from '../../../../../common/constants/uptime_alerts';
import {
  canDeleteMLJobSelector,
  hasMLJobSelector,
  isMLJobCreatingSelector,
  mlCapabilitiesSelector,
} from '../../../state/selectors';
import { UptimeSettingsContext } from '../../../contexts';
import * as labels from './translations';
import { getMLJobLinkHref } from './ml_job_link';
import { useGetUrlParams } from '../../../hooks';
import { useMonitorId } from '../../../hooks';
import { setAlertFlyoutType, setAlertFlyoutVisible } from '../../../state/actions';
import { useAnomalyAlert } from './use_anomaly_alert';
import { ConfirmAlertDeletion } from './confirm_alert_delete';
import {
  deleteAnomalyAlertAction,
  getAnomalyAlertAction,
  isAnomalyAlertDeleting,
} from '../../../state/alerts/alerts';
import { UptimeEditAlertFlyoutComponent } from '../../common/alerts/uptime_edit_alert_flyout';

interface Props {
  hasMLJob: boolean;
  onEnableJob: () => void;
  onJobDelete: () => void;
}

export const ManageMLJobComponent = ({ hasMLJob, onEnableJob, onJobDelete }: Props) => {
  const core = useKibana();

  const [isPopOverOpen, setIsPopOverOpen] = useState(false);

  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);

  const { basePath } = useContext(UptimeSettingsContext);

  const canDeleteMLJob = useSelector(canDeleteMLJobSelector);

  const isMLJobCreating = useSelector(isMLJobCreatingSelector);
  const isAlertDeleting = useSelector(isAnomalyAlertDeleting);

  const { loading: isMLJobLoading } = useSelector(hasMLJobSelector);
  const { loading: isCapbilityLoading } = useSelector(mlCapabilitiesSelector);

  const { dateRangeStart, dateRangeEnd } = useGetUrlParams();

  const monitorId = useMonitorId();

  const dispatch = useDispatch();

  const anomalyAlert = useAnomalyAlert();

  const [isConfirmAlertDeleteOpen, setIsConfirmAlertDeleteOpen] = useState(false);

  const deleteAnomalyAlert = () =>
    dispatch(deleteAnomalyAlertAction.get({ alertId: anomalyAlert?.id as string }));

  const showLoading = isMLJobCreating || isMLJobLoading || isAlertDeleting || isCapbilityLoading;

  const btnText = hasMLJob ? labels.ANOMALY_DETECTION : labels.ENABLE_ANOMALY_DETECTION;

  const button = (
    <EuiButton
      data-test-subj={hasMLJob ? 'uptimeManageMLJobBtn' : 'uptimeEnableAnomalyBtn'}
      onClick={hasMLJob ? () => setIsPopOverOpen(!isPopOverOpen) : onEnableJob}
      disabled={hasMLJob && !canDeleteMLJob}
      isLoading={showLoading}
      size="s"
      aria-label={labels.ENABLE_MANAGE_JOB}
    >
      {showLoading ? '' : btnText}
    </EuiButton>
  );

  const hasUptimeWrite = core.services.application?.capabilities.uptime?.save ?? false;

  const panels = [
    {
      id: 0,
      title: labels.MANAGE_ANOMALY_DETECTION,
      items: [
        {
          name: labels.EXPLORE_IN_ML_APP,
          icon: <EuiIcon type="dataVisualizer" size="m" aria-hidden={true} />,
          href: getMLJobLinkHref({
            basePath,
            monitorId,
            dateRange: { from: dateRangeStart, to: dateRangeEnd },
          }),
        },
        ...(anomalyAlert
          ? [
              {
                name: 'Anomaly alert',
                icon: 'bell',
                'data-test-subj': 'uptimeManageAnomalyAlertBtn',
                panel: 1,
              },
            ]
          : [
              {
                name: labels.ENABLE_ANOMALY_ALERT,
                'data-test-subj': 'uptimeEnableAnomalyAlertBtn',
                icon: 'bell',
                disabled: !hasUptimeWrite,
                toolTipContent: !hasUptimeWrite
                  ? labels.ENABLE_ANOMALY_NO_PERMISSIONS_TOOLTIP
                  : null,
                onClick: () => {
                  dispatch(setAlertFlyoutType(CLIENT_ALERT_TYPES.DURATION_ANOMALY));
                  dispatch(setAlertFlyoutVisible(true));
                  setIsPopOverOpen(false);
                },
              },
            ]),
        {
          name: labels.DISABLE_ANOMALY_DETECTION,
          'data-test-subj': 'uptimeDeleteMLJobBtn',
          icon: <EuiIcon type="trash" size="m" aria-hidden={true} />,
          onClick: () => {
            setIsPopOverOpen(false);
            onJobDelete();
          },
        },
      ],
    },
    {
      id: 1,
      title: 'Anomaly alert',
      items: [
        {
          name: 'Edit',
          'data-test-subj': 'uptimeEditAnomalyAlertBtn',
          onClick: () => {
            setIsFlyoutOpen(true);
            setIsPopOverOpen(false);
          },
        },
        {
          name: 'Disable',
          'data-test-subj': 'uptimeDisableAnomalyAlertBtn',
          onClick: () => {
            setIsConfirmAlertDeleteOpen(true);
          },
        },
      ],
    },
  ];

  const onCloseFlyout = useCallback(() => {
    setIsFlyoutOpen(false);
    dispatch(getAnomalyAlertAction.get({ monitorId }));
  }, [dispatch, monitorId]);

  return (
    <>
      <EuiPopover
        aria-label={i18n.translate('xpack.uptime.manageMlJob.popoverAriaLabel', {
          defaultMessage: 'Manage anomaly detection actions',
        })}
        button={button}
        isOpen={isPopOverOpen}
        closePopover={() => setIsPopOverOpen(false)}
        panelPaddingSize="none"
      >
        <EuiContextMenu
          initialPanelId={0}
          panels={panels}
          data-test-subj="uptimeManageMLContextMenu"
        />
      </EuiPopover>
      {isConfirmAlertDeleteOpen && (
        <ConfirmAlertDeletion
          onConfirm={() => {
            deleteAnomalyAlert();
            setIsConfirmAlertDeleteOpen(false);
            setIsPopOverOpen(false);
          }}
          onCancel={() => {
            setIsConfirmAlertDeleteOpen(false);
          }}
        />
      )}
      {isFlyoutOpen && (
        <UptimeEditAlertFlyoutComponent
          initialAlert={anomalyAlert!}
          alertFlyoutVisible={isFlyoutOpen}
          setAlertFlyoutVisibility={onCloseFlyout}
        />
      )}
    </>
  );
};
