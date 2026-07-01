/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { detectionSchema, type Detection } from './detections';
export { discoverySchema, type Discovery } from './discoveries';
export type { KnowledgeIndicator } from '../queries';
export {
  SIGNIFICANT_EVENT_STATUS_OPTIONS,
  significantEventSchema,
  significantEventStatusSchema,
  type SignificantEvent,
  type SignificantEventStatus,
} from './events';
export {
  MAX_ID_LENGTH,
  MAX_RULE_NAME_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TEXT_LENGTH,
} from './constants';
export {
  significantEventsTuningConfigSchema,
  type SignificantEventsTuningConfig,
  SIGNIFICANT_EVENTS_TUNING_FIELD_BOUNDS,
  type TuningConfigFieldBounds,
  DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG,
  validateSignificantEventsTuningConfig,
} from './tuning_config';
