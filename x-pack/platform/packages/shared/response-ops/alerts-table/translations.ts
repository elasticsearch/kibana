/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const FEATURE_LABEL = i18n.translate('responseOpsAlertsTable.feature.label', {
  defaultMessage: 'Feature',
});

export const CASES = i18n.translate('responseOpsAlertsTable.cases.label', {
  defaultMessage: 'Cases',
});

export const MAINTENANCE_WINDOWS = i18n.translate(
  'responseOpsAlertsTable.maintenanceWindows.label',
  {
    defaultMessage: 'Maintenance Windows',
  }
);

export const OBSERVABILITY_DISPLAY_NAME = i18n.translate(
  'responseOpsAlertsTable.sections.alertsTable.observability',
  {
    defaultMessage: 'Observability',
  }
);

export const SECURITY_DISPLAY_NAME = i18n.translate(
  'responseOpsAlertsTable.sections.alertsTable.security',
  {
    defaultMessage: 'Security',
  }
);

export const STACK_DISPLAY_NAME = i18n.translate(
  'responseOpsAlertsTable.sections.alertsTable.stack',
  {
    defaultMessage: 'Stack',
  }
);

export const STACK_MONITORING_DISPLAY_NAME = i18n.translate(
  'responseOpsAlertsTable.sections.alertsTable.stackMonitoring',
  {
    defaultMessage: 'Stack Monitoring',
  }
);

export const UPTIME_DISPLAY_NAME = i18n.translate(
  'responseOpsAlertsTable.sections.alertsTable.uptime',
  {
    defaultMessage: 'Uptime',
  }
);

export const APM_DISPLAY_NAME = i18n.translate('responseOpsAlertsTable.sections.alertsTable.apm', {
  defaultMessage: 'APM',
});

export const INFRASTRUCTURE_DISPLAY_NAME = i18n.translate(
  'responseOpsAlertsTable.sections.alertsTable.infrastructure',
  {
    defaultMessage: 'Infrastructure',
  }
);

export const SLO_DISPLAY_NAME = i18n.translate('responseOpsAlertsTable.sections.alertsTable.slos', {
  defaultMessage: 'SLOs',
});

export const LOGS_DISPLAY_NAME = i18n.translate(
  'responseOpsAlertsTable.sections.alertsTable.logs',
  {
    defaultMessage: 'Logs',
  }
);

export const ML_DISPLAY_NAME = i18n.translate('responseOpsAlertsTable.sections.alertsTable.ml', {
  defaultMessage: 'Machine Learning',
});

export const ALERTS_TABLE_CONF_ERROR_TITLE = i18n.translate(
  'responseOpsAlertsTable.alertsTable.configuration.errorTitle',
  {
    defaultMessage: 'Unable to load alerts table',
  }
);

export const ALERTS_TABLE_CONF_ERROR_MESSAGE = i18n.translate(
  'responseOpsAlertsTable.alertsTable.configuration.errorBody',
  {
    defaultMessage:
      'There was an error loading the alerts table. This table is missing the necessary configuration. Please contact your administrator for help',
  }
);

export const ALERTS_TABLE_CONTROL_COLUMNS_ACTIONS_LABEL = i18n.translate(
  'responseOpsAlertsTable.sections.alertsTable.column.actions',
  {
    defaultMessage: 'Actions',
  }
);

export const ALERTS_TABLE_TITLE = i18n.translate(
  'responseOpsAlertsTable.sections.alertsTable.title',
  {
    defaultMessage: 'Alerts table',
  }
);

export const ALERTS_TABLE_FILTERS_ERROR_TITLE = i18n.translate(
  'responseOpsAlertsTable.alertsTable.filters.errorTitle',
  {
    defaultMessage: 'Unsupported alerts filters set',
  }
);

export const ALERTS_TABLE_UNKNOWN_ERROR_TITLE = i18n.translate(
  'responseOpsAlertsTable.alertsTable.unknownErrorTitle',
  {
    defaultMessage: 'Cannot display alerts',
  }
);

export const ALERTS_TABLE_SHOW_ERROR_DETAILS = i18n.translate(
  'responseOpsAlertsTable.alertsTable.showErrorDetails',
  {
    defaultMessage: 'Show details',
  }
);

