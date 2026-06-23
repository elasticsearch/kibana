/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const WORKFLOW_CHANGE_HISTORY_MODULE = 'stack';
export const WORKFLOW_CHANGE_HISTORY_DATASET = 'workflows';
export const WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE = 'workflow';
export const WORKFLOW_CHANGE_HISTORY_SYSTEM_USER = 'elastic/kibana';

export const WorkflowChangeHistoryAction = {
  workflowCreate: 'create',
  workflowUpdate: 'update',
  workflowInstall: 'install',
} as const;

export type WorkflowChangeHistoryActionType =
  (typeof WorkflowChangeHistoryAction)[keyof typeof WorkflowChangeHistoryAction];
