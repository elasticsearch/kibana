/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnonymizationRule } from '@kbn/inference-common';
import type { DetectedPiiEntity, PiiTextRecord } from '../workflow_anonymization_capabilities';

export type { DetectedPiiEntity, PiiTextRecord };

export interface PiiDetectionContext {
  detectEntities(options: {
    records: readonly PiiTextRecord[];
    rules: readonly AnonymizationRule[];
    abortSignal?: AbortSignal;
  }): Promise<readonly DetectedPiiEntity[]>;
}
