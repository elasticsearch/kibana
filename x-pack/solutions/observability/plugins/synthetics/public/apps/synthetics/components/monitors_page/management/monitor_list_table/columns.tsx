/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';
import { useHistory } from 'react-router-dom';
import { FETCH_STATUS, TagsList } from '@kbn/observability-shared-plugin/public';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { isEmpty } from 'lodash';
import type { ClientPluginsStart } from '../../../../../../plugin';
import { useKibanaSpace } from '../../../../../../hooks/use_kibana_space';
import { getMonitorSpaceToAppend, useEnablement } from '../../../../hooks';
import { useCanEditSynthetics } from '../../../../../../hooks/use_capabilities';
import {
  isStatusEnabled,
  toggleStatusAlert,
} from '../../../../../../../common/runtime_types/monitor_management/alert_config';
import {
  CANNOT_PERFORM_ACTION_SYNTHETICS,
  NoPermissionsTooltip,
} from '../../../common/components/permissions';
import { useMonitorAlertEnable } from '../../../../hooks/use_monitor_alert_enable';
import * as labels from './labels';
import { MonitorDetailsLink } from './monitor_details_link';

import type {
  OverviewStatusState,
  ServiceLocations,
  SyntheticsMonitorSchedule,
} from '../../../../../../../common/runtime_types';
import { ConfigKey } from '../../../../../../../common/runtime_types';

import { MonitorTypeBadge } from '../../../common/components/monitor_type_badge';
import { getFrequencyLabel } from './labels';
import { MonitorEnabled } from './monitor_enabled';
import { MonitorLocations } from './monitor_locations';
import { UnhealthyTooltip } from './unhealthy_tooltip';
import type { MonitorListItem } from './monitor_list';
import type { SelectableTableColumn } from '../../../common/hooks/use_table_column_selector';
import {
  CREATED_COLUMN_LABEL,
  LAST_MODIFIED_COLUMN_LABEL,
  MonitorTimestamp,
} from '../../../common/components/monitor_timestamp';

export const MANAGEMENT_TABLE_COLUMN_ID = {
  type: 'type',
  schedule: 'schedule',
  locations: 'locations',
  tags: 'tags',
  enabled: 'enabled',
  spaces: 'spaces',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
} as const;

export const MANAGEMENT_DEFAULT_VISIBLE_COLUMN_IDS: string[] = [
  MANAGEMENT_TABLE_COLUMN_ID.type,
  MANAGEMENT_TABLE_COLUMN_ID.schedule,
  MANAGEMENT_TABLE_COLUMN_ID.locations,
  MANAGEMENT_TABLE_COLUMN_ID.tags,
  MANAGEMENT_TABLE_COLUMN_ID.enabled,
  MANAGEMENT_TABLE_COLUMN_ID.spaces,
  MANAGEMENT_TABLE_COLUMN_ID.updatedAt,
];

