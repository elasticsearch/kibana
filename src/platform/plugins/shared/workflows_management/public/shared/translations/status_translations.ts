/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import { ExecutionStatus } from '@kbn/workflows';

export const STATUS_LABELS = {
  [ExecutionStatus.PENDING]: i18n.translate('workflowsManagement.executionStatus.pending', {
    defaultMessage: 'Pending',
  }),
  [ExecutionStatus.QUEUED]: i18n.translate('workflowsManagement.executionStatus.queued', {
    defaultMessage: 'Queued',
  }),
  [ExecutionStatus.WAITING]: i18n.translate('workflowsManagement.executionStatus.waiting', {
    defaultMessage: 'Waiting',
  }),
  [ExecutionStatus.WAITING_FOR_INPUT]: i18n.translate(
    'workflowsManagement.executionStatus.waitingForInput',
    {
      defaultMessage: 'Waiting',
    }
  ),
  [ExecutionStatus.WAITING_FOR_CHILD]: i18n.translate(
    'workflowsManagement.executionStatus.waitingForChild',
    {
      defaultMessage: 'Waiting',
    }
  ),
  [ExecutionStatus.RUNNING]: i18n.translate('workflowsManagement.executionStatus.running', {
    defaultMessage: 'Running',
  }),
  [ExecutionStatus.COMPLETED]: i18n.translate('workflowsManagement.executionStatus.completed', {
    defaultMessage: 'Success',
  }),
  [ExecutionStatus.FAILED]: i18n.translate('workflowsManagement.executionStatus.failed', {
    defaultMessage: 'Error',
  }),
  [ExecutionStatus.CANCELLED]: i18n.translate('workflowsManagement.executionStatus.cancelled', {
    defaultMessage: 'Canceled',
  }),
  [ExecutionStatus.TIMED_OUT]: i18n.translate('workflowsManagement.executionStatus.timedOut', {
    defaultMessage: 'Timed out',
  }),
  [ExecutionStatus.SKIPPED]: i18n.translate('workflowsManagement.executionStatus.skipped', {
    defaultMessage: 'Skipped',
  }),
};

/**
 * Gets the localized label for a given execution status
 */
export function getStatusLabel(status: ExecutionStatus): string {
  return STATUS_LABELS[status];
}
