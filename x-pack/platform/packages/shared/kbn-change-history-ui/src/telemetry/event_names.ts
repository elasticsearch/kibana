/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ChangeHistoryTelemetryEventTypes } from './types';

/** Human-readable labels merged into EBT payloads at report time. */
export const changeHistoryTelemetryEventNames = {
  [ChangeHistoryTelemetryEventTypes.Opened]: 'Change history opened',
  [ChangeHistoryTelemetryEventTypes.ChangeSelected]: 'Change history change selected',
  [ChangeHistoryTelemetryEventTypes.FilterApplied]: 'Change history filter applied',
  [ChangeHistoryTelemetryEventTypes.DiffViewed]: 'Change history diff viewed',
  [ChangeHistoryTelemetryEventTypes.RestoreConfirmed]: 'Change history restore confirmed',
  [ChangeHistoryTelemetryEventTypes.RestoreCompleted]: 'Change history restore completed',
  [ChangeHistoryTelemetryEventTypes.RestoreFailed]: 'Change history restore failed',
} as const;
