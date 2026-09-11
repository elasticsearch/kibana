/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const OPEN_ALERTS = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.openAlertsTitle',
  {
    defaultMessage: 'Open',
  }
);

export const CLOSED_ALERTS = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.closedAlertsTitle',
  {
    defaultMessage: 'Closed',
  }
);

export const ACKNOWLEDGED_ALERTS = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.acknowledgedAlertsTitle',
  {
    defaultMessage: 'Acknowledged',
  }
);

export const TOTAL_COUNT_OF_ALERTS = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.totalCountOfAlertsTitle',
  {
    defaultMessage: 'alerts',
  }
);

export const ALERTS_HEADERS_RULE = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.ruleTitle',
  {
    defaultMessage: 'Rule',
  }
);

export const ALERTS_HEADERS_RULE_NAME = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.ruleNameTitle',
  {
    defaultMessage: 'Rule name',
  }
);

export const ALERTS_HEADERS_RULE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.ruleDescriptionTitle',
  {
    defaultMessage: 'Rule description',
  }
);

export const ALERTS_HEADERS_SEVERITY = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.severityTitle',
  {
    defaultMessage: 'Severity',
  }
);

export const ALERTS_HEADERS_REASON = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.reasonTitle',
  {
    defaultMessage: 'Reason',
  }
);

export const ALERTS_HEADERS_RISK_SCORE = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.riskScoreTitle',
  {
    defaultMessage: 'Risk Score',
  }
);

export const ALERTS_HEADERS_ASSIGNEES = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.assigneesTitle',
  {
    defaultMessage: 'Assignees',
  }
);

export const ALERTS_HEADERS_THRESHOLD_COUNT = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.thresholdCount',
  {
    defaultMessage: 'Event Count',
  }
);

export const ALERTS_HEADERS_THRESHOLD_TERMS = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.thresholdTerms',
  {
    defaultMessage: 'Threshold Terms',
  }
);

export const ALERTS_HEADERS_THRESHOLD_CARDINALITY = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.thresholdCardinality',
  {
    defaultMessage: 'Event Cardinality',
  }
);

export const ALERTS_HEADERS_NEW_TERMS = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.newTerms',
  {
    defaultMessage: 'New Terms',
  }
);

export const ALERTS_HEADERS_NEW_TERMS_FIELDS = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.newTermsFields',
  {
    defaultMessage: 'New Terms fields',
  }
);

export const ALERTS_HEADERS_HOST_RISK_LEVEL = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.hostRiskLevel',
  {
    defaultMessage: 'Host Risk Level',
  }
);

export const ALERTS_HEADERS_USER_RISK_LEVEL = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.userRiskLevel',
  {
    defaultMessage: 'User Risk Level',
  }
);

export const ALERTS_HEADERS_HOST_CRITICALITY = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.hostCriticality',
  {
    defaultMessage: 'Host Criticality',
  }
);

export const ALERTS_HEADERS_SERVICE_RISK_LEVEL = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.serviceRiskLevel',
  {
    defaultMessage: 'Service Risk Level',
  }
);

export const ALERTS_HEADERS_USER_CRITICALITY = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.userCriticality',
  {
    defaultMessage: 'User Criticality',
  }
);

export const ALERTS_HEADERS_SERVICE_CRITICALITY = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.defaultHeaders.serviceCriticality',
  {
    defaultMessage: 'Service Criticality',
  }
);

export const ACTION_INVESTIGATE_IN_TIMELINE = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.actions.investigateInTimelineTitle',
  {
    defaultMessage: 'Investigate in Timeline',
  }
);

export const ACTION_CANNOT_INVESTIGATE_IN_TIMELINE = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.actions.cannotInvestigateInTimelineTitle',
  {
    defaultMessage: 'Please navigate to a page with Timeline to investigate',
  }
);

export const ACTION_INVESTIGATE_IN_TIMELINE_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.actions.investigateInTimelineAriaLabel',
  {
    defaultMessage: 'Send alert to Timeline',
  }
);

export const ACTION_ADD_EXCEPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.actions.addException',
  {
    defaultMessage: 'Add rule exception',
  }
);

export const ACTION_ADD_EVENT_FILTER = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.actions.addEventFilter',
  {
    defaultMessage: 'Add Endpoint event filter',
  }
);

export const ACTION_ADD_EVENT_FILTER_DISABLED_TOOLTIP = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.actions.addEventFilter.disabled.tooltip',
  {
    defaultMessage:
      'Endpoint event filters can be created from the Events section of the Hosts page.',
  }
);

export const ACTION_ADD_ENDPOINT_EXCEPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.actions.addEndpointException',
  {
    defaultMessage: 'Add Endpoint exception',
  }
);

