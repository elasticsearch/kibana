/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const ALERTS_V2_PAGE_TITLE = i18n.translate('xpack.securitySolution.alertsV2.pageTitle', {
  defaultMessage: 'Alerts v2',
});

export const ALERTS_V2_TABLE_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.tableAriaLabel',
  { defaultMessage: 'Alerts v2 table' }
);

export const SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.alertsV2.searchPlaceholder',
  { defaultMessage: 'Search by field, e.g. rule.id:abc or data.host.name:server1' }
);

export const FILTER_ACTIVE = i18n.translate('xpack.securitySolution.alertsV2.filter.active', {
  defaultMessage: 'Active',
});

export const FILTER_PENDING = i18n.translate('xpack.securitySolution.alertsV2.filter.pending', {
  defaultMessage: 'Pending',
});

export const FILTER_RECOVERING = i18n.translate(
  'xpack.securitySolution.alertsV2.filter.recovering',
  { defaultMessage: 'Recovering' }
);

export const FILTER_INACTIVE = i18n.translate('xpack.securitySolution.alertsV2.filter.inactive', {
  defaultMessage: 'Inactive',
});

export const COLUMN_TAGS = i18n.translate('xpack.securitySolution.alertsV2.column.tags', {
  defaultMessage: 'Tags',
});

export const COLUMN_ASSIGNEES = i18n.translate('xpack.securitySolution.alertsV2.column.assignees', {
  defaultMessage: 'Assignees',
});

export const COLUMN_STATUS = i18n.translate('xpack.securitySolution.alertsV2.column.status', {
  defaultMessage: 'Status',
});

export const STATUS_OPEN = i18n.translate('xpack.securitySolution.alertsV2.status.open', {
  defaultMessage: 'Open',
});

export const STATUS_ACKNOWLEDGED = i18n.translate(
  'xpack.securitySolution.alertsV2.status.acknowledged',
  { defaultMessage: 'Acknowledged' }
);

export const STATUS_CLOSED = i18n.translate('xpack.securitySolution.alertsV2.status.closed', {
  defaultMessage: 'Closed',
});

export const FLYOUT_TITLE = i18n.translate('xpack.securitySolution.alertsV2.flyout.title', {
  defaultMessage: 'Alert details',
});

export const FLYOUT_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.ariaLabel',
  { defaultMessage: 'Alerts v2 details panel' }
);

export const FLYOUT_RULE_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.ruleLabel',
  { defaultMessage: 'Rule' }
);

export const FLYOUT_STATUS_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.statusLabel',
  { defaultMessage: 'Status' }
);

export const FLYOUT_TRIGGERED_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.triggeredLabel',
  { defaultMessage: 'Triggered' }
);

export const FLYOUT_DURATION_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.durationLabel',
  { defaultMessage: 'Duration' }
);

export const FLYOUT_EVENTS_TITLE = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.eventsTitle',
  { defaultMessage: 'Alert events' }
);

export const FLYOUT_NO_EVENTS = i18n.translate('xpack.securitySolution.alertsV2.flyout.noEvents', {
  defaultMessage: 'No events found for this alert.',
});

export const FLYOUT_ACTIONS_TITLE = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.actionsTitle',
  { defaultMessage: 'Actions' }
);

export const FLYOUT_EPISODE_ID_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.episodeIdLabel',
  { defaultMessage: 'Episode ID' }
);

export const FLYOUT_GROUP_HASH_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.groupHashLabel',
  { defaultMessage: 'Group hash' }
);

export const FLYOUT_GROUPING_FIELDS_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.groupingFieldsLabel',
  { defaultMessage: 'Grouping fields' }
);

export const FLYOUT_ASSIGNEE_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.assigneeLabel',
  { defaultMessage: 'Assignee' }
);

export const FLYOUT_ACTIONS_OVERVIEW_TITLE = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.actionsOverviewTitle',
  { defaultMessage: 'Actions overview' }
);

export const FLYOUT_ACTIONS_OVERVIEW_EMPTY = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.actionsOverviewEmpty',
  { defaultMessage: 'No actions have been taken on this episode yet.' }
);

export const FLYOUT_ACKNOWLEDGED_BY_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.acknowledgedByLabel',
  { defaultMessage: 'Acknowledged by' }
);

export const FLYOUT_RESOLVED_BY_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.resolvedByLabel',
  { defaultMessage: 'Resolved by' }
);

export const FLYOUT_CLOSED_BY_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.closedByLabel',
  { defaultMessage: 'Closed by' }
);

