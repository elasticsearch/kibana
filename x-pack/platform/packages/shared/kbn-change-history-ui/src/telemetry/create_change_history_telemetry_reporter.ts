/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceStart } from '@kbn/core/public';
import { changeHistoryTelemetryEventNames } from './event_names';
import {
  ChangeHistoryTelemetryEventTypes,
  type ChangeHistoryScope,
  type ChangeHistoryTelemetryChangeSelectedParams,
  type ChangeHistoryTelemetryDiffViewedParams,
  type ChangeHistoryTelemetryFilterAppliedParams,
  type ChangeHistoryTelemetryOpenedParams,
  type ChangeHistoryTelemetryReportParams,
  type ChangeHistoryTelemetryReporter,
  type ChangeHistoryTelemetryRestoreCompletedParams,
  type ChangeHistoryTelemetryRestoreConfirmedParams,
  type ChangeHistoryTelemetryRestoreFailedParams,
  type ChangeHistoryTelemetryScopeFields,
} from './types';

export interface CreateChangeHistoryTelemetryReporterOptions {
  analytics?: Pick<AnalyticsServiceStart, 'reportEvent'>;
  scope: ChangeHistoryScope;
  /** When false, all reports are no-ops. Defaults to true. */
  enabled?: boolean;
}

const noopChangeHistoryTelemetryReporter: ChangeHistoryTelemetryReporter = {
  reportOpened: () => {},
  reportChangeSelected: () => {},
  reportFilterApplied: () => {},
  reportDiffViewed: () => {},
  reportRestoreConfirmed: () => {},
  reportRestoreCompleted: () => {},
  reportRestoreFailed: () => {},
};

export const createChangeHistoryTelemetryReporter = ({
  analytics,
  scope,
  enabled = true,
}: CreateChangeHistoryTelemetryReporterOptions): ChangeHistoryTelemetryReporter => {
  if (!enabled || !analytics?.reportEvent) {
    return noopChangeHistoryTelemetryReporter;
  }

  const scopeFields: ChangeHistoryTelemetryScopeFields = {
    module: scope.module,
    dataset: scope.dataset,
    objectType: scope.objectType,
  };

  const reportEvent = analytics.reportEvent.bind(analytics);

  const report = <TEventType extends ChangeHistoryTelemetryEventTypes>(
    eventType: TEventType,
    params: ChangeHistoryTelemetryReportParams<TEventType>
  ): void => {
    try {
      reportEvent(eventType, {
        eventName: changeHistoryTelemetryEventNames[eventType],
        ...scopeFields,
        ...params,
      });
    } catch {
      // Telemetry must not break product flows.
    }
  };

  return {
    reportOpened: (params: ChangeHistoryTelemetryOpenedParams = {}) => {
      report(ChangeHistoryTelemetryEventTypes.Opened, params);
    },
    reportChangeSelected: (params: ChangeHistoryTelemetryChangeSelectedParams) => {
      report(ChangeHistoryTelemetryEventTypes.ChangeSelected, params);
    },
    reportFilterApplied: (params: ChangeHistoryTelemetryFilterAppliedParams) => {
      report(ChangeHistoryTelemetryEventTypes.FilterApplied, params);
    },
    reportDiffViewed: (params: ChangeHistoryTelemetryDiffViewedParams) => {
      report(ChangeHistoryTelemetryEventTypes.DiffViewed, params);
    },
    reportRestoreConfirmed: (params: ChangeHistoryTelemetryRestoreConfirmedParams = {}) => {
      report(ChangeHistoryTelemetryEventTypes.RestoreConfirmed, params);
    },
    reportRestoreCompleted: (params: ChangeHistoryTelemetryRestoreCompletedParams = {}) => {
      report(ChangeHistoryTelemetryEventTypes.RestoreCompleted, params);
    },
    reportRestoreFailed: (params: ChangeHistoryTelemetryRestoreFailedParams = {}) => {
      report(ChangeHistoryTelemetryEventTypes.RestoreFailed, params);
    },
  };
};
