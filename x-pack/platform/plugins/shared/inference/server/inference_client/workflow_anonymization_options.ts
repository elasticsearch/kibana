/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowAnonymizationFailureMode } from '../config';
import type { WorkflowAnonymizationProvider } from '../workflow_anonymization_provider';
import type { PiiRegexWorkerService } from '../workflow_anonymization/detection';

export interface WorkflowAnonymizationOptions {
  readonly provider: WorkflowAnonymizationProvider;
  readonly failureMode: WorkflowAnonymizationFailureMode;
  readonly preLLMTimeoutMs: number;
  /** HMAC server salt derived from xpack.inference.anonymization.encryptionKey. Undefined when the key is not configured; tokens are session-ID-derived only. */
  readonly encryptionKey?: string;
  readonly piiRegexWorker: PiiRegexWorkerService;
}
