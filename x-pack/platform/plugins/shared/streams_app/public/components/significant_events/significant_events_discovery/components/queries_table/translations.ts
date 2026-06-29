/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const TITLE_COLUMN = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.titleColumn',
  {
    defaultMessage: 'Title',
  }
);

export const STREAM_COLUMN = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.streamColumn',
  {
    defaultMessage: 'Stream',
  }
);

export const IMPACT_COLUMN = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.impactColumn',
  {
    defaultMessage: 'Impact',
  }
);

export const LAST_OCCURRED_COLUMN = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.lastOccurredColumn',
  {
    defaultMessage: 'Last activity',
  }
);

export const OCCURRENCES_COLUMN = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.occurrencesColumn',
  {
    defaultMessage: 'Trend',
  }
);

export const OCCURRENCES_TOOLTIP_NAME = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.occurrencesTooltipName',
  { defaultMessage: 'Occurrences' }
);

export const THRESHOLD_BREACHES_TOOLTIP_NAME = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.thresholdBreachesTooltipName',
  { defaultMessage: 'Threshold breaches' }
);

export const STATS_LAST_OCCURRED_PLACEHOLDER = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.statsLastOccurredPlaceholder',
  { defaultMessage: 'Not monitored yet' }
);

export const SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.searchPlaceholder',
  { defaultMessage: 'Search' }
);

export const CHART_TITLE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.chart.title',
  {
    defaultMessage: 'Detected event occurrences',
  }
);

export const CHART_SERIES_NAME = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.chart.seriesName',
  {
    defaultMessage: 'Occurrences',
  }
);

export const getEventsCount = (count: number) =>
  i18n.translate('xpack.streams.significantEventsDiscovery.queriesTable.eventsCount', {
    defaultMessage: '{count} {count, plural, one {Query} other {Queries}}',
    values: { count },
  });

export const TABLE_CAPTION = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.tableCaption',
  { defaultMessage: 'Queries table' }
);

export const NO_ITEMS_MESSAGE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.noItemsMessage',
  {
    defaultMessage: 'No queries found',
  }
);

export const UNABLE_TO_LOAD_QUERIES_TITLE = i18n.translate(
  'xpack.streams.queriesTable.loadingError.title',
  { defaultMessage: 'Unable to load queries' }
);

export const UNABLE_TO_LOAD_QUERIES_BODY = i18n.translate(
  'xpack.streams.queriesTable.loadingError.body',
  {
    defaultMessage: "Try refreshing the page or contact support if error doesn't go away",
  }
);

export const ACTIONS_COLUMN_TITLE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.actionsColumnTitle',
  { defaultMessage: 'Actions' }
);

export const DETAILS_BUTTON_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.detailsButtonAriaLabel',
  { defaultMessage: 'View details' }
);

export const OPEN_IN_DISCOVER_ACTION_TITLE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.openInDiscoverActionTitle',
  { defaultMessage: 'Open in Discover' }
);

export const OPEN_IN_DISCOVER_ACTION_DESCRIPTION = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.openInDiscoverActionDescription',
  { defaultMessage: 'Open query in Discover' }
);

export const PROMOTE_QUERY_ALREADY_PROMOTED = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.promoteQueryAlreadyPromoted',
  { defaultMessage: 'Query is already promoted' }
);

export const STATS_PROMOTE_DISABLED_TOOLTIP = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.statsPromoteDisabledTooltip',
  { defaultMessage: 'STATS queries cannot be promoted to rules yet' }
);

export const DELETE_QUERY_ERROR_TOAST_TITLE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.deleteQueryErrorToastTitle',
  { defaultMessage: 'Failed to delete query' }
);

export const CLEAR_SELECTION_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.clearSelection',
  { defaultMessage: 'Clear selection' }
);

export const DELETE_SELECTED_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.deleteSelected',
  { defaultMessage: 'Delete selected' }
);

export const getSelectedCountLabel = (count: number) =>
  i18n.translate('xpack.streams.significantEventsDiscovery.queriesTable.selectedCount', {
    defaultMessage: '{count} selected',
    values: { count },
  });

export const DELETE_QUERIES_MODAL_TITLE = (count: number) =>
  i18n.translate('xpack.streams.significantEventsDiscovery.queriesTable.deleteModalTitle', {
    defaultMessage:
      'Are you sure you want to delete {count, plural, one {this rule} other {these rules}}?',
    values: { count },
  });

export const BULK_DEMOTE_SUCCESS_MESSAGE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.bulkDemoteSuccess',
  { defaultMessage: 'Rules removed. Queries preserved on the Knowledge Indicators tab.' }
);

export const BULK_DEMOTE_ERROR_TITLE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.queriesTable.bulkDemoteError',
  { defaultMessage: 'Failed to remove selected rules' }
);
