/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Thrown when workflow version history reads are requested while change-history
 * is disabled (`workflows:versioning:enabled = false`) or not initialized.
 */
export class WorkflowChangeHistoryDisabledError extends Error {
  constructor(message = 'Workflow version history is disabled.') {
    super(message);
    this.name = 'WorkflowChangeHistoryDisabledError';
  }
}
