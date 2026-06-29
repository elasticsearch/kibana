/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiLink,
  EuiText,
  EuiSpacer,
  EuiDescriptionList,
  EuiSkeletonText,
  EuiDescriptionListTitle,
  EuiDescriptionListDescription,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useDispatch } from 'react-redux';
import { TagsList } from '@kbn/observability-shared-plugin/public';
import { isEmpty } from 'lodash';
import { useKibanaSpace } from '../../../../../hooks/use_kibana_space';
import { PanelWithTitle } from './panel_with_title';
import { MonitorEnabled } from '../../monitors_page/management/monitor_list_table/monitor_enabled';
import { getMonitorAction } from '../../../state';
import { LocationsStatus } from '../../monitor_details/monitor_summary/locations_status';
import type {
  EncryptedSyntheticsSavedMonitor,
  MonitorFields,
  Ping,
  SelectedSyntheticsMonitor,
  SyntheticsMonitorWithId,
} from '../../../../../../common/runtime_types';
import { ConfigKey, isExternalSyntheticsMonitor } from '../../../../../../common/runtime_types';
import { MonitorTypeBadge } from './monitor_type_badge';
import { useDateFormat } from '../../../../../hooks/use_date_format';
import { useGetUrlParams } from '../../../hooks';

export interface MonitorDetailsPanelProps {
  latestPing?: Ping;
  loading: boolean;
  configId: string;
  monitor: SyntheticsMonitorWithId | SelectedSyntheticsMonitor | null;
  hideEnabled?: boolean;
  hideLocations?: boolean;
  hasBorder?: boolean;
}

