/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const TITLE_COLUMN_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.columns.titleLabel',
  { defaultMessage: 'Knowledge Indicator' }
);

export const EVENTS_COLUMN_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.columns.eventsLabel',
  { defaultMessage: 'Events' }
);

export const TYPE_COLUMN_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.columns.typeLabel',
  { defaultMessage: 'Type' }
);

export const MATCH_QUERY_TYPE_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.columns.matchQueryTypeLabel',
  { defaultMessage: 'Match query' }
);

export const STATS_QUERY_TYPE_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.columns.statsQueryTypeLabel',
  { defaultMessage: 'Stats query' }
);

export const STREAM_COLUMN_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.columns.streamLabel',
  { defaultMessage: 'Stream' }
);

export const ACTIONS_COLUMN_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.columns.actionsLabel',
  { defaultMessage: 'Actions' }
);

export const VIEW_DETAILS_ARIA_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.viewDetailsAriaLabel',
  { defaultMessage: 'View details' }
);

export const MINIMIZE_DETAILS_ARIA_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.minimizeDetailsAriaLabel',
  { defaultMessage: 'Collapse details' }
);

export const OCCURRENCES_TOOLTIP_NAME = i18n.translate(
  'xpack.streams.knowledgeIndicators.occurrencesTooltipName',
  { defaultMessage: 'Detected event occurrences' }
);

export const TABLE_CAPTION = i18n.translate('xpack.streams.knowledgeIndicators.tableCaption', {
  defaultMessage: 'Knowledge Indicators table',
});

export const TABLE_LABEL = i18n.translate('xpack.streams.knowledgeIndicators.tableLabel', {
  defaultMessage: 'Knowledge indicators',
});

export const NO_ITEMS_MESSAGE = i18n.translate('xpack.streams.knowledgeIndicators.noItemsMessage', {
  defaultMessage: 'No knowledge indicators found',
});

export const SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.streams.knowledgeIndicators.searchPlaceholder',
  { defaultMessage: 'Search knowledge indicators' }
);

export const SEARCH_ARIA_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.searchAriaLabel',
  { defaultMessage: 'Search knowledge indicators' }
);

export const SHOW_COMPUTED_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.showComputedLabel',
  { defaultMessage: 'Show computed features' }
);

export const CLEAR_SELECTION_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.clearSelectionLabel',
  { defaultMessage: 'Clear selection' }
);

export const DELETE_SELECTED_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.deleteSelectedLabel',
  { defaultMessage: 'Delete selected' }
);

export const EXCLUDE_SELECTED_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.excludeSelectedLabel',
  { defaultMessage: 'Exclude selected' }
);

export const RESTORE_SELECTED_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.restoreSelectedLabel',
  { defaultMessage: 'Restore selected' }
);

export const EMPTY_STATE_TITLE = i18n.translate(
  'xpack.streams.knowledgeIndicators.emptyState.title',
  { defaultMessage: 'Knowledge indicators' }
);

export const EMPTY_STATE_DESCRIPTION = i18n.translate(
  'xpack.streams.knowledgeIndicators.emptyState.description',
  {
    defaultMessage:
      'Facts about your stream automatically extracted from log data to power rule generation. Select streams below and generate knowledge indicators.',
  }
);

export const GENERATION_IN_PROGRESS_TITLE = i18n.translate(
  'xpack.streams.knowledgeIndicators.generationInProgressTitle',
  {
    defaultMessage: 'Generating knowledge indicators...',
  }
);

export const getGenerationInProgressDescription = (streamNames: string[]): string => {
  const count = streamNames.length;
  if (count <= 2) {
    return i18n.translate('xpack.streams.knowledgeIndicators.generationInProgressDescriptionFew', {
      defaultMessage: 'Generation is running for: {streams}. This may take a few minutes.',
      values: { streams: streamNames.join(', ') },
    });
  }
  return i18n.translate('xpack.streams.knowledgeIndicators.generationInProgressDescriptionMany', {
    defaultMessage:
      'Generation is running for {first}, {second} and {remaining} more. This may take a few minutes.',
    values: {
      first: streamNames[0],
      second: streamNames[1],
      remaining: count - 2,
    },
  });
};

export const HIDDEN_COMPUTED_FEATURES_HINT = i18n.translate(
  'xpack.streams.knowledgeIndicators.hiddenComputedFeaturesHint',
  {
    defaultMessage:
      'There are computed features hidden. Enable "Show computed features" to see them.',
  }
);

export const CANNOT_EXCLUDE_SELECTION_TOOLTIP = i18n.translate(
  'xpack.streams.knowledgeIndicators.cannotExcludeSelectionTooltip',
  {
    defaultMessage:
      'Queries and computed features cannot be excluded. Deselect them to enable this action.',
  }
);

export const BULK_EXCLUDE_SUCCESS_TOAST_TITLE = i18n.translate(
  'xpack.streams.knowledgeIndicators.bulkExcludeSuccessToastTitle',
  { defaultMessage: 'Knowledge indicators excluded' }
);

export const BULK_EXCLUDE_PARTIAL_TOAST_TITLE = i18n.translate(
  'xpack.streams.knowledgeIndicators.bulkExcludePartialToastTitle',
  { defaultMessage: 'Some knowledge indicators could not be excluded' }
);

export const BULK_EXCLUDE_ERROR_TOAST_TITLE = i18n.translate(
  'xpack.streams.knowledgeIndicators.bulkExcludeErrorToastTitle',
  { defaultMessage: 'Failed to exclude knowledge indicators' }
);

export const BULK_RESTORE_SUCCESS_TOAST_TITLE = i18n.translate(
  'xpack.streams.knowledgeIndicators.bulkRestoreSuccessToastTitle',
  { defaultMessage: 'Knowledge indicators restored' }
);

export const BULK_RESTORE_PARTIAL_TOAST_TITLE = i18n.translate(
  'xpack.streams.knowledgeIndicators.bulkRestorePartialToastTitle',
  { defaultMessage: 'Some knowledge indicators could not be restored' }
);

export const BULK_RESTORE_ERROR_TOAST_TITLE = i18n.translate(
  'xpack.streams.knowledgeIndicators.bulkRestoreErrorToastTitle',
  { defaultMessage: 'Failed to restore knowledge indicators' }
);

export const DELETE_MODAL_TITLE = (count: number) =>
  i18n.translate('xpack.streams.knowledgeIndicators.deleteModalTitle', {
    defaultMessage:
      'Are you sure you want to delete {count, plural, one {this knowledge indicator} other {these knowledge indicators}}?',
    values: { count },
  });

export const PROMOTE_SELECTED_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.promoteSelectedLabel',
  { defaultMessage: 'Promote selected' }
);

export const BULK_PROMOTE_SUCCESS_TOAST_TITLE = i18n.translate(
  'xpack.streams.knowledgeIndicators.bulkPromoteSuccessToastTitle',
  { defaultMessage: 'Queries promoted' }
);

export const BULK_PROMOTE_ERROR_TITLE = i18n.translate(
  'xpack.streams.knowledgeIndicators.bulkPromoteErrorTitle',
  { defaultMessage: 'Failed to promote selected queries' }
);
