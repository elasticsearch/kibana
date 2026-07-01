/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { createLeadIndexService, type LeadIndexService } from './indices';
export {
  createLeadDataClient,
  type LeadDataClient,
  type LeadDataClientDeps,
} from './lead_data_client';
export { ObservationModuleRegistry, type ObservationEntity } from './observation_modules';
export { createLeadGenerationEngine } from './engine';
export {
  createRiskScoreModule,
  createTemporalStateModule,
  createBehavioralAnalysisModule,
} from './observation_modules';
export { entityRecordToLeadEntity, fetchCandidateEntities } from './entity_conversion';
export { createLeadGenerationService } from './services/lead_generation_service';
export type {
  Lead,
  LeadEntity,
  LeadGenerationEngineConfig,
  LeadStaleness,
  Observation,
  ObservationModule,
  ObservationModuleConfig,
  ObservationSeverity,
} from './types';
export { DEFAULT_ENGINE_CONFIG, STALENESS_THRESHOLDS_MS, computeStaleness } from './types';
export {
  runLeadGenerationPipeline,
  type RunPipelineParams,
  type RunPipelineResult,
} from './run_pipeline';
export {
  runLeadGenerationInBackground,
  type RunLeadGenerationInBackgroundArgs,
} from './run_background_pipeline';
export {
  registerLeadGenerationTask,
  startLeadGenerationTask,
  removeLeadGenerationTask,
  getLeadGenerationTaskId,
} from './tasks';
