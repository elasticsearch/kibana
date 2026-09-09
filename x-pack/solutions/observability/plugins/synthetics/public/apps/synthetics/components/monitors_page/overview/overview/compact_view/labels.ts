/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const STATUS = i18n.translate('xpack.synthetics.overview.compactView.monitorStatus', {
  defaultMessage: 'Status',
});

export const NAME = i18n.translate('xpack.synthetics.overview.compactView.monitorName', {
  defaultMessage: 'Name',
});

export const LOCATIONS = i18n.translate('xpack.synthetics.overview.compactView.monitorLocations', {
  defaultMessage: 'Locations',
});

export const TAGS = i18n.translate('xpack.synthetics.overview.compactView.monitorTags', {
  defaultMessage: 'Tags',
});

export const ACTIONS = i18n.translate('xpack.synthetics.overview.compactView.monitorActions', {
  defaultMessage: 'Actions',
});

export const DURATION = i18n.translate('xpack.synthetics.overview.compactView.monitorDuration', {
  defaultMessage: 'Median duration',
});

export const MONITOR_HISTORY = i18n.translate(
  'xpack.synthetics.monitorList.monitorHistoryColumnLabel',
  {
    defaultMessage: 'Downtime history',
  }
);

export const LATEST_ERROR = i18n.translate('xpack.synthetics.overview.compactView.latestError', {
  defaultMessage: 'Latest error',
});

export const NO_ERROR = i18n.translate('xpack.synthetics.overview.compactView.noError', {
  defaultMessage: '—',
});

export const OVERVIEW_TABLE_COLUMN_ID = {
  locations: 'locations',
  latestError: 'latestError',
  tags: 'tags',
  history: 'history',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
} as const;

export const OVERVIEW_DEFAULT_VISIBLE_COLUMN_IDS: string[] = [
  OVERVIEW_TABLE_COLUMN_ID.locations,
  OVERVIEW_TABLE_COLUMN_ID.latestError,
  OVERVIEW_TABLE_COLUMN_ID.tags,
  OVERVIEW_TABLE_COLUMN_ID.history,
  OVERVIEW_TABLE_COLUMN_ID.updatedAt,
];
