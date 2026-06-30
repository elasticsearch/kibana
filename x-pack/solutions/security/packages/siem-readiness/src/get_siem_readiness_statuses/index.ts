/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { getCoverageStatus } from './get_coverage_status';
export { getQualityStatus } from './get_quality_status';
export { getContinuityStatus } from './get_continuity_status';
export { getRetentionStatus } from './get_retention_status';
export {
  isCriticalFailureRate,
  isQualityIncompatible,
  isRetentionNonCompliant,
  hasMissingIntegrations,
} from './status_check_helpers';
export { getContinuityDataFlowHealth } from './get_pipeline_data_flow_health';
export type { PipelineDataFlowHealth } from './get_pipeline_data_flow_health';
