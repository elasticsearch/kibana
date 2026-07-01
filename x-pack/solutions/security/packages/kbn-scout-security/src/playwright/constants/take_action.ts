/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Test IDs for the "Take action" menu items in the document flyout.
 *
 * NOTE: The "Mark as closed" menu item test ID is ALERT_CLOSE_MENU_ITEM_TEST_SUBJ
 * in alert_workflows.ts. Closing reason labels live in ClosingReasonOption there too.
 */

/* Case items */

/** data-test-subj for the "Add to new case" Take Action menu item. */
export const ADD_TO_NEW_CASE_TEST_SUBJ = 'add-to-new-case-action' as const;

/* Alert tags */

/** data-test-subj for the "Apply alert tags" Take Action menu item. */
export const ALERT_TAGS_MENU_ITEM_TEST_SUBJ = 'alert-tags-context-menu-item' as const;

/* Investigate in Timeline */

/** data-test-subj for the "Investigate in Timeline" Take Action menu item. */
export const INVESTIGATE_IN_TIMELINE_MENU_ITEM_TEST_SUBJ =
  'investigate-in-timeline-action-item' as const;
