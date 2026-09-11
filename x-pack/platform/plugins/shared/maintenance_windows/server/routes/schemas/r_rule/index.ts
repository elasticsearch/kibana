/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { getRRuleRequestSchema, getRRuleResponseSchema } from '@kbn/response-ops-schedule-schema';

export const rRuleRequestSchema = getRRuleRequestSchema({
  meta: { id: 'maintenance_window_r_rule_request' },
  allowLastDayOfMonth: true,
});
export const rRuleResponseSchema = getRRuleResponseSchema({
  meta: { id: 'maintenance_window_r_rule_response' },
});

export const rRuleRequestSchemaV1 = rRuleRequestSchema;
export const rRuleResponseSchemaV1 = rRuleResponseSchema;

export type RRuleRequest = TypeOf<typeof rRuleRequestSchema>;
export type RRuleResponse = TypeOf<typeof rRuleResponseSchema>;
export type RRuleRequestV1 = RRuleRequest;
export type RRuleResponseV1 = RRuleResponse;