export const MORE_ACTIONS = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.moreActionsAriaLabel',
  {
    defaultMessage: 'More actions',
  }
);

export const CHANGE_ALERT_STATUS = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.overview.changeAlertStatus',
  {
    defaultMessage: 'Change alert status',
  }
);

export const CLICK_TO_CHANGE_ALERT_STATUS = i18n.translate(
  'xpack.securitySolution.eventsViewer.alerts.overview.clickToChangeAlertStatus',
  {
    defaultMessage: 'Click to change alert status',
  }
);

export const INVESTIGATE_BULK_IN_TIMELINE = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.actions.addBulkToTimeline',
  {
    defaultMessage: 'Investigate in Timeline',
  }
);

export const SESSIONS_TITLE = i18n.translate('xpack.securitySolution.sessionsView.sessionsTitle', {
  defaultMessage: 'Sessions',
});

export const STATS_GROUP_ALERTS = i18n.translate(
  'xpack.securitySolution.detectionEngine.groups.stats.alertsCount',
  {
    defaultMessage: 'Alerts:',
  }
);

export const STATS_GROUP_HOSTS = i18n.translate(
  'xpack.securitySolution.detectionEngine.groups.stats.hostsCount',
  {
    defaultMessage: 'Hosts:',
  }
);

export const STATS_GROUP_USERS = i18n.translate(
  'xpack.securitySolution.detectionEngine.groups.stats.usersCount',
  {
    defaultMessage: 'Users:',
  }
);

export const STATS_GROUP_RULES = i18n.translate(
  'xpack.securitySolution.detectionEngine.groups.stats.rulesCount',
  {
    defaultMessage: 'Rules:',
  }
);

export const STATS_GROUP_SEVERITY = i18n.translate(
  'xpack.securitySolution.detectionEngine.groups.stats.severity',
  {
    defaultMessage: 'Severity:',
  }
);

export const STATS_GROUP_SEVERITY_MULTI = i18n.translate(
  'xpack.securitySolution.detectionEngine.groups.stats.severity.multi',
  {
    defaultMessage: 'Multi',
  }
);

export const STATS_GROUP_SEVERITY_LOW = i18n.translate(
  'xpack.securitySolution.detectionEngine.groups.stats.severity.low',
  {
    defaultMessage: 'Low',
  }
);

export const STATS_GROUP_SEVERITY_HIGH = i18n.translate(
  'xpack.securitySolution.detectionEngine.groups.stats.severity.high',
  {
    defaultMessage: 'High',
  }
);

export const STATS_GROUP_SEVERITY_CRITICAL = i18n.translate(
  'xpack.securitySolution.detectionEngine.groups.stats.severity.critical',
  {
    defaultMessage: 'Critical',
  }
);

export const STATS_GROUP_SEVERITY_MEDIUM = i18n.translate(
  'xpack.securitySolution.detectionEngine.groups.stats.severity.medium',
  {
    defaultMessage: 'Medium',
  }
);

export const STATS_GROUP_SEVERITY_UNKNOWN = i18n.translate(
  'xpack.securitySolution.detectionEngine.groups.stats.severity.unknown',
  {
    defaultMessage: 'Unknown',
  }
);

export const INSPECT_GROUPING_TITLE = i18n.translate(
  'xpack.securitySolution.detectionsEngine.grouping.inspectTitle',
  {
    defaultMessage: 'Grouping query',
  }
);

export const EVENT_RENDERED_VIEW_COLUMNS = {
  timestamp: i18n.translate('xpack.securitySolution.EventRenderedView.timestampTitle.column', {
    defaultMessage: 'Timestamp',
  }),
  rule: i18n.translate('xpack.securitySolution.EventRenderedView.ruleTitle.column', {
    defaultMessage: 'Rule',
  }),
  eventSummary: i18n.translate('xpack.securitySolution.EventRenderedView.eventSummary.column', {
    defaultMessage: 'Event Summary',
  }),
};

export const INSUFFICIENT_PRIVILEGES = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.insufficientPrivileges',
  {
    defaultMessage: 'Insufficient privileges',
  }
);

export const REMOTE_DOCUMENT_ACTIONS_UNAVAILABLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.remoteDocumentActionsUnavailable',
  {
    defaultMessage: 'Unavailable for remote documents',
  }
);

export const CONTEXT_MENU_RUN_WORKFLOW = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.workflow.menu.run.workflow',
  {
    defaultMessage: 'Run workflow',
  }
);

export const SELECT_WORKFLOW_PANEL_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.alerts.workflow.select.title',
  {
    defaultMessage: 'Select workflow',
  }
);
