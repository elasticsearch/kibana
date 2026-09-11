/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import {
  getScheduleRequestSchema,
  getScheduleResponseSchema,
} from '@kbn/response-ops-schedule-schema';

export const scheduleRequestSchema = getScheduleRequestSchema({
  metaId: 'maintenance_window_schedule_request',
  recurringMetaId: 'maintenance_window_schedule_recurring_request',
  allowLastDayOfMonth: true,
});
export const scheduleResponseSchema = getScheduleResponseSchema({
  metaId: 'maintenance_window_schedule_response',
  recurringMetaId: 'maintenance_window_schedule_recurring_response',
  allowLastDayOfMonth: true,
});

export const scheduleRequestSchemaV1 = scheduleRequestSchema;
export const scheduleResponseSchemaV1 = scheduleResponseSchema;

export type ScheduleRequest = TypeOf<typeof scheduleRequestSchema>;
export type ScheduleResponse = TypeOf<typeof scheduleResponseSchema>;
export type ScheduleRequestV1 = ScheduleRequest;
export type ScheduleResponseV1 = ScheduleResponse;
