/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { MouseEvent } from 'react';
import React, { useMemo, useState } from 'react';
import {
  EuiSpacer,
  EuiText,
  EuiInMemoryTable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiBadge,
  EuiButtonIcon,
  useIsWithinMinBreakpoint,
  EuiLink,
  EuiToolTip,
} from '@elastic/eui';
import { useHistory, useParams } from 'react-router-dom';
import moment from 'moment';
import { css } from '@emotion/react';
import { useSelectedLocation } from '../hooks/use_selected_location';
import { ErrorDetailsLink } from '../../common/links/error_details_link';
import type { PingState, ErrorGroupItem } from '../../../../../../common/runtime_types';
import { useErrorFailedStep } from '../hooks/use_error_failed_step';
import { formatTestDuration } from '../../../utils/monitor_test_result/test_time_formats';
import { useDateFormat } from '../../../../../hooks/use_date_format';
import { useMonitorLatestPing } from '../hooks/use_monitor_latest_ping';
import { useUrlSpaceId } from '../../../hooks/use_url_space_id';
import { useSyntheticsSettingsContext } from '../../../contexts';
import { ErrorPreviewFlyout } from '../../monitors_page/errors/error_preview_flyout';
import { getErrorDetailsUrl } from './error_details_url';

export { getErrorDetailsUrl };

export function getNextUpStateForResolvedError(
  errorState: PingState,
  upStates: PingState[],
  scopeByMonitor: boolean
) {
  for (const upState of upStates) {
    if (scopeByMonitor && upState.config_id !== errorState.config_id) continue;
    if (upState.observer?.name !== errorState.observer?.name) continue;
    if (moment(upState.state.started_at).valueOf() > moment(errorState['@timestamp']).valueOf())
      return upState;
  }
}

export function computeActiveErrorKeys(
  errorStates: PingState[],
  upStates: PingState[]
): Set<string> {
  const latestErrorByMonitorAndLocation = new Map<string, PingState>();
  for (const err of errorStates) {
    const key = `${err.config_id}:${err.observer?.name ?? ''}`;
    const existing = latestErrorByMonitorAndLocation.get(key);
    if (!existing || moment(err['@timestamp']).isAfter(existing['@timestamp'])) {
      latestErrorByMonitorAndLocation.set(key, err);
    }
  }

  const ids = new Set<string>();
  for (const latestErr of latestErrorByMonitorAndLocation.values()) {
    const resolved = getNextUpStateForResolvedError(latestErr, upStates, true);
    if (!resolved) {
      ids.add(`${latestErr.config_id}:${latestErr['@timestamp']}`);
    }
  }
  return ids;
}

