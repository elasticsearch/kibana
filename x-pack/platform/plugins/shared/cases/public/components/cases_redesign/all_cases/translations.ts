/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export * from '../../all_cases/translations';

export const VIEW_TOGGLE_LEGEND = i18n.translate('xpack.cases.casesRedesign.viewToggle.legend', {
  defaultMessage: 'View toggle',
});

export const VIEW_TOGGLE_LIST_LABEL = i18n.translate(
  'xpack.cases.casesRedesign.viewToggle.listView',
  {
    defaultMessage: 'List view',
  }
);

export const VIEW_TOGGLE_TABLE_LABEL = i18n.translate(
  'xpack.cases.casesRedesign.viewToggle.tableView',
  {
    defaultMessage: 'Table view',
  }
);

export const COLUMNS_BUTTON_LABEL = i18n.translate(
  'xpack.cases.casesRedesign.tableFilters.columnsButton',
  {
    defaultMessage: 'Columns',
  }
);

export const FIELDS_BUTTON_LABEL = i18n.translate(
  'xpack.cases.casesRedesign.tableFilters.fieldsButton',
  {
    defaultMessage: 'Fields',
  }
);

export const UNKNOWN = i18n.translate('xpack.cases.casesRedesign.listView.unknown', {
  defaultMessage: 'Unknown',
});

export const LIST_REPORTED_BY = i18n.translate('xpack.cases.casesRedesign.listView.reportedBy', {
  defaultMessage: 'Reported by',
});

export const LIST_LAST_UPDATE = i18n.translate('xpack.cases.casesRedesign.listView.lastUpdate', {
  defaultMessage: 'Last update',
});

export const LIST_FIELD_CREATED = i18n.translate(
  'xpack.cases.casesRedesign.listView.fieldCreated',
  {
    defaultMessage: 'Created',
  }
);

export const LIST_FIELD_CLOSED = i18n.translate('xpack.cases.casesRedesign.listView.fieldClosed', {
  defaultMessage: 'Closed',
});

export const LIST_FIELD_COMMENTS = (count: number) =>
  i18n.translate('xpack.cases.casesRedesign.listView.fieldComments', {
    values: { count },
    defaultMessage: '{count} {count, plural, one {comment} other {comments}}',
  });

export const LIST_FIELD_ALERTS = (count: number) =>
  i18n.translate('xpack.cases.casesRedesign.listView.fieldAlerts', {
    values: { count },
    defaultMessage: '{count} {count, plural, one {alert} other {alerts}}',
  });

export const LIST_FIELD_EVENTS = (count: number) =>
  i18n.translate('xpack.cases.casesRedesign.listView.fieldEvents', {
    values: { count },
    defaultMessage: '{count} {count, plural, one {event} other {events}}',
  });

export const SORT_NEWEST_FIRST = i18n.translate(
  'xpack.cases.casesRedesign.tableFilters.newestFirst',
  {
    defaultMessage: 'Newest first',
  }
);

export const SORT_OLDEST_FIRST = i18n.translate(
  'xpack.cases.casesRedesign.tableFilters.oldestFirst',
  {
    defaultMessage: 'Oldest first',
  }
);

export const SHOWING_CASES = (totalRules: number, pageSize: number) =>
  i18n.translate('xpack.cases.casesRedesign.caseTable.showingCasesTitle', {
    values: { totalRules, pageSize },
    defaultMessage: 'Showing {pageSize} of {totalRules}',
  });

export const COLUMNS_POPOVER_ARIA_LABEL = i18n.translate(
  'xpack.cases.casesRedesign.columnsPopover.ariaLabel',
  {
    defaultMessage: 'Columns popover',
  }
);

export const BULK_ACTIONS_POPOVER_ARIA_LABEL = i18n.translate(
  'xpack.cases.casesRedesign.bulkActionsPopover.ariaLabel',
  {
    defaultMessage: 'Bulk actions popover',
  }
);
