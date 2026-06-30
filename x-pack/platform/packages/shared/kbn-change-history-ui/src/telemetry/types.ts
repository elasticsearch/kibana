/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type { ChangeHistoryScope } from '../types/change_history_scope';

/** Fields merged into every change-history EBT payload (via reporter or explicit emit). */
export interface ChangeHistoryTelemetryScopeFields {
  module: string;
  dataset: string;
  objectType: string;
}

export enum ChangeHistoryTelemetryEventTypes {
  Opened = 'change_history_opened',
  ChangeSelected = 'change_history_change_selected',
  FilterApplied = 'change_history_filter_applied',
  DiffViewed = 'change_history_diff_viewed',
  RestoreConfirmed = 'change_history_restore_confirmed',
  RestoreCompleted = 'change_history_restore_completed',
  RestoreFailed = 'change_history_restore_failed',
}

export type ChangeHistorySelectionSource = 'user_click' | 'auto_latest';

export type ChangeHistoryFilterType = 'timeRange' | 'actor';

/** Which baseline the diff uses: chronologically previous row or live current version. */
export type ChangeHistoryComparisonType = 'vs_current' | 'vs_previous';

export type ChangeHistoryCompareMode = 'unified' | 'split';

export interface ChangeHistoryTelemetryBaseParams {
  eventName: string;
}

export interface ReportChangeHistoryOpenedActionParams extends ChangeHistoryTelemetryScopeFields {
  eventName: string;
}

export interface ReportChangeHistoryChangeSelectedActionParams
  extends ChangeHistoryTelemetryScopeFields {
  eventName: string;
  hasSequence: boolean;
  eventAction?: string;
  selectionSource: ChangeHistorySelectionSource;
}

export interface ReportChangeHistoryFilterAppliedActionParams
  extends ChangeHistoryTelemetryScopeFields {
  eventName: string;
  filterType: ChangeHistoryFilterType;
  hasActiveTimeRange?: boolean;
  activeActorCount?: number;
}

export interface ReportChangeHistoryDiffViewedActionParams
  extends ChangeHistoryTelemetryScopeFields {
  eventName: string;
  comparisonType: ChangeHistoryComparisonType;
  versionDistance?: number;
  compareMode?: ChangeHistoryCompareMode;
  hasSemanticSummary?: boolean;
}

export interface ReportChangeHistoryRestoreConfirmedActionParams
  extends ChangeHistoryTelemetryScopeFields {
  eventName: string;
  restoredFromSequence?: number;
  currentSequence?: number;
  rollbackDistance?: number;
}

export interface ReportChangeHistoryRestoreCompletedActionParams
  extends ChangeHistoryTelemetryScopeFields {
  eventName: string;
  restoredFromSequence?: number;
  currentSequence?: number;
  rollbackDistance?: number;
  durationMs?: number;
}

export interface ReportChangeHistoryRestoreFailedActionParams
  extends ChangeHistoryTelemetryScopeFields {
  eventName: string;
  restoredFromSequence?: number;
  currentSequence?: number;
  rollbackDistance?: number;
  errorCode?: string;
}

export interface ChangeHistoryTelemetryEventsMap {
  [ChangeHistoryTelemetryEventTypes.Opened]: ReportChangeHistoryOpenedActionParams;
  [ChangeHistoryTelemetryEventTypes.ChangeSelected]: ReportChangeHistoryChangeSelectedActionParams;
  [ChangeHistoryTelemetryEventTypes.FilterApplied]: ReportChangeHistoryFilterAppliedActionParams;
  [ChangeHistoryTelemetryEventTypes.DiffViewed]: ReportChangeHistoryDiffViewedActionParams;
  [ChangeHistoryTelemetryEventTypes.RestoreConfirmed]: ReportChangeHistoryRestoreConfirmedActionParams;
  [ChangeHistoryTelemetryEventTypes.RestoreCompleted]: ReportChangeHistoryRestoreCompletedActionParams;
  [ChangeHistoryTelemetryEventTypes.RestoreFailed]: ReportChangeHistoryRestoreFailedActionParams;
}

export type ChangeHistoryTelemetryEventType =
  (typeof ChangeHistoryTelemetryEventTypes)[keyof typeof ChangeHistoryTelemetryEventTypes];

/** Caller params for a given event — scope and eventName are merged by the reporter. */
export type ChangeHistoryTelemetryReportParams<TEventType extends ChangeHistoryTelemetryEventType> =
  Omit<
    ChangeHistoryTelemetryEventsMap[TEventType],
    keyof ChangeHistoryTelemetryScopeFields | 'eventName'
  >;

/** Caller params — scope and eventName are merged by the reporter. */
export type ChangeHistoryTelemetryOpenedParams =
  ChangeHistoryTelemetryReportParams<ChangeHistoryTelemetryEventTypes.Opened>;

export type ChangeHistoryTelemetryChangeSelectedParams =
  ChangeHistoryTelemetryReportParams<ChangeHistoryTelemetryEventTypes.ChangeSelected>;

export type ChangeHistoryTelemetryFilterAppliedParams =
  ChangeHistoryTelemetryReportParams<ChangeHistoryTelemetryEventTypes.FilterApplied>;

export type ChangeHistoryTelemetryDiffViewedParams =
  ChangeHistoryTelemetryReportParams<ChangeHistoryTelemetryEventTypes.DiffViewed>;

export type ChangeHistoryTelemetryRestoreConfirmedParams =
  ChangeHistoryTelemetryReportParams<ChangeHistoryTelemetryEventTypes.RestoreConfirmed>;

export type ChangeHistoryTelemetryRestoreCompletedParams =
  ChangeHistoryTelemetryReportParams<ChangeHistoryTelemetryEventTypes.RestoreCompleted>;

export type ChangeHistoryTelemetryRestoreFailedParams =
  ChangeHistoryTelemetryReportParams<ChangeHistoryTelemetryEventTypes.RestoreFailed>;

export interface ChangeHistoryTelemetryReporter {
  reportOpened: (params?: ChangeHistoryTelemetryOpenedParams) => void;
  reportChangeSelected: (params: ChangeHistoryTelemetryChangeSelectedParams) => void;
  reportFilterApplied: (params: ChangeHistoryTelemetryFilterAppliedParams) => void;
  reportDiffViewed: (params: ChangeHistoryTelemetryDiffViewedParams) => void;
  reportRestoreConfirmed: (params?: ChangeHistoryTelemetryRestoreConfirmedParams) => void;
  reportRestoreCompleted: (params?: ChangeHistoryTelemetryRestoreCompletedParams) => void;
  reportRestoreFailed: (params?: ChangeHistoryTelemetryRestoreFailedParams) => void;
}