export const ErrorsList = ({
  errorStates,
  upStates,
  loading,
  showMonitorName = false,
}: {
  errorStates: PingState[];
  upStates: PingState[];
  loading: boolean;
  showMonitorName?: boolean;
}) => {
  const { monitorId: configId } = useParams<{ monitorId: string }>();
  const [previewItem, setPreviewItem] = useState<ErrorGroupItem | null>(null);

  const { basePath } = useSyntheticsSettingsContext();

  const isGlobalView = !configId && showMonitorName;

  const checkGroups = useMemo(() => {
    return errorStates.map((error) => error.monitor.check_group!);
  }, [errorStates]);

  const { failedSteps } = useErrorFailedStep(checkGroups);

  // Both browser and API journeys emit `synthetics.step` events, so the
  // "Failed step" column applies to either. HTTP/TCP/ICMP errors have no
  // step concept and should drop the column.
  const hasStepBasedErrors = errorStates.some(
    (e) => e.monitor.type === 'browser' || e.monitor.type === 'api'
  );
  const hasHttpStatusCodes = errorStates.some((e) => e.http?.response?.status_code);

  const history = useHistory();

  const formatter = useDateFormat();
  const selectedLocation = useSelectedLocation();
  const spaceId = useUrlSpaceId();

  const { latestPing } = useMonitorLatestPing({
    monitorId: configId,
  });

  const activeErrorIds = useMemo(() => {
    const ids = new Set<string>();

    if (isGlobalView) {
      for (const id of computeActiveErrorKeys(errorStates, upStates)) {
        ids.add(id);
      }
    } else if (latestPing?.monitor.status === 'down') {
      const sorted = [...errorStates].sort(
        (a, b) => moment(b.state.started_at).valueOf() - moment(a.state.started_at).valueOf()
      );
      if (sorted[0]) {
        ids.add(`${sorted[0].config_id}:${sorted[0]['@timestamp']}`);
      }
    }

    return ids;
  }, [errorStates, upStates, isGlobalView, latestPing]);

  const isActive = (item: PingState) =>
    activeErrorIds.has(`${item.config_id}:${item['@timestamp']}`);

  const isTabletOrGreater = useIsWithinMinBreakpoint('s');

  const columns = [
    {
      field: 'item.state.started_at',
      name: TIMESTAMP_LABEL,
      sortable: (a: PingState) => {
        return moment(a.state.started_at).valueOf();
      },
      render: (_value: string, item: PingState) => {
        const link = (
          <ErrorDetailsLink
            configId={item.config_id ?? configId}
            stateId={item.state.id}
            label={formatter(item.state.started_at)}
            locationId={item.observer?.name}
          />
        );

        if (isActive(item)) {
          return (
            <EuiFlexGroup gutterSize="m" alignItems="center" wrap={true}>
              <EuiFlexItem grow={false} className="eui-textNoWrap">
                {link}
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge iconType="clock" iconSide="right" css={{ maxWidth: 'max-content' }}>
                  {ACTIVE_LABEL}
                </EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        }
        return link;
      },
      mobileOptions: {
        header: false,
      },
    },
    ...(showMonitorName
      ? [
          {
            field: 'monitor.name',
            name: MONITOR_NAME_LABEL,
            render: (monName: string, error: PingState) => {
              return (
                <EuiLink
                  data-test-subj="syntheticsColumnsLink"
                  href={`${basePath}/app/synthetics/monitor/${error.config_id}`}
                >
                  {monName}
                </EuiLink>
              );
            },
          },
        ]
      : []),
    ...(hasStepBasedErrors
      ? [
          {
            field: 'monitor.check_group',
            name: FAILED_STEP_LABEL,
            truncateText: true,
            sortable: (a: PingState) => {
              const failedStep = failedSteps.find(
                (step) => step.monitor.check_group === a.monitor.check_group
              );
              if (!failedStep) {
                return a.monitor.check_group;
              }
              return failedStep.synthetics?.step?.name;
            },
            render: (value: string, item: PingState) => {
              if (item.monitor.type !== 'browser' && item.monitor.type !== 'api') {
                return (
                  <>{i18n.translate('xpack.synthetics.columns.Label', { defaultMessage: '--' })}</>
                );
              }
              const failedStep = failedSteps.find((step) => step.monitor.check_group === value);
              if (!failedStep) {
                return (
                  <>{i18n.translate('xpack.synthetics.columns.Label', { defaultMessage: '--' })}</>
                );
              }
              return (
                <EuiText size="s">
                  {failedStep.synthetics?.step?.index}. {failedStep.synthetics?.step?.name}
                </EuiText>
              );
            },
          },
        ]
      : []),
    {
      field: 'error.message',
      name: ERROR_MESSAGE_LABEL,
      css: css`
        max-width: 400px;
      `,
    },
    ...(hasHttpStatusCodes
      ? [
          {
            field: 'http.response.status_code',
            name: RESULT_CODE_LABEL,
            sortable: true,
            width: '100px',
            render: (value: number) => {
              if (!value) return <>{'--'}</>;
              const color = value >= 500 ? 'danger' : value >= 400 ? 'warning' : 'default';
              return <EuiBadge color={color}>{value}</EuiBadge>;
            },
          },
        ]
      : []),
    {
      field: 'state.duration_ms',
      name: ERROR_DURATION_LABEL,
      align: 'right' as const,
      sortable: true,
      render: (value: string, item: PingState) => {
        let activeDuration = 0;
        if (item.monitor.timespan) {
          const diff = moment(item.monitor.timespan.lt).diff(
            moment(item.monitor.timespan.gte),
            'millisecond'
          );
          if (isActive(item)) {
            const currentDiff = moment().diff(item['@timestamp']);

            activeDuration = currentDiff < diff ? currentDiff : diff;
          } else {
            const resolvedState = getNextUpStateForResolvedError(item, upStates, isGlobalView);

            activeDuration = resolvedState
              ? moment(resolvedState.state.started_at).diff(item['@timestamp'])
              : 0;
          }
        }
        return (
          <EuiText size="s">{formatTestDuration(Number(value) + activeDuration, true)}</EuiText>
        );
      },
    },
    {
      field: '@timestamp',
      name: RESOLVED_AT_LABEL,
      sortable: (a: PingState) => {
        const resolvedState = getNextUpStateForResolvedError(a, upStates, isGlobalView);
        return resolvedState ? moment(resolvedState.state.started_at).valueOf() : 0;
      },
      render: (_value: string, item: PingState) => {
        if (isActive(item)) {
          return (
            <EuiBadge color="danger" css={{ maxWidth: 'max-content' }}>
              {ACTIVE_LABEL}
            </EuiBadge>
          );
        }
        const resolvedState = getNextUpStateForResolvedError(item, upStates, isGlobalView);
        if (resolvedState) {
          return <EuiText size="s">{formatter(resolvedState.state.started_at)}</EuiText>;
        }
        return <EuiText size="s">{'--'}</EuiText>;
      },
    },
    {
      name: '',
      width: '40px',
      render: (item: PingState) => (
        <EuiToolTip content={PREVIEW_LABEL} disableScreenReaderOutput>
          <EuiButtonIcon
            data-test-subj={`syntheticsErrorPreview-${item.state?.id}`}
            iconType="eye"
            aria-label={PREVIEW_LABEL}
            onClick={(evt: MouseEvent) => {
              evt.stopPropagation();
              setPreviewItem({
                timestamp: item.state?.started_at ?? item['@timestamp'] ?? '',
                monitorName: item.monitor?.name ?? '',
                monitorType: item.monitor?.type ?? '',
                configId: item.config_id ?? configId ?? '',
                stateId: item.state?.id ?? '',
                checkGroup: item.monitor?.check_group ?? '',
                locationName: item.observer?.geo?.name ?? item.observer?.name ?? '',
                locationId: item.observer?.name ?? '',
                durationMs: Number(item.state?.duration_ms) || 0,
                errorMessage: item.error?.message ?? '',
              });
            }}
            size="xs"
          />
        </EuiToolTip>
      ),
    },
  ];

  const getRowProps = (item: PingState) => {
    const { state } = item;
    if (state.id) {
      const itemConfigId = item.config_id ?? configId;
      const locationId = item.observer?.name ?? selectedLocation?.id;
      const locationQuery = locationId ? `?locationId=${encodeURIComponent(locationId)}` : '';
      const spaceIdQuery = spaceId
        ? `${locationQuery ? '&' : '?'}spaceId=${encodeURIComponent(spaceId)}`
        : '';
      return {
        'data-test-subj': `row-${state.id}`,
        onClick: (evt: MouseEvent) => {
          history.push(
            `/monitor/${itemConfigId}/errors/${state.id}${locationQuery}${spaceIdQuery}`
          );
        },
      };
    }
  };

  return (
    <div>
      <EuiSpacer />
      <EuiInMemoryTable
        css={{ overflowX: isTabletOrGreater ? 'auto' : undefined }}
        tableLayout="auto"
        tableCaption={ERRORS_LIST_LABEL}
        loading={loading}
        items={errorStates}
        columns={columns}
        rowProps={getRowProps}
        pagination={{ pageSizeOptions: [5, 10, 20, 50, 100] }}
        sorting={{
          sort: {
            field: 'item.state.started_at',
            direction: 'desc',
          },
        }}
      />
      {previewItem && (
        <ErrorPreviewFlyout error={previewItem} onClose={() => setPreviewItem(null)} />
      )}
    </div>
  );
};

const ERRORS_LIST_LABEL = i18n.translate('xpack.synthetics.errorStatesList.label', {
  defaultMessage: 'Error states list',
});

const ERROR_DURATION_LABEL = i18n.translate('xpack.synthetics.errorDuration.label', {
  defaultMessage: 'Error duration',
});

const ERROR_MESSAGE_LABEL = i18n.translate('xpack.synthetics.errorMessage.label', {
  defaultMessage: 'Error message',
});

const FAILED_STEP_LABEL = i18n.translate('xpack.synthetics.failedStep.label', {
  defaultMessage: 'Failed step',
});

const TIMESTAMP_LABEL = i18n.translate('xpack.synthetics.timestamp.label', {
  defaultMessage: '@timestamp',
});

const ACTIVE_LABEL = i18n.translate('xpack.synthetics.active.label', {
  defaultMessage: 'Active',
});

const RESOLVED_AT_LABEL = i18n.translate('xpack.synthetics.resolvedAt.label', {
  defaultMessage: 'Resolved at',
});

const MONITOR_NAME_LABEL = i18n.translate('xpack.synthetics.monitorName.label', {
  defaultMessage: 'Monitor name',
});

const RESULT_CODE_LABEL = i18n.translate('xpack.synthetics.resultCode.label', {
  defaultMessage: 'Result code',
});

const PREVIEW_LABEL = i18n.translate('xpack.synthetics.errorPreview.quickPreview', {
  defaultMessage: 'Quick preview',
});
