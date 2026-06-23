/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export { RESOLVE_ACTION_REASON } from '@kbn/alerting-v2-episodes-ui/components/actions/translations';

export const EPISODES_LIST_PAGE_TITLE = i18n.translate('xpack.alertingV2.episodes.listPageTitle', {
  defaultMessage: 'Alert episodes',
});

export const EPISODES_LIST_MANAGE_RULES = i18n.translate(
  'xpack.alertingV2.episodes.manageRulesButton',
  {
    defaultMessage: 'Manage rules',
  }
);

export const EPISODES_LIST_TABLE_ARIA_LABEL = i18n.translate(
  'xpack.alertingV2.episodes.tableAriaLabel',
  {
    defaultMessage: 'Alerting episodes table',
  }
);

export const EPISODES_LIST_COLUMN_ACTIONS = i18n.translate(
  'xpack.alertingV2.episodes.columns.actions',
  {
    defaultMessage: 'Actions',
  }
);

export const EPISODES_LIST_COLUMN_TAGS = i18n.translate('xpack.alertingV2.episodes.columns.tags', {
  defaultMessage: 'Tags',
});

export const EPISODES_LIST_COLUMN_ASSIGNEES = i18n.translate(
  'xpack.alertingV2.episodes.columns.assignees',
  {
    defaultMessage: 'Assignee',
  }
);

export const EPISODES_LIST_ITEM_COUNT = (count: number) =>
  i18n.translate('xpack.alertingV2.episodes.itemCount', {
    defaultMessage: 'Showing {count, plural, one {# episode} other {# episodes}}',
    values: { count },
  });

export const EPISODES_ASSIGNEE_EMPTY = i18n.translate('xpack.alertingV2.episodes.assignees.empty', {
  defaultMessage: '—',
});

export const EPISODES_ASSIGNEE_PROFILE_LOAD_ERROR = i18n.translate(
  'xpack.alertingV2.episodes.assignees.profileLoadError',
  {
    defaultMessage: 'Could not load profile',
  }
);

export const EPISODES_ASSIGNEE_UNKNOWN_USER = i18n.translate(
  'xpack.alertingV2.episodes.assignees.unknownUser',
  {
    defaultMessage: 'Unknown user',
  }
);

export const EPISODES_FILTER_BAR_RESET_FILTERS = i18n.translate(
  'xpack.alertingV2.episodes.filterBar.resetFilters',
  {
    defaultMessage: 'Reset filters',
  }
);

export const EPISODES_FILTER_BAR_SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.alertingV2.episodes.filterBar.searchPlaceholder',
  {
    defaultMessage: 'Search episodes…',
  }
);

export const BULK_ACKNOWLEDGE = i18n.translate(
  'xpack.alertingV2.episodes.bulkActions.acknowledge',
  { defaultMessage: 'Acknowledge' }
);

export const BULK_UNACKNOWLEDGE = i18n.translate(
  'xpack.alertingV2.episodes.bulkActions.unacknowledge',
  { defaultMessage: 'Unacknowledge' }
);

export const BULK_SNOOZE = i18n.translate('xpack.alertingV2.episodes.bulkActions.snooze', {
  defaultMessage: 'Snooze',
});

export const BULK_UNSNOOZE = i18n.translate('xpack.alertingV2.episodes.bulkActions.unsnooze', {
  defaultMessage: 'Unsnooze',
});

export const BULK_RESOLVE = i18n.translate('xpack.alertingV2.episodes.bulkActions.resolve', {
  defaultMessage: 'Resolve',
});

export const BULK_UNRESOLVE = i18n.translate('xpack.alertingV2.episodes.bulkActions.activate', {
  defaultMessage: 'Unresolve',
});

export const BULK_EDIT_TAGS = i18n.translate('xpack.alertingV2.episodes.bulkActions.editTags', {
  defaultMessage: 'Edit tags',
});

export const BULK_ERROR_TOAST = i18n.translate('xpack.alertingV2.episodes.bulkActions.errorToast', {
  defaultMessage: 'Failed to update episodes',
});

export const getBulkSuccessToast = (count: number) =>
  i18n.translate('xpack.alertingV2.episodes.bulkActions.successToast', {
    defaultMessage: '{count} {count, plural, one {episode} other {episodes}} updated',
    values: { count },
  });

export const getBulkPartialSuccessToast = (processed: number, total: number) =>
  i18n.translate('xpack.alertingV2.episodes.bulkActions.partialSuccessToast', {
    defaultMessage:
      '{processed} of {total} {total, plural, one {episode} other {episodes}} updated',
    values: { processed, total },
  });

export const EPISODES_HISTOGRAM_CAP_WARNING = i18n.translate(
  'xpack.alertingV2.alertEpisodesListPage.episodesHistogram.capWarning',
  {
    defaultMessage: 'Results may be incomplete — too many episodes in this time range.',
  }
);

export const EPISODES_HISTOGRAM_QUERY_ERROR = i18n.translate(
  'xpack.alertingV2.alertEpisodesListPage.episodesHistogram.queryError',
  { defaultMessage: 'Failed to load histogram data.' }
);

export const EPISODES_HISTOGRAM_RETRY = i18n.translate(
  'xpack.alertingV2.alertEpisodesListPage.episodesHistogram.retry',
  { defaultMessage: 'Retry' }
);

export const EPISODES_KPIS_ALERTS_PANEL_TITLE = i18n.translate(
  'xpack.alertingV2.episodes.kpis.alertsPanelTitle',
  { defaultMessage: 'Alerts' }
);

export const EPISODES_KPIS_ALERT_ACTIONS_PANEL_TITLE = i18n.translate(
  'xpack.alertingV2.episodes.kpis.alertActionsPanelTitle',
  { defaultMessage: 'Alert actions' }
);

export const EPISODES_KPIS_ALERTS_COUNT = i18n.translate(
  'xpack.alertingV2.episodes.kpis.alertsCount',
  { defaultMessage: 'Alerts count' }
);

export const EPISODES_KPIS_FIRING_RULES = i18n.translate(
  'xpack.alertingV2.episodes.kpis.firingRules',
  { defaultMessage: 'Firing rules' }
);

export const EPISODES_KPIS_ASSIGNED_TO_ME = i18n.translate(
  'xpack.alertingV2.episodes.kpis.assignedToMe',
  { defaultMessage: 'Assigned to me' }
);

export const EPISODES_KPIS_UNASSIGNED_ALERTS = i18n.translate(
  'xpack.alertingV2.episodes.kpis.unassignedAlerts',
  { defaultMessage: 'Unassigned alerts' }
);

export const EPISODES_KPIS_ACKNOWLEDGED = i18n.translate(
  'xpack.alertingV2.episodes.kpis.acknowledged',
  { defaultMessage: 'Acknowledged' }
);

export const EPISODES_KPIS_SNOOZED = i18n.translate('xpack.alertingV2.episodes.kpis.snoozed', {
  defaultMessage: 'Snoozed',
});

export const EPISODES_KPIS_ERROR_TITLE = i18n.translate(
  'xpack.alertingV2.episodes.kpis.errorTitle',
  {
    defaultMessage: 'Unable to load alert statistics',
  }
);

export const EPISODES_KPIS_ERROR = i18n.translate('xpack.alertingV2.episodes.kpis.error', {
  defaultMessage: 'An error occurred while fetching the alert statistics. Try refreshing the page.',
});