export const FLYOUT_SNOOZED_BY_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.snoozedByLabel',
  { defaultMessage: 'Snoozed by' }
);

export const FLYOUT_SNOOZED_UNTIL_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.snoozedUntilLabel',
  { defaultMessage: 'Snoozed until' }
);

export const FLYOUT_TAGS_LABEL = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.tagsLabel',
  { defaultMessage: 'Tags' }
);

export const FLYOUT_EVENT_COUNT = (count: number) =>
  i18n.translate('xpack.securitySolution.alertsV2.flyout.eventCount', {
    defaultMessage: '{count} {count, plural, one {event} other {events}}',
    values: { count },
  });

export const FLYOUT_JSON_TITLE = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.jsonTitle',
  { defaultMessage: 'JSON' }
);

export const FLYOUT_TAB_OVERVIEW = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.tabOverview',
  { defaultMessage: 'Overview' }
);

export const FLYOUT_TAB_JSON = i18n.translate('xpack.securitySolution.alertsV2.flyout.tabJson', {
  defaultMessage: 'JSON',
});

export const FLYOUT_TAB_EVENTS_LOG = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.tabEventsLog',
  { defaultMessage: 'Events log' }
);

export const FLYOUT_TAB_METADATA = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.tabMetadata',
  { defaultMessage: 'Metadata' }
);

export const FLYOUT_METADATA_EMPTY = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.metadataEmpty',
  { defaultMessage: 'No evaluation data is available for this episode.' }
);

export const FLYOUT_METADATA_ERROR = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.metadataError',
  { defaultMessage: 'Failed to load metadata.' }
);

export const FLYOUT_METADATA_STALE = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.metadataStale',
  {
    defaultMessage: 'Showing data from the last active rule event that matched source data.',
  }
);

export const FLYOUT_EVENTS_LOG_EMPTY = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.eventsLogEmpty',
  { defaultMessage: 'No actions have been recorded for this episode yet.' }
);

export const TAKE_ACTION = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.takeActionButton',
  { defaultMessage: 'Take action' }
);

export const ACTION_ADD_TO_CASE = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.action.addToCase',
  { defaultMessage: 'Add to case' }
);

export const ACTION_MARK_AS_OPEN = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.action.markAsOpen',
  { defaultMessage: 'Mark as open' }
);

export const ACTION_MARK_AS_CLOSED = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.action.markAsClosed',
  { defaultMessage: 'Mark as closed' }
);

export const ACTION_ADD_EXCEPTION = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.action.addException',
  { defaultMessage: 'Add exception' }
);

export const ACTION_RUN_WORKFLOW = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.action.runWorkflow',
  { defaultMessage: 'Run workflow' }
);

export const ACTION_ISOLATE_HOST = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.action.isolateHost',
  { defaultMessage: 'Isolate host' }
);

export const ACTION_RESPOND = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.action.respond',
  { defaultMessage: 'Respond' }
);

export const ACTION_RUN_OSQUERY = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.action.runOsquery',
  { defaultMessage: 'Run Osquery' }
);

export const ACTION_OPEN_IN_DISCOVER = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.action.openInDiscover',
  { defaultMessage: 'Open in Discover' }
);

export const ACTION_INVESTIGATE_IN_TIMELINE = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.action.investigateInTimeline',
  { defaultMessage: 'Investigate in timeline' }
);

export const ACTION_NOT_IMPLEMENTED = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.action.notImplemented',
  { defaultMessage: 'Not yet available for Alerts v2' }
);

export const ACTION_CLOSE_ALERT = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.action.closeAlert',
  { defaultMessage: 'Close alert' }
);

export const ACTION_CLOSE_REASON_TITLE = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.action.closeReasonTitle',
  { defaultMessage: 'Reason for closing' }
);

export const FLYOUT_RAW_EVENT = i18n.translate('xpack.securitySolution.alertsV2.flyout.rawEvent', {
  defaultMessage: 'Show full event',
});

export const FLYOUT_TAB_NOTES = i18n.translate('xpack.securitySolution.alertsV2.flyout.tabNotes', {
  defaultMessage: 'Notes',
});

export const FLYOUT_NO_NOTES = i18n.translate('xpack.securitySolution.alertsV2.flyout.noNotes', {
  defaultMessage: 'No notes have been created for this episode.',
});

export const ACTION_ADD_NOTE = i18n.translate(
  'xpack.securitySolution.alertsV2.flyout.action.addNote',
  { defaultMessage: 'Add note' }
);
