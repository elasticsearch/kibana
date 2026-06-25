/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import {
  EuiBasicTable,
  EuiBadge,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { PackQueryFormData, UsePackQueryFormProps } from './queries/use_pack_query_form';
import { OS_LABELS, PLATFORM_IDS, isPlatformId } from './queries/platforms';
import { ExperimentalFeaturesService } from '../common/experimental_features_service';
import { formatQuerySchedule } from './format_query_schedule';

export interface PackQueriesTableProps {
  data: PackQueryFormData[];
  isReadOnly?: boolean;
  onDeleteClick?: (item: PackQueryFormData) => void;
  onEditClick?: (item: PackQueryFormData) => void;
  selectedItems?: PackQueryFormData[];
  setSelectedItems?: (selection: PackQueryFormData[]) => void;
  packSchedule?: UsePackQueryFormProps['packSchedule'];
}

const PackQueriesTableComponent: React.FC<PackQueriesTableProps> = ({
  data,
  isReadOnly,
  onDeleteClick,
  onEditClick,
  selectedItems,
  setSelectedItems,
  packSchedule,
}) => {
  const isRruleSchedulingEnabled = ExperimentalFeaturesService.get().rruleScheduling;

  const renderScheduleColumn = useCallback(
    (_: unknown, item: PackQueryFormData) =>
      formatQuerySchedule(
        item.schedule_type
          ? {
              schedule_type: item.schedule_type,
              interval: item.interval,
              rrule_schedule: item.rrule_schedule,
            }
          : packSchedule ?? { interval: item.interval }
      ),
    [packSchedule]
  );
  const renderDeleteAction = useCallback(
    (item: PackQueryFormData) => (
      <EuiToolTip
        content={i18n.translate('xpack.osquery.pack.queriesTable.deleteActionAriaLabel', {
          defaultMessage: 'Delete {queryName}',
          values: {
            queryName: item.id,
          },
        })}
        disableScreenReaderOutput
      >
        <EuiButtonIcon
          color="danger"
          // eslint-disable-next-line react/jsx-no-bind, react-perf/jsx-no-new-function-as-prop
          onClick={() => onDeleteClick && onDeleteClick(item)}
          iconType="trash"
          aria-label={i18n.translate('xpack.osquery.pack.queriesTable.deleteActionAriaLabel', {
            defaultMessage: 'Delete {queryName}',
            values: {
              queryName: item.id,
            },
          })}
        />
      </EuiToolTip>
    ),
    [onDeleteClick]
  );

  const renderEditAction = useCallback(
    (item: PackQueryFormData) => (
      <EuiToolTip
        content={i18n.translate('xpack.osquery.pack.queriesTable.editActionAriaLabel', {
          defaultMessage: 'Edit {queryName}',
          values: {
            queryName: item.id,
          },
        })}
        disableScreenReaderOutput
      >
        <EuiButtonIcon
          color="primary"
          // eslint-disable-next-line react/jsx-no-bind, react-perf/jsx-no-new-function-as-prop
          onClick={() => onEditClick && onEditClick(item)}
          iconType="pencil"
          aria-label={i18n.translate('xpack.osquery.pack.queriesTable.editActionAriaLabel', {
            defaultMessage: 'Edit {queryName}',
            values: {
              queryName: item.id,
            },
          })}
        />
      </EuiToolTip>
    ),
    [onEditClick]
  );

  const renderPlatformColumn = useCallback((platform: string) => {
    const ids = platform
      ? platform
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [...PLATFORM_IDS];

    return (
      <EuiFlexGroup gutterSize="xs" wrap>
        {ids.map((id) => (
          <EuiFlexItem key={id} grow={false}>
            <EuiBadge color="hollow">{isPlatformId(id) ? OS_LABELS[id] : id}</EuiBadge>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    );
  }, []);

  const renderVersionColumn = useCallback(
    (version: string) =>
      version
        ? `${version}`
        : i18n.translate('xpack.osquery.pack.queriesTable.osqueryVersionAllLabel', {
            defaultMessage: 'ALL',
          }),
    []
  );

  const columns = useMemo(
    () => [
      {
        field: 'id',
        name: i18n.translate('xpack.osquery.pack.queriesTable.idColumnTitle', {
          defaultMessage: 'ID',
        }),
        width: '20%',
      },
      // Flag off: keep the legacy "Interval (s)" column in its original
      // position (right after ID). Flag on: the Schedule column moves to the
      // end (after platform / version).
      ...(!isRruleSchedulingEnabled
        ? [
            {
              field: 'interval',
              name: i18n.translate('xpack.osquery.pack.queriesTable.intervalColumnTitle', {
                defaultMessage: 'Interval (s)',
              }),
              width: '100px',
            },
          ]
        : []),
      {
        field: 'platform',
        name: i18n.translate('xpack.osquery.pack.queriesTable.osColumnTitle', {
          defaultMessage: 'Operating systems',
        }),
        render: renderPlatformColumn,
      },
      {
        field: 'version',
        name: i18n.translate('xpack.osquery.pack.queriesTable.versionColumnTitle', {
          defaultMessage: 'Min Osquery version',
        }),
        render: renderVersionColumn,
      },
      ...(isRruleSchedulingEnabled
        ? [
            {
              field: 'interval',
              name: i18n.translate('xpack.osquery.pack.queriesTable.scheduleColumnTitle', {
                defaultMessage: 'Schedule',
              }),
              render: renderScheduleColumn,
            },
          ]
        : []),
      ...(!isReadOnly
        ? [
            {
              name: i18n.translate('xpack.osquery.pack.queriesTable.actionsColumnTitle', {
                defaultMessage: 'Actions',
              }),
              width: '120px',
              actions: [
                {
                  render: renderEditAction,
                },
                {
                  render: renderDeleteAction,
                },
              ],
            },
          ]
        : []),
    ],
    [
      isReadOnly,
      isRruleSchedulingEnabled,
      renderDeleteAction,
      renderEditAction,
      renderPlatformColumn,
      renderScheduleColumn,
      renderVersionColumn,
    ]
  );

  const sorting = useMemo(
    () => ({
      sort: {
        field: 'id' as keyof PackQueryFormData,
        direction: 'asc' as const,
      },
    }),
    []
  );

  const itemId = useCallback((item: PackQueryFormData) => item.id ?? '', []);

  const selection = useMemo(
    () => ({
      onSelectionChange: setSelectedItems,
      initialSelected: selectedItems,
    }),
    [selectedItems, setSelectedItems]
  );

  return (
    <EuiBasicTable<PackQueryFormData>
      items={data}
      itemId={itemId}
      columns={columns}
      sorting={sorting}
      selection={isReadOnly ? undefined : selection}
      tableCaption={i18n.translate('xpack.osquery.pack.queriesTable.tableCaption', {
        defaultMessage: 'Pack queries',
      })}
    />
  );
};

export const PackQueriesTable = React.memo(PackQueriesTableComponent);
// eslint-disable-next-line import/no-default-export
export default PackQueriesTable;
