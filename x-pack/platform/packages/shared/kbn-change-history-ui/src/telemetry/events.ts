/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RootSchema } from '@kbn/core/public';
import { changeHistoryTelemetryEventSchemas } from './schemas';
import type { ChangeHistoryTelemetryEventType, ChangeHistoryTelemetryEventsMap } from './types';

export interface ChangeHistoryTelemetryEvent {
  eventType: ChangeHistoryTelemetryEventType;
  schema: RootSchema<ChangeHistoryTelemetryEventsMap[ChangeHistoryTelemetryEventType]>;
}

type ChangeHistoryTelemetryEventSchemas = {
  [T in ChangeHistoryTelemetryEventType]: RootSchema<ChangeHistoryTelemetryEventsMap[T]>;
};

const eventSchemas: ChangeHistoryTelemetryEventSchemas = changeHistoryTelemetryEventSchemas;

/** EBT event definitions registered via {@link registerChangeHistoryTelemetryEvents}. */
export const changeHistoryTelemetryEvents: ChangeHistoryTelemetryEvent[] = Object.entries(
  eventSchemas
).map(([eventType, schema]) => ({
  eventType: eventType as ChangeHistoryTelemetryEventType,
  schema,
}));
