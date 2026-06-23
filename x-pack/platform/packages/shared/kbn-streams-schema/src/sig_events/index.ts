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
  SIG_EVENT_STATUS_OPTIONS,
  SIG_EVENT_IMPACT_OPTIONS,
  sigEventSchema,
  sigEventStatusSchema,
  sigEventImpactSchema,
  type SigEvent,
  type SigEventStatus,
  type SigEventImpact,
} from './events';
export {
  MAX_ID_LENGTH,
  MAX_RULE_NAME_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TEXT_LENGTH,
} from './constants';
