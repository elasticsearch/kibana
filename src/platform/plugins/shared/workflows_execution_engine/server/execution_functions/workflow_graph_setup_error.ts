/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/** Reports a permanent graph or execution-format error after FAILED has been persisted. */
export class WorkflowGraphSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowGraphSetupError';
  }
}

export function isWorkflowGraphSetupError(error: unknown): error is WorkflowGraphSetupError {
  return error instanceof WorkflowGraphSetupError;
}
