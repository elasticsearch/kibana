/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup } from '@kbn/core/public';
import { changeHistoryTelemetryEvents } from './events';

const isEventTypeAlreadyRegisteredError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes('is already registered');

/**
 * Registers all change-history EBT event types from this package.
 *
 * Safe to call from multiple consuming plugins: the first registration wins;
 * subsequent calls skip event types that are already registered in Core analytics.
 *
 * Schemas live entirely in `@kbn/change-history-ui` — consumers must not fork them.
 * Domains are distinguished via `scope` (`module` / `dataset` / `objectType`) on each payload.
 */
export const registerChangeHistoryTelemetryEvents = (
  analytics: Pick<AnalyticsServiceSetup, 'registerEventType'>
): void => {
  for (const eventConfig of changeHistoryTelemetryEvents) {
    try {
      analytics.registerEventType(eventConfig);
    } catch (error) {
      if (!isEventTypeAlreadyRegisteredError(error)) {
        throw error;
      }
    }
  }
};