export const ALERTS_TABLE_UNKNOWN_ERROR_MESSAGE = i18n.translate(
  'responseOpsAlertsTable.alertsTable.unknownErrorBody',
  {
    defaultMessage: 'An error occurred while rendering the alerts table',
  }
);

export const ALERTS_TABLE_UNKNOWN_ERROR_COPY_TO_CLIPBOARD_LABEL = i18n.translate(
  'responseOpsAlertsTable.alertsTable.unknownErrorCopyToClipboardLabel',
  {
    defaultMessage: 'Copy error to clipboard',
  }
);

export const UPDATING = i18n.translate('responseOpsAlertsTable.alertsTable.lastUpdated.updating', {
  defaultMessage: 'Updating...',
});

export const UPDATED = i18n.translate('responseOpsAlertsTable.alertsTable.lastUpdated.updated', {
  defaultMessage: 'Updated',
});

export const INSPECT = i18n.translate('responseOpsAlertsTable.inspectDescription', {
  defaultMessage: 'Inspect',
});

export const CLOSE = i18n.translate('responseOpsAlertsTable.inspect.modal.closeTitle', {
  defaultMessage: 'Close',
});

export const SOMETHING_WENT_WRONG = i18n.translate(
  'responseOpsAlertsTable.inspect.modal.somethingWentWrongDescription',
  {
    defaultMessage: 'Sorry about that, something went wrong.',
  }
);
export const INDEX_PATTERN = i18n.translate(
  'responseOpsAlertsTable.inspect.modal.indexPatternLabel',
  {
    defaultMessage: 'Index pattern',
  }
);

export const INDEX_PATTERN_DESC = i18n.translate(
  'responseOpsAlertsTable.inspect.modal.indexPatternDescription',
  {
    defaultMessage:
      'The index pattern that connected to the Elasticsearch indices. These indices can be configured in Kibana > Advanced Settings.',
  }
);

export const QUERY_TIME = i18n.translate('responseOpsAlertsTable.inspect.modal.queryTimeLabel', {
  defaultMessage: 'Query time',
});

export const QUERY_TIME_DESC = i18n.translate(
  'responseOpsAlertsTable.inspect.modal.queryTimeDescription',
  {
    defaultMessage:
      'The time it took to process the query. Does not include the time to send the request or parse it in the browser.',
  }
);

export const REQUEST_TIMESTAMP = i18n.translate(
  'responseOpsAlertsTable.inspect.modal.reqTimestampLabel',
  {
    defaultMessage: 'Request timestamp',
  }
);

export const REQUEST_TIMESTAMP_DESC = i18n.translate(
  'responseOpsAlertsTable.inspect.modal.reqTimestampDescription',
  {
    defaultMessage: 'Time when the start of the request has been logged',
  }
);

export const SELECTED_ALERTS = (selectedAlertsFormatted: string, selectedAlerts: number) =>
  i18n.translate('responseOpsAlertsTable.toolbar.bulkActions.selectedAlertsTitle', {
    values: { selectedAlertsFormatted, selectedAlerts },
    defaultMessage:
      'Selected {selectedAlertsFormatted} {selectedAlerts, plural, =1 {alert} other {alerts}}',
  });

export const SELECT_ALL_ALERTS = (totalAlertsFormatted: string, totalAlerts: number) =>
  i18n.translate('responseOpsAlertsTable.toolbar.bulkActions.selectAllAlertsTitle', {
    values: { totalAlertsFormatted, totalAlerts },
    defaultMessage:
      'Select all {totalAlertsFormatted} {totalAlerts, plural, =1 {alert} other {alerts}}',
  });

export const CLEAR_SELECTION = i18n.translate(
  'responseOpsAlertsTable.toolbar.bulkActions.clearSelectionTitle',
  {
    defaultMessage: 'Clear selection',
  }
);

export const COLUMN_HEADER_ARIA_LABEL = i18n.translate(
  'responseOpsAlertsTable.bulkActions.columnHeader.AriaLabel',
  {
    defaultMessage: 'Select all rows',
  }
);

export const SELECT_ROW_ARIA_LABEL = (displayedRowIndex: number) =>
  i18n.translate('responseOpsAlertsTable.bulkActions.selectRowCheckbox.AriaLabel', {
    values: { displayedRowIndex },
    defaultMessage: 'Select row {displayedRowIndex}',
  });

