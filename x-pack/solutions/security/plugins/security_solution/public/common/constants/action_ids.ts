/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Leaf module — no imports. All Security Solution "Take action" menu item keys live here
 * so that consumer files (icon maps, telemetry maps, tests) can import a single tiny module
 * instead of pulling in the hook files that own the business logic.
 *
 * Each hook that originally defined a constant still exports it (importing from here),
 * so existing importers do not need updating until they're ready.
 */

export const ADD_NOTE_ACTION_ID = 'add-note-action' as const;

export const ADD_TO_CASE_ACTION_IDS = {
  addToCase: 'add-to-case-action',
} as const;

export const ADD_TO_CHAT_ACTION_ID = 'add-to-chat-action' as const;

export const ALERT_ASSIGNEE_ACTION_IDS = {
  assign: 'manage-alert-assignees',
  unassignAll: 'remove-all-alert-assignees',
} as const;

export const ALERT_EXCEPTION_ACTION_IDS = {
  addEndpointException: 'add-endpoint-exception-menu-item',
  addRuleException: 'add-exception-menu-item',
} as const;

export const ALERT_STATUS_ACTION_IDS = {
  markAsAcknowledged: 'acknowledge',
  markAsOpen: 'open',
} as const;

/** Key emitted by `useBulkClosingReasonItems` — matches the hardcoded string in that package. */
export const ALERT_CLOSE_WITH_REASON_ACTION_ID = 'close-alert-with-reason' as const;

export const ALERT_TAG_ACTION_ID = 'manage-alert-tags' as const;

export const ATTACK_STATUS_ACTION_IDS = {
  markAsOpen: 'open-attack-status',
  markAsAcknowledged: 'acknowledge-attack-status',
  markAsClosed: 'closed-attack-status',
} as const;

/** Bulk "Add to case" key for the events-table bulk menu. */
export const BULK_ADD_TO_CASE_ACTION_ID = 'attach-case' as const;

export const BULK_INVESTIGATE_IN_TIMELINE_ACTION_ID = 'add-bulk-to-timeline' as const;

export const EVENT_FILTER_ACTION_ID = 'add-event-filter-menu-item' as const;

export const EXPLORE_ACTION_ID = 'explore-action' as const;

export const INVESTIGATE_IN_TIMELINE_ACTION_ID = 'investigate-in-timeline-action-item' as const;

export const ISOLATE_HOST_ACTION_ID = 'isolate-host-action-item' as const;

export const OSQUERY_ACTION_ID = 'osquery-action-item' as const;

export const RESPOND_ACTION_ID = 'endpointResponseActions-action-item' as const;

export const RISK_INPUT_ACTION_IDS = {
  addToNewTimeline: 'add-to-new-timeline',
  addToCase: 'add-to-case',
} as const;

export const RUN_ALERT_WORKFLOW_ACTION_ID = 'run-workflow-action' as const;

export const RUN_DOCUMENT_WORKFLOW_ACTION_ID = 'run-document-workflow-action' as const;
