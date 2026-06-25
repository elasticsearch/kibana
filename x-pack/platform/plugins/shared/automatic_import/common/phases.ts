/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const DATA_STREAM_PHASES = {
  analyzingLogs: 'analyzing_logs',
  mappingToEcs: 'mapping_to_ecs',
  buildingPipeline: 'building_pipeline',
  fixingPipeline: 'fixing_pipeline',
  mappingEventFields: 'mapping_event_fields',
  mappingRelatedFields: 'mapping_related_fields',
  reviewing: 'reviewing',
  finalizing: 'finalizing',
} as const;

export type DataStreamPhase = (typeof DATA_STREAM_PHASES)[keyof typeof DATA_STREAM_PHASES];

export const DATA_STREAM_PHASE_ORDER: readonly DataStreamPhase[] = [
  DATA_STREAM_PHASES.analyzingLogs,
  DATA_STREAM_PHASES.mappingToEcs,
  DATA_STREAM_PHASES.buildingPipeline,
  DATA_STREAM_PHASES.reviewing,
  DATA_STREAM_PHASES.fixingPipeline,
  DATA_STREAM_PHASES.mappingEventFields,
  DATA_STREAM_PHASES.mappingRelatedFields,
  DATA_STREAM_PHASES.finalizing,
] as const;

export const getDataStreamPhaseIndex = (phase: DataStreamPhase): number =>
  DATA_STREAM_PHASE_ORDER.indexOf(phase);

export const getDataStreamPhaseProgress = (phase: DataStreamPhase | undefined): number => {
  if (phase == null) {
    return 0;
  }
  const index = getDataStreamPhaseIndex(phase);
  if (index < 0) {
    return 0;
  }
  return index + 1;
};