export const ADD_TO_EXISTING_CASE = i18n.translate(
  'xpack.responseOpsAlertsTable.actions.addToCase',
  {
    defaultMessage: 'Add to existing case',
  }
);

export const ADD_TO_CHAT = i18n.translate('xpack.responseOpsAlertsTable.actions.addChat', {
  defaultMessage: 'Add to chat',
});

export const ADD_TO_NEW_CASE = i18n.translate('xpack.responseOpsAlertsTable.actions.addToNewCase', {
  defaultMessage: 'Add to new case',
});

export const NO_ALERTS_ADDED_TO_CASE = i18n.translate(
  'xpack.responseOpsAlertsTable.actions.noAlertsAddedToCaseTitle',
  {
    defaultMessage: 'No alerts added to the case',
  }
);

export const ALERTS_ALREADY_ATTACHED_TO_CASE = i18n.translate(
  'xpack.responseOpsAlertsTable.actions.alertsAlreadyAttachedToCase',
  {
    defaultMessage: 'All selected alerts are already attached to the case',
  }
);

export const MARK_AS_UNTRACKED = i18n.translate(
  'xpack.responseOpsAlertsTable.actions.markAsUntracked',
  {
    defaultMessage: 'Mark as untracked',
  }
);

export const EDIT_TAGS = i18n.translate('xpack.responseOpsAlertsTable.actions.editTags', {
  defaultMessage: 'Edit tags',
});

export const MUTE = i18n.translate('xpack.responseOpsAlertsTable.actions.mute', {
  defaultMessage: 'Mute',
});

export const UNMUTE = i18n.translate('xpack.responseOpsAlertsTable.actions.unmute', {
  defaultMessage: 'Unmute',
});

export const UNSNOOZE = i18n.translate('xpack.responseOpsAlertsTable.actions.unsnooze', {
  defaultMessage: 'Unsnooze',
});

export const MUTE_SELECTED = i18n.translate('xpack.responseOpsAlertsTable.actions.muteSelected', {
  defaultMessage: 'Mute selected',
});

export const UNMUTE_SELECTED = i18n.translate(
  'xpack.responseOpsAlertsTable.actions.unmuteSelected',
  {
    defaultMessage: 'Unmute selected',
  }
);

export const ALERT_FLYOUT_DEFAULT_TITLE = i18n.translate(
  'xpack.responseOpsAlertsTable.alertFlyout.ariaLabelDefault',
  {
    defaultMessage: 'Alert details',
  }
);

export const ALERT_FLYOUT_OVERVIEW_TAB_TITLE = i18n.translate(
  'xpack.responseOpsAlertsTable.alertFlyout.overview',
  {
    defaultMessage: 'Overview',
  }
);

export const ALERT_FLYOUT_TABLE_TAB_TITLE = i18n.translate(
  'xpack.responseOpsAlertsTable.alertFlyout.table',
  {
    defaultMessage: 'Table',
  }
);

export const ALERT_FLYOUT_PAGINATION_ARIA_LABEL = i18n.translate(
  'xpack.responseOpsAlertsTable.alertFlyout.paginationLabel',
  {
    defaultMessage: 'Paginate alerts',
  }
);

export const ACKNOWLEDGE = i18n.translate('xpack.responseOpsAlertsTable.actions.acknowledge', {
  defaultMessage: 'Acknowledge',
});

export const UNACKNOWLEDGE = i18n.translate('xpack.responseOpsAlertsTable.actions.unacknowledge', {
  defaultMessage: 'Unacknowledge',
});

export const ALERT_FLYOUT_ALERT_DETAILS_BUTTON = i18n.translate(
  'xpack.responseOpsAlertsTable.alertFlyout.alertDetailsButton',
  {
    defaultMessage: 'Alert details',
  }
);

export const getAlertFlyoutAriaLabel = (alertDescription: string) =>
  i18n.translate('xpack.responseOpsAlertsTable.alertFlyout.ariaLabel', {
    defaultMessage: 'Details for alert "{alertDescription}"',
    values: { alertDescription },
  });

export const BULK_ACTIONS_ARIA_LABEL = i18n.translate(
  'xpack.triggersActionsUI.alertsTable.bulkActionsAriaLabel',
  {
    defaultMessage: 'Bulk actions',
  }
);
