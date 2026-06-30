/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  actionParamsSchema,
  mappedParamsSchema,
  ruleExecutionStatusSchema,
  ruleLastRunSchema,
  monitoringSchema,
  ruleResponseSchema,
  ruleResponseInternalSchema,
  ruleSnoozeScheduleSchema,
  notifyWhenSchema,
  scheduleIdsSchema,
} from './schemas/latest';

export type {
  RuleResponse,
  RuleSnoozeSchedule,
  RuleLastRun,
  Monitoring,
  RuleResponseInternal,
} from './types/latest';

export {
  actionParamsSchema as actionParamsSchemaV1,
  mappedParamsSchema as mappedParamsSchemaV1,
  ruleExecutionStatusSchema as ruleExecutionStatusSchemaV1,
  ruleLastRunSchema as ruleLastRunSchemaV1,
  monitoringSchema as monitoringSchemaV1,
  ruleResponseSchema as ruleResponseSchemaV1,
  ruleResponseInternalSchema as ruleResponseInternalSchemaV1,
  ruleSnoozeScheduleSchema as ruleSnoozeScheduleSchemaV1,
  snoozedAlertInstanceSchema as snoozedAlertInstanceSchemaV1,
  notifyWhenSchema as notifyWhenSchemaV1,
  scheduleIdsSchema as scheduleIdsSchemaV1,
  alertDelaySchema as alertDelaySchemaV1,
  artifactsSchema as artifactsSchemaV1,
} from './schemas/v1';

export type {
  RuleResponse as RuleResponseV1,
  RuleSnoozeSchedule as RuleSnoozeScheduleV1,
  RuleLastRun as RuleLastRunV1,
  Monitoring as MonitoringV1,
  RuleResponseInternal as RuleResponseInternalV1,
} from './types/v1';

export { ruleParamsSchemaV1 } from '@kbn/response-ops-rule-params';
export { ruleParamsSchema } from '@kbn/response-ops-rule-params';

export type { RuleParamsV1 } from '@kbn/response-ops-rule-params';
export type { RuleParams } from '@kbn/response-ops-rule-params';