export function useMonitorListColumns({
  loading,
  overviewStatus,
  setMonitorPendingDeletion,
  setMonitorPendingReset,
  isFixableByReset,
}: {
  loading: boolean;
  overviewStatus: OverviewStatusState | null;
  setMonitorPendingDeletion: (configs: string[]) => void;
  setMonitorPendingReset: (val: {
    resetIds: string[];
    skippedMonitors: Array<{ id: string; name: string }>;
  }) => void;
  isFixableByReset: (configId: string) => boolean;
}): Array<SelectableTableColumn<MonitorListItem>> {
  const history = useHistory();
  const { http, spaces } = useKibana<ClientPluginsStart>().services;
  const canEditSynthetics = useCanEditSynthetics();

  const { isServiceAllowed } = useEnablement();
  const { space } = useKibanaSpace();

  const { alertStatus, updateAlertEnabledState } = useMonitorAlertEnable();

  const isActionLoading = (fields: MonitorListItem) => {
    return alertStatus(fields[ConfigKey.CONFIG_ID]) === FETCH_STATUS.LOADING;
  };

  const canUsePublicLocations =
    useKibana().services?.application?.capabilities.uptime.elasticManagedLocationsEnabled ?? true;

  const isPublicLocationsAllowed = (fields: MonitorListItem) => {
    const publicLocations = fields.locations?.some((loc: any) => loc.isServiceManaged);
    return publicLocations ? Boolean(canUsePublicLocations) : true;
  };
  const LazySpaceList = spaces?.ui.components.getSpaceList ?? (() => null);

  const columns: Array<SelectableTableColumn<MonitorListItem>> = [
    {
      align: 'left' as const,
      field: ConfigKey.NAME as string,
      name: i18n.translate('xpack.synthetics.management.monitorList.monitorName', {
        defaultMessage: 'Monitor',
      }),
      sortable: true,
      render: (_: string, monitor: MonitorListItem) => {
        const configId = monitor[ConfigKey.CONFIG_ID];
        return (
          <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
            <EuiFlexItem grow={false}>
              <MonitorDetailsLink monitor={monitor} />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <UnhealthyTooltip configId={configId} />
            </EuiFlexItem>
          </EuiFlexGroup>
        );
      },
    },
    // Only show Project ID column if project monitors are present
    ...(overviewStatus?.projectMonitorsCount ?? 0 > 0
      ? [
          {
            align: 'left' as const,
            field: ConfigKey.PROJECT_ID as string,
            name: i18n.translate('xpack.synthetics.management.monitorList.projectId', {
              defaultMessage: 'Project ID',
            }),
            sortable: true,
            render: (val: string) => val,
          },
        ]
      : []),
    {
      id: MANAGEMENT_TABLE_COLUMN_ID.type,
      align: 'left' as const,
      field: ConfigKey.MONITOR_TYPE,
      name: i18n.translate('xpack.synthetics.management.monitorList.monitorType', {
        defaultMessage: 'Type',
      }),
      sortable: true,
      render: (_: string, monitor: MonitorListItem) => (
        <MonitorTypeBadge
          monitorType={monitor[ConfigKey.MONITOR_TYPE]}
          onClick={() => {
            history.push({
              search: `monitorTypes=${encodeURIComponent(
                JSON.stringify([monitor[ConfigKey.MONITOR_TYPE]])
              )}`,
            });
          }}
        />
      ),
    },
    {
      id: MANAGEMENT_TABLE_COLUMN_ID.schedule,
      align: 'left' as const,
      field: ConfigKey.SCHEDULE,
      sortable: true,
      'data-test-subj': 'syntheticsMonitorListFrequency',
      name: i18n.translate('xpack.synthetics.management.monitorList.frequency', {
        defaultMessage: 'Frequency',
      }),
      render: (schedule: SyntheticsMonitorSchedule) => getFrequencyLabel(schedule),
    },
    {
      id: MANAGEMENT_TABLE_COLUMN_ID.locations,
      align: 'left' as const,
      field: ConfigKey.LOCATIONS,
      'data-test-subj': 'syntheticsMonitorListLocations',
      name: i18n.translate('xpack.synthetics.management.monitorList.locations', {
        defaultMessage: 'Locations',
      }),
      render: (locations: ServiceLocations | string[], monitor: MonitorListItem) =>
        locations ? (
          <MonitorLocations
            configId={monitor[ConfigKey.CONFIG_ID] ?? monitor.id}
            locations={locations as ServiceLocations}
            spaces={monitor.spaces}
          />
        ) : null,
    },
    {
      id: MANAGEMENT_TABLE_COLUMN_ID.tags,
      align: 'left' as const,
      field: ConfigKey.TAGS,
      name: i18n.translate('xpack.synthetics.management.monitorList.tags', {
        defaultMessage: 'Tags',
      }),
      render: (tags: string[]) => (
        <TagsList
          tags={tags ?? []}
          onClick={(tag) => {
            history.push({ search: `tags=${encodeURIComponent(JSON.stringify([tag]))}` });
          }}
        />
      ),
    },
    {
      id: MANAGEMENT_TABLE_COLUMN_ID.enabled,
      align: 'left' as const,
      field: ConfigKey.ENABLED as string,
      sortable: true,
      name: i18n.translate('xpack.synthetics.management.monitorList.enabled', {
        defaultMessage: 'Enabled',
      }),
      render: (_enabled: boolean, monitor: MonitorListItem) => (
        <MonitorEnabled
          configId={monitor[ConfigKey.CONFIG_ID]}
          monitor={monitor}
          reloadPage={() => {}}
          isSwitchable={!loading}
        />
      ),
    },
    {
      id: MANAGEMENT_TABLE_COLUMN_ID.spaces,
      name: i18n.translate('xpack.synthetics.management.monitorList.spacesColumnTitle', {
        defaultMessage: 'Spaces',
      }),
      field: 'spaces',
      sortable: false,
      render: (monSpaces: string[]) => {
        return (
          <LazySpaceList
            namespaces={monSpaces ?? (space ? [space?.id] : [])}
            behaviorContext="outside-space"
          />
        );
      },
    },
    {
      id: MANAGEMENT_TABLE_COLUMN_ID.createdAt,
      align: 'left' as const,
      field: 'created_at',
      sortable: true,
      width: '140px',
      name: CREATED_COLUMN_LABEL,
      render: (createdAt: string) => <MonitorTimestamp timestamp={createdAt} />,
    },
    {
      id: MANAGEMENT_TABLE_COLUMN_ID.updatedAt,
      align: 'left' as const,
      field: 'updated_at',
      sortable: true,
      width: '140px',
      name: LAST_MODIFIED_COLUMN_LABEL,
      render: (updatedAt: string) => <MonitorTimestamp timestamp={updatedAt} />,
    },
    {
      align: 'right' as const,
      name: i18n.translate('xpack.synthetics.management.monitorList.actions', {
        defaultMessage: 'Actions',
      }),
      actions: [
        {
          'data-test-subj': 'syntheticsMonitorEditAction',
          isPrimary: true,
          name: (fields) => (
            <NoPermissionsTooltip
              canEditSynthetics={canEditSynthetics}
              canUsePublicLocations={isPublicLocationsAllowed(fields)}
            >
              <span
                aria-label={i18n.translate('xpack.synthetics.management.monitorList.editLabel', {
                  defaultMessage: 'Edit monitor {monitorName}',
                  values: {
                    monitorName: fields[ConfigKey.NAME],
                  },
                })}
              >
                {labels.EDIT_LABEL}
              </span>
            </NoPermissionsTooltip>
          ),
          description: labels.EDIT_LABEL,
          icon: 'pencil' as const,
          type: 'icon' as const,
          enabled: (fields) =>
            canEditSynthetics &&
            !isActionLoading(fields) &&
            isPublicLocationsAllowed(fields) &&
            isServiceAllowed,
          href: (fields) => {
            const appendSpaceId = getMonitorSpaceToAppend(space, fields.spaces);
            if (!isEmpty(appendSpaceId)) {
              return http?.basePath.prepend(
                `edit-monitor/${fields[ConfigKey.CONFIG_ID]}?spaceId=${fields.spaces?.[0]}`
              )!;
            }
            return http?.basePath.prepend(`edit-monitor/${fields[ConfigKey.CONFIG_ID]}`)!;
          },
        },
        {
          'data-test-subj': 'syntheticsMonitorCopyAction',
          isPrimary: false,
          name: (fields) => (
            <NoPermissionsTooltip
              canEditSynthetics={canEditSynthetics}
              canUsePublicLocations={isPublicLocationsAllowed(fields)}
            >
              <span
                aria-label={i18n.translate('xpack.synthetics.management.monitorList.cloneLabel', {
                  defaultMessage: 'Clone monitor {monitorName}',
                  values: {
                    monitorName: fields[ConfigKey.NAME],
                  },
                })}
              >
                {labels.CLONE_LABEL}
              </span>
            </NoPermissionsTooltip>
          ),
          description: labels.CLONE_LABEL,
          icon: 'copy' as const,
          type: 'icon' as const,
          enabled: (fields) =>
            canEditSynthetics &&
            !isActionLoading(fields) &&
            isPublicLocationsAllowed(fields) &&
            isServiceAllowed,
          href: (fields) => {
            return http?.basePath.prepend(`add-monitor?cloneId=${fields[ConfigKey.CONFIG_ID]}`)!;
          },
        },
        {
          'data-test-subj': 'syntheticsMonitorDeleteAction',
          isPrimary: true,
          name: (fields) => (
            <NoPermissionsTooltip
              canEditSynthetics={canEditSynthetics}
              canUsePublicLocations={isPublicLocationsAllowed(fields)}
            >
              <span
                aria-label={i18n.translate('xpack.synthetics.management.monitorList.deleteLabel', {
                  defaultMessage: 'Delete monitor {monitorName}',
                  values: {
                    monitorName: fields[ConfigKey.NAME],
                  },
                })}
              >
                {labels.DELETE_LABEL}
              </span>
            </NoPermissionsTooltip>
          ),
          description: labels.DELETE_LABEL,
          icon: 'trash' as const,
          type: 'icon' as const,
          color: 'danger' as const,
          enabled: (fields) =>
            canEditSynthetics && !isActionLoading(fields) && isPublicLocationsAllowed(fields),
          onClick: (fields) => {
            setMonitorPendingDeletion([fields[ConfigKey.CONFIG_ID]]);
          },
        },
        {
          'data-test-subj': 'syntheticsMonitorResetAction',
          isPrimary: false,
          name: (fields) => (
            <NoPermissionsTooltip
              canEditSynthetics={canEditSynthetics}
              canUsePublicLocations={isPublicLocationsAllowed(fields)}
            >
              <span
                aria-label={i18n.translate('xpack.synthetics.management.monitorList.resetLabel', {
                  defaultMessage: 'Reset monitor {monitorName}',
                  values: { monitorName: fields[ConfigKey.NAME] },
                })}
              >
                {labels.RESET_LABEL}
              </span>
            </NoPermissionsTooltip>
          ),
          description: labels.RESET_LABEL,
          icon: 'refresh' as const,
          type: 'icon' as const,
          color: 'warning' as const,
          available: (fields) => isFixableByReset(fields[ConfigKey.CONFIG_ID]),
          enabled: (fields) =>
            canEditSynthetics &&
            !isActionLoading(fields) &&
            isServiceAllowed &&
            isPublicLocationsAllowed(fields),
          onClick: (fields) => {
            setMonitorPendingReset({
              resetIds: [fields[ConfigKey.CONFIG_ID]],
              skippedMonitors: [],
            });
          },
        },
        {
          description: labels.DISABLE_STATUS_ALERT,
          name: (fields) => (
            <span
              aria-label={
                isStatusEnabled(fields[ConfigKey.ALERT_CONFIG])
                  ? i18n.translate('xpack.synthetics.management.monitorList.disableAlert', {
                      defaultMessage: 'Disable alert for {monitorName}',
                      values: { monitorName: fields[ConfigKey.NAME] },
                    })
                  : i18n.translate('xpack.synthetics.management.monitorList.enableAlert', {
                      defaultMessage: 'Enable alert for {monitorName}',
                      values: { monitorName: fields[ConfigKey.NAME] },
                    })
              }
            >
              {isStatusEnabled(fields[ConfigKey.ALERT_CONFIG])
                ? labels.DISABLE_STATUS_ALERT
                : labels.ENABLE_STATUS_ALERT}
            </span>
          ),
          icon: (fields) =>
            isStatusEnabled(fields[ConfigKey.ALERT_CONFIG]) ? 'bellSlash' : 'bell',
          type: 'icon' as const,
          color: 'danger' as const,
          enabled: (fields) =>
            canEditSynthetics &&
            !isActionLoading(fields) &&
            isPublicLocationsAllowed(fields) &&
            isServiceAllowed,
          onClick: (fields) => {
            updateAlertEnabledState({
              monitor: {
                [ConfigKey.ALERT_CONFIG]: toggleStatusAlert(fields[ConfigKey.ALERT_CONFIG]),
              },
              name: fields[ConfigKey.NAME],
              configId: fields[ConfigKey.CONFIG_ID],
            });
          },
        },
      ],
    },
  ];

  if (!canEditSynthetics) {
    // replace last column with a tooltip
    columns[columns.length - 1] = {
      align: 'right' as const,
      name: i18n.translate('xpack.synthetics.management.monitorList.actions', {
        defaultMessage: 'Actions',
      }),
      render: () => (
        <NoPermissionsTooltip canEditSynthetics={canEditSynthetics}>
          <EuiToolTip content={CANNOT_PERFORM_ACTION_SYNTHETICS} disableScreenReaderOutput>
            <EuiButtonIcon
              data-test-subj="syntheticsUseMonitorListColumnsButton"
              iconType="boxesVertical"
              isDisabled={true}
              aria-label={CANNOT_PERFORM_ACTION_SYNTHETICS}
            />
          </EuiToolTip>
        </NoPermissionsTooltip>
      ),
    };
  }

  return columns;
}
