/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as React from 'react';
import {
  EuiLoadingSpinner,
  EuiToolTip,
  EuiButtonIcon,
  EuiPopover,
  EuiPopoverTitle,
  EuiPopoverFooter,
  EuiButton,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiSpacer,
  EuiSkeletonText,
  EuiIconTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { useDispatch, useSelector } from 'react-redux';
import styled from '@emotion/styled';
import { i18n } from '@kbn/i18n';

import { useMonitorMWs } from '../../../hooks/use_monitor_mws';
import { MetricErrorIcon } from './metric_error_icon';
import type { OverviewStatusMetaData } from '../../../../../../../../common/runtime_types';
import { isTestRunning, manualTestRunSelector } from '../../../../../state/manual_test_runs';
import { selectErrorPopoverState, toggleErrorPopoverOpen } from '../../../../../state';
import { useErrorDetailsLink } from '../../../../common/links/error_details_link';
import { useDateFormat } from '../../../../../../../hooks/use_date_format';
import { useLatestError } from './use_latest_error';

const Container = styled.div`
  display: inline-block;
  position: absolute;
  right: 10px;
  top: 10px;
  z-index: 1;
`;

export const MetricItemIcon = ({
  monitor,
  status,
  timestamp,
  configIdByLocation,
}: {
  monitor: OverviewStatusMetaData;
  status: string;
  configIdByLocation: string;
  timestamp?: string;
}) => {
  const locationId = monitor.locations[0]?.id ?? '';

  const testNowRun = useSelector(manualTestRunSelector(monitor.configId));
  const isPopoverOpen = useSelector(selectErrorPopoverState);
  const { latestPing } = useLatestError({
    monitor,
    configIdByLocation,
  });

  const dispatch = useDispatch();
  const { activeMWs } = useMonitorMWs(monitor);

  const inProgress = isTestRunning(testNowRun);

  const stateId = latestPing?.state?.id;
  const errorLink = useErrorDetailsLink({
    locationId,
    configId: monitor.configId,
    stateId: stateId ?? '',
    remoteName: monitor.remote?.remoteName,
  });

  const formatter = useDateFormat();
  const testTime = formatter(timestamp);
  const metricItemPopoverTitleId = useGeneratedHtmlId();

  if (inProgress) {
    return (
      <Container>
        <EuiToolTip position="top" content={TEST_IN_PROGRESS}>
          <EuiLoadingSpinner />
        </EuiToolTip>
      </Container>
    );
  }

  if (activeMWs.length) {
    return (
      <Container>
        <EuiIconTip
          content={i18n.translate(
            'xpack.synthetics.metricItemIcon.euiButtonIcon.maintenanceWindowActive',
            {
              defaultMessage: 'Monitor is stopped while maintenance windows are running.',
            }
          )}
          type="pause"
          color="warning"
          iconProps={{
            'data-test-subj': 'syntheticsMetricItemIconButton',
          }}
        />
      </Container>
    );
  }

  const closePopover = () => {
    dispatch(toggleErrorPopoverOpen(null));
  };

  if (status === 'stale') {
    return (
      <Container>
        <EuiIconTip
          content={STALE_TOOLTIP}
          type="warning"
          color="warning"
          iconProps={{
            'data-test-subj': 'syntheticsMetricItemStaleIcon',
          }}
        />
      </Container>
    );
  }

  if (status === 'down') {
    return (
      <Container>
        <EuiPopover
          button={<MetricErrorIcon configIdByLocation={configIdByLocation} />}
          isOpen={configIdByLocation === isPopoverOpen}
          closePopover={closePopover}
          anchorPosition="upCenter"
          panelStyle={{
            outline: 'none',
          }}
          aria-labelledby={metricItemPopoverTitleId}
        >
          <EuiPopoverTitle id={metricItemPopoverTitleId}>
            <EuiFlexGroup>
              <EuiFlexItem grow>{testTime}</EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={i18n.translate(
                    'xpack.synthetics.metricItemIcon.euiButtonIcon.closePopover',
                    {
                      defaultMessage: 'Close popover',
                    }
                  )}
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    data-test-subj="syntheticsMetricItemIconButton"
                    iconType="cross"
                    onClick={closePopover}
                    aria-label={i18n.translate(
                      'xpack.synthetics.metricItemIcon.euiButtonIcon.closePopover',
                      {
                        defaultMessage: 'Close popover',
                      }
                    )}
                  />
                </EuiToolTip>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPopoverTitle>
          <div style={{ width: '300px', overflowWrap: 'break-word' }}>
            {latestPing?.url?.full && (
              <>
                {i18n.translate('xpack.synthetics.metricItemIcon.div.urlLabel', {
                  defaultMessage: 'URL: ',
                })}
                <EuiLink
                  data-test-subj="syntheticsMetricItemIconLink"
                  href={latestPing.url.full}
                  target="_blank"
                >
                  {latestPing.url.full}
                </EuiLink>
                <EuiSpacer size="s" />
              </>
            )}
            <EuiCallOut
              announceOnMount
              title={
                latestPing?.error?.message ? (
                  latestPing?.error?.message
                ) : (
                  <EuiSkeletonText lines={2} />
                )
              }
              color="danger"
              iconType="warning"
            />
          </div>
          <EuiPopoverFooter>
            <EuiButton
              data-test-subj="syntheticsMetricItemIconButton"
              fullWidth
              size="s"
              href={errorLink}
              isDisabled={!stateId}
            >
              {ERROR_DETAILS}
            </EuiButton>
          </EuiPopoverFooter>
        </EuiPopover>
      </Container>
    );
  } else {
    if (monitor.urls) {
      return (
        <Container>
          <EuiToolTip content={monitor.urls} disableScreenReaderOutput>
            <EuiButtonIcon
              color="text"
              data-test-subj="syntheticsMetricItemIconButton"
              href={monitor.urls}
              iconType="link"
              target="_blank"
              aria-label={i18n.translate(
                'xpack.synthetics.metricItemIcon.euiButtonIcon.monitorUrl',
                {
                  defaultMessage: 'Monitor url',
                }
              )}
            />
          </EuiToolTip>
        </Container>
      );
    }
    return null;
  }
};

const ERROR_DETAILS = i18n.translate('xpack.synthetics.errorDetails.label', {
  defaultMessage: 'Error details',
});

const TEST_IN_PROGRESS = i18n.translate('xpack.synthetics.inProgress.label', {
  defaultMessage: 'Manual test run is in progress.',
});

const STALE_TOOLTIP = i18n.translate('xpack.synthetics.metricItemIcon.staleTooltip', {
  defaultMessage:
    'This monitor has stopped reporting. Its last known status may be stale — worth investigating.',
});
