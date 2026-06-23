/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowProperties } from '../storage/workflow_storage';

export const INITIAL_WORKFLOW_VERSION = 1;

/** Monotonic definition version for the next successful primary write. */
export const getNextWorkflowVersion = (existing?: Pick<WorkflowProperties, 'version'>): number =>
  (existing?.version ?? 0) + 1;

/** Assign the next definition version from fresh primary-index state. */
export const applyWorkflowVersion = (
  document: WorkflowProperties,
  existing?: WorkflowProperties
): WorkflowProperties => ({
  ...document,
  version: getNextWorkflowVersion(existing),
});

/** Bump version only when workflow versioning is enabled; otherwise preserve existing version if present. */
export const maybeApplyWorkflowVersion = (
  document: WorkflowProperties,
  existing: WorkflowProperties | undefined,
  versioningEnabled: boolean
): WorkflowProperties => {
  if (versioningEnabled) {
    return applyWorkflowVersion(document, existing);
  }

  if (existing?.version != null) {
    return { ...document, version: existing.version };
  }

  return document;
};