export const MonitorDetailsPanel = ({
  monitor,
  latestPing,
  loading,
  configId,
  hideEnabled = false,
  hideLocations = false,
  hasBorder = true,
}: MonitorDetailsPanelProps) => {
  const dispatch = useDispatch();
  const { space } = useKibanaSpace();
  const { spaceId } = useGetUrlParams();

  if (!monitor) {
    return <EuiSkeletonText lines={8} />;
  }

  // External monitors (remote CCS + Heartbeat/Agent) are read-only projections
  // with no saved object, so SO-only fields (labels/updated_at/project_id/
  // enabled toggle) are unavailable and must be hidden from the panel.
  const isExternal = isExternalSyntheticsMonitor(monitor as SelectedSyntheticsMonitor);
  const savedMonitor = isExternal
    ? null
    : (monitor as EncryptedSyntheticsSavedMonitor | SyntheticsMonitorWithId);

  const url = latestPing?.url?.full ?? (savedMonitor as unknown as MonitorFields)?.[ConfigKey.URLS];
  const labels = savedMonitor?.[ConfigKey.LABELS];
  // External monitors have no SO schedule; Heartbeat encodes its run interval in
  // each ping's `monitor.timespan`, so fall back to deriving it for display.
  const schedule =
    savedMonitor?.[ConfigKey.SCHEDULE] ?? getScheduleFromTimespan(latestPing?.monitor?.timespan);

  return (
    <PanelWithTitle
      paddingSize="m"
      margin="none"
      title={MONITOR_DETAILS_LABEL}
      titleLeftAlign
      hasBorder={hasBorder}
    >
      <EuiSpacer size="s" />
      <EuiDescriptionList
        type="responsiveColumn"
        columnWidths={[2, 3]}
        compressed
        align="left"
        css={{ maxWidth: 550 }}
      >
        {!hideEnabled && savedMonitor && (
          <>
            <EuiDescriptionListTitle>{ENABLED_LABEL}</EuiDescriptionListTitle>
            <EuiDescriptionListDescription>
              <MonitorEnabled
                initialLoading={loading}
                configId={configId}
                monitor={savedMonitor}
                reloadPage={() => {
                  dispatch(
                    getMonitorAction.get({
                      monitorId: configId,
                      ...(spaceId && spaceId !== space?.id ? { spaceId } : {}),
                    })
                  );
                }}
              />
            </EuiDescriptionListDescription>
          </>
        )}
        <EuiDescriptionListTitle>{URL_LABEL}</EuiDescriptionListTitle>
        <EuiDescriptionListDescription style={{ wordBreak: 'break-all' }}>
          {url ? (
            <EuiLink data-test-subj="syntheticsMonitorDetailsPanelLink" href={url} external>
              {url}
            </EuiLink>
          ) : (
            <EuiText color="subdued" size="s">
              {UN_AVAILABLE_LABEL}
            </EuiText>
          )}
        </EuiDescriptionListDescription>
        <EuiDescriptionListTitle>{LAST_RUN_LABEL}</EuiDescriptionListTitle>
        <EuiDescriptionListDescription>
          {latestPing?.['@timestamp'] ? (
            <Time timestamp={latestPing?.['@timestamp']} />
          ) : (
            <EuiText color="subdued">
              {i18n.translate('xpack.synthetics.monitorDetailsPanel.TextLabel', {
                defaultMessage: '--',
              })}
            </EuiText>
          )}
        </EuiDescriptionListDescription>
        {savedMonitor && (
          <>
            <EuiDescriptionListTitle>{LAST_MODIFIED_LABEL}</EuiDescriptionListTitle>
            <EuiDescriptionListDescription>
              <Time timestamp={savedMonitor.updated_at} />
            </EuiDescriptionListDescription>
          </>
        )}
        {savedMonitor?.[ConfigKey.PROJECT_ID] && (
          <>
            <EuiDescriptionListTitle>{PROJECT_ID_LABEL}</EuiDescriptionListTitle>
            <EuiDescriptionListDescription>
              {savedMonitor[ConfigKey.PROJECT_ID]}
            </EuiDescriptionListDescription>
          </>
        )}
        <EuiDescriptionListTitle>{MONITOR_ID_ITEM_TEXT}</EuiDescriptionListTitle>
        <EuiDescriptionListDescription>{monitor.id}</EuiDescriptionListDescription>
        <EuiDescriptionListTitle>{MONITOR_TYPE_LABEL}</EuiDescriptionListTitle>
        <EuiDescriptionListDescription>
          <MonitorTypeBadge monitorType={monitor.type} />
        </EuiDescriptionListDescription>
        {schedule && (
          <>
            <EuiDescriptionListTitle>{FREQUENCY_LABEL}</EuiDescriptionListTitle>
            <EuiDescriptionListDescription>{frequencyStr(schedule)}</EuiDescriptionListDescription>
          </>
        )}

        {!hideLocations && (
          <>
            <EuiDescriptionListTitle>{LOCATIONS_LABEL}</EuiDescriptionListTitle>
            <EuiDescriptionListDescription>
              <LocationsStatus
                configId={configId}
                monitorLocations={monitor.locations}
                spaces={savedMonitor?.[ConfigKey.KIBANA_SPACES]}
              />
            </EuiDescriptionListDescription>
          </>
        )}

        <EuiDescriptionListTitle>{TAGS_LABEL}</EuiDescriptionListTitle>
        <EuiDescriptionListDescription>
          <TagsList tags={monitor[ConfigKey.TAGS]} />
        </EuiDescriptionListDescription>

        {!isEmpty(labels) ? (
          <>
            <EuiDescriptionListTitle>{LABELS_LABEL}</EuiDescriptionListTitle>
            <EuiDescriptionListDescription>
              {Object.entries(labels ?? {}).map(([key, value]) => (
                <div key={key}>
                  <strong>{key}</strong>: {value}
                </div>
              ))}
            </EuiDescriptionListDescription>
          </>
        ) : null}
      </EuiDescriptionList>
    </PanelWithTitle>
  );
};

export function frequencyStr(frequency: { number: string; unit: string }) {
  return translateUnitMessage(
    `${frequency.number} ${unitToString(frequency.unit, parseInt(frequency.number, 10))}`
  );
}

/**
 * Heartbeat doesn't ship a schedule field in pings, but `monitor.timespan`
 * spans exactly one run period (gte = run start, lt = next scheduled run), so
 * `lt - gte` approximates the configured frequency. Used only to display a
 * read-only frequency for external monitors that have no saved object.
 */
