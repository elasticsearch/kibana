/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowProperties } from '../storage/workflow_storage';

export interface WorkflowDocumentGetOptions {
  includeDeleted?: boolean;
  includeGlobal?: boolean;
}

export interface VersionedWorkflowDocument {
  source: WorkflowProperties;
  seqNo: number;
  primaryTerm: number;
}

export interface IndexWorkflowDocumentOptions {
  create?: boolean;
  ifPrimaryTerm?: number;
  ifSeqNo?: number;
}

export interface WriteWorkflowDocumentWithOccParams {
  document: WorkflowProperties;
  ifSeqNo: number;
  ifPrimaryTerm: number;
}

export interface ReadModifyWriteWorkflowDocumentParams {
  mutate: (existing: WorkflowProperties) => WorkflowProperties;
  maxRetries?: number;
  getOptions?: WorkflowDocumentGetOptions;
}
