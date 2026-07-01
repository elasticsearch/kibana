/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Kibana internal endpoint that returns the currently authenticated user's profile. */
export const CURRENT_USER_PROFILE_API_PATH = '/internal/security/me';

/** Workflow status values for security alerts. */
export const AlertWorkflowStatus = {
  OPEN: 'open',
  ACKNOWLEDGED: 'acknowledged',
  CLOSED: 'closed',
} as const;

/** data-test-subj for the "Mark as closed" context-menu item inside the status popover. */
export const ALERT_CLOSE_MENU_ITEM_TEST_SUBJ = 'alert-close-context-menu-item';

/** Built-in closing reason options (label shown in the UI + key sent to the API). */
export const ClosingReasonOption = {
  CLOSE_WITHOUT_REASON: { label: 'Close without reason', key: undefined },
  DUPLICATE: { label: 'Duplicate', key: 'duplicate' },
  FALSE_POSITIVE: { label: 'False Positive', key: 'false_positive' },
  TRUE_POSITIVE: { label: 'True positive', key: 'true_positive' },
  BENIGN_POSITIVE: { label: 'Benign positive', key: 'benign_positive' },
  OTHER: { label: 'Other', key: 'other' },
} as const;

/** Returns the success toast message produced when n alerts are closed. */
export const closedAlertsToastText = (count: number): string =>
  `Successfully closed ${count} ${count === 1 ? 'alert' : 'alerts'}.`;

/** Returns the success toast title produced when a value is added to Timeline. */
export const addedToTimelineToastText = (value: string): string => `Added ${value} to Timeline`;
