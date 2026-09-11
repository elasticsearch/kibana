/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiIconType } from '@elastic/eui/src/components/icon/icon';
import {
  ADD_TO_CASE_ACTION_IDS,
  ADD_TO_CHAT_ACTION_ID,
  ALERT_ASSIGNEE_ACTION_IDS,
  ALERT_EXCEPTION_ACTION_IDS,
  ALERT_TAG_ACTION_ID,
  BULK_ADD_TO_CASE_ACTION_ID,
  BULK_INVESTIGATE_IN_TIMELINE_ACTION_ID,
  EVENT_FILTER_ACTION_ID,
  EXPLORE_ACTION_ID,
  INVESTIGATE_IN_TIMELINE_ACTION_ID,
  ISOLATE_HOST_ACTION_ID,
  OSQUERY_ACTION_ID,
  RESPOND_ACTION_ID,
  RUN_ALERT_WORKFLOW_ACTION_ID,
  RUN_DOCUMENT_WORKFLOW_ACTION_ID,
} from '../constants/action_ids';

/**
 * Single source of truth for the EUI icon to render next to each "Take action" menu item.
 * Keyed on the action item's stable `key` (same as `data-test-subj` for most items).
 * Used by `withActionIcons` to gap-fill missing icons.
 */
export const ACTION_ICONS_BY_ID: Readonly<Record<string, EuiIconType>> = {
  [ADD_TO_CASE_ACTION_IDS.addToCase]: 'briefcase',
  [ADD_TO_CHAT_ACTION_ID]: 'comment',
  [ALERT_ASSIGNEE_ACTION_IDS.assign]: 'users',
  [ALERT_ASSIGNEE_ACTION_IDS.unassignAll]: 'users',
  [ALERT_EXCEPTION_ACTION_IDS.addEndpointException]: 'bullseye',
  [ALERT_EXCEPTION_ACTION_IDS.addRuleException]: 'filter',
  [ALERT_TAG_ACTION_ID]: 'tag',
  [BULK_ADD_TO_CASE_ACTION_ID]: 'briefcase',
  [BULK_INVESTIGATE_IN_TIMELINE_ACTION_ID]: 'timeline',
  [EVENT_FILTER_ACTION_ID]: 'filter',
  [EXPLORE_ACTION_ID]: 'external',
  [INVESTIGATE_IN_TIMELINE_ACTION_ID]: 'timeline',
  [ISOLATE_HOST_ACTION_ID]: 'lock',
  [OSQUERY_ACTION_ID]: 'commandLine',
  [RESPOND_ACTION_ID]: 'bolt',
  [RUN_ALERT_WORKFLOW_ACTION_ID]: 'workflow',
  [RUN_DOCUMENT_WORKFLOW_ACTION_ID]: 'workflow',
};