export function getScheduleFromTimespan(
  timespan?: Ping['monitor']['timespan']
): { number: string; unit: string } | undefined {
  if (!timespan?.gte || !timespan?.lt) {
    return undefined;
  }
  const seconds = Math.round(
    (new Date(timespan.lt).getTime() - new Date(timespan.gte).getTime()) / 1000
  );
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  if (seconds % 86400 === 0) {
    return { number: String(seconds / 86400), unit: 'd' };
  }
  if (seconds % 3600 === 0) {
    return { number: String(seconds / 3600), unit: 'h' };
  }
  if (seconds % 60 === 0) {
    return { number: String(seconds / 60), unit: 'm' };
  }
  return { number: String(seconds), unit: 's' };
}

function unitToString(unit: string, n: number) {
  switch (unit) {
    case 's':
      return secondsString(n);
    case 'm':
      return minutesString(n);
    case 'h':
      return hoursString(n);
    case 'd':
      return daysString(n);
    default:
      return unit;
  }
}

const secondsString = (n: number) =>
  i18n.translate('xpack.synthetics.monitorDetail.seconds', {
    defaultMessage: '{n, plural, one {second} other {seconds}}',
    values: { n },
  });

const minutesString = (n: number) =>
  i18n.translate('xpack.synthetics.monitorDetail.minutes', {
    defaultMessage: '{n, plural, one {minute} other {minutes}}',
    values: { n },
  });

const hoursString = (n: number) =>
  i18n.translate('xpack.synthetics.monitorDetail.hours', {
    defaultMessage: '{n, plural, one {hour} other {hours}}',
    values: { n },
  });

const daysString = (n: number) =>
  i18n.translate('xpack.synthetics.monitorDetail.days', {
    defaultMessage: '{n, plural, one {day} other {days}}',
    values: { n },
  });

function translateUnitMessage(unitMsg: string) {
  return i18n.translate('xpack.synthetics.monitorList.flyout.unitStr', {
    defaultMessage: 'Every {unitMsg}',
    values: { unitMsg },
    description: 'This displays a message like "Every 10 minutes" or "Every 30 seconds"',
  });
}

const Time = ({ timestamp }: { timestamp?: string }) => {
  const formatter = useDateFormat();
  const dateTimeFormatted = formatter(timestamp);

  return timestamp ? <time dateTime={timestamp}>{dateTimeFormatted}</time> : null;
};

const FREQUENCY_LABEL = i18n.translate('xpack.synthetics.management.monitorList.frequency', {
  defaultMessage: 'Frequency',
});
const LOCATIONS_LABEL = i18n.translate('xpack.synthetics.management.monitorList.locations', {
  defaultMessage: 'Locations',
});

const URL_LABEL = i18n.translate('xpack.synthetics.management.monitorList.url', {
  defaultMessage: 'URL',
});

const TAGS_LABEL = i18n.translate('xpack.synthetics.management.monitorList.tags', {
  defaultMessage: 'Tags',
});

const LABELS_LABEL = i18n.translate('xpack.synthetics.management.monitorList.labels', {
  defaultMessage: 'Labels',
});

const ENABLED_LABEL = i18n.translate('xpack.synthetics.detailsPanel.monitorDetails.enabled', {
  defaultMessage: 'Enabled (all locations)',
});

const MONITOR_TYPE_LABEL = i18n.translate(
  'xpack.synthetics.detailsPanel.monitorDetails.monitorType',
  {
    defaultMessage: 'Monitor type',
  }
);

const MONITOR_DETAILS_LABEL = i18n.translate('xpack.synthetics.detailsPanel.monitorDetails', {
  defaultMessage: 'Monitor details',
});

const LAST_MODIFIED_LABEL = i18n.translate('xpack.synthetics.monitorList.lastModified', {
  defaultMessage: 'Last modified',
});

const LAST_RUN_LABEL = i18n.translate('xpack.synthetics.monitorList.lastRunHeaderText', {
  defaultMessage: 'Last run',
});

const PROJECT_ID_LABEL = i18n.translate('xpack.synthetics.monitorList.projectIdHeaderText', {
  defaultMessage: 'Project ID',
});

const MONITOR_ID_ITEM_TEXT = i18n.translate('xpack.synthetics.monitorList.monitorIdItemText', {
  defaultMessage: 'Monitor ID',
});

const UN_AVAILABLE_LABEL = i18n.translate('xpack.synthetics.monitorList.unAvailable', {
  defaultMessage: '(unavailable)',
});
