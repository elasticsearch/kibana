/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RootSchema } from '@kbn/core/public';
import {
  ChangeHistoryTelemetryEventTypes,
  type ReportChangeHistoryChangeSelectedActionParams,
  type ReportChangeHistoryDiffViewedActionParams,
  type ReportChangeHistoryFilterAppliedActionParams,
  type ReportChangeHistoryOpenedActionParams,
  type ReportChangeHistoryRestoreCompletedActionParams,
  type ReportChangeHistoryRestoreConfirmedActionParams,
  type ReportChangeHistoryRestoreFailedActionParams,
} from './types';

const eventNameSchema: RootSchema<{ eventName: string }> = {
  eventName: {
    type: 'keyword',
    _meta: {
      description: 'Human-readable event label',
      optional: false,
    },
  },
};

const scopeSchema: RootSchema<{ module: string; dataset: string; objectType: string }> = {
  module: {
    type: 'keyword',
    _meta: {
      description: 'Change-history client module (`event.module` in `@kbn/change-history`)',
      optional: false,
    },
  },
  dataset: {
    type: 'keyword',
    _meta: {
      description: 'Change-history client dataset (`event.dataset` in `@kbn/change-history`)',
      optional: false,
    },
  },
  objectType: {
    type: 'keyword',
    _meta: {
      description: 'Tracked entity type (`object.type` / `ObjectChange.objectType`)',
      optional: false,
    },
  },
};

const openedSchema: RootSchema<ReportChangeHistoryOpenedActionParams> = {
  ...eventNameSchema,
  ...scopeSchema,
};

const changeSelectedSchema: RootSchema<ReportChangeHistoryChangeSelectedActionParams> = {
  ...eventNameSchema,
  ...scopeSchema,
  hasSequence: {
    type: 'boolean',
    _meta: {
      description: 'Whether the selected row has `object.sequence`',
      optional: false,
    },
  },
  eventAction: {
    type: 'keyword',
    _meta: {
      description: 'Domain action (`event.action`) when known',
      optional: true,
    },
  },
  selectionSource: {
    type: 'keyword',
    _meta: {
      description: 'How selection happened: user_click or auto_latest',
      optional: false,
    },
  },
};

const filterAppliedSchema: RootSchema<ReportChangeHistoryFilterAppliedActionParams> = {
  ...eventNameSchema,
  ...scopeSchema,
  filterType: {
    type: 'keyword',
    _meta: {
      description: 'Filter dimension applied: timeRange or actor',
      optional: false,
    },
  },
  hasActiveTimeRange: {
    type: 'boolean',
    _meta: {
      description: 'Whether a non-default time range is active after apply',
      optional: true,
    },
  },
  activeActorCount: {
    type: 'integer',
    _meta: {
      description: 'Number of actors selected (0 when cleared)',
      optional: true,
    },
  },
};

const diffViewedSchema: RootSchema<ReportChangeHistoryDiffViewedActionParams> = {
  ...eventNameSchema,
  ...scopeSchema,
  comparisonType: {
    type: 'keyword',
    _meta: {
      description:
        'Compare baseline: vs_current (selected vs live) or vs_previous (selected vs prior row)',
      optional: false,
    },
  },
  versionDistance: {
    type: 'integer',
    _meta: {
      description: 'Absolute difference between baseline and target sequences when both present',
      optional: true,
    },
  },
  compareMode: {
    type: 'keyword',
    _meta: {
      description: 'Diff layout: unified or split',
      optional: true,
    },
  },
  hasSemanticSummary: {
    type: 'boolean',
    _meta: {
      description: 'Whether a structure-aware diff summary is shown',
      optional: true,
    },
  },
};

const restoreSequenceFieldsSchema: RootSchema<{
  restoredFromSequence?: number;
  currentSequence?: number;
  rollbackDistance?: number;
}> = {
  restoredFromSequence: {
    type: 'integer',
    _meta: {
      description: 'Sequence of the version being restored (`object.sequence`)',
      optional: true,
    },
  },
  currentSequence: {
    type: 'integer',
    _meta: {
      description: 'Live sequence before restore',
      optional: true,
    },
  },
  rollbackDistance: {
    type: 'integer',
    _meta: {
      description: 'currentSequence - restoredFromSequence when both present',
      optional: true,
    },
  },
};

const restoreConfirmedSchema: RootSchema<ReportChangeHistoryRestoreConfirmedActionParams> = {
  ...eventNameSchema,
  ...scopeSchema,
  ...restoreSequenceFieldsSchema,
};

const restoreCompletedSchema: RootSchema<ReportChangeHistoryRestoreCompletedActionParams> = {
  ...eventNameSchema,
  ...scopeSchema,
  ...restoreSequenceFieldsSchema,
  durationMs: {
    type: 'integer',
    _meta: {
      description: 'Elapsed time from confirm to restore API success in milliseconds',
      optional: true,
    },
  },
};

const restoreFailedSchema: RootSchema<ReportChangeHistoryRestoreFailedActionParams> = {
  ...eventNameSchema,
  ...scopeSchema,
  ...restoreSequenceFieldsSchema,
  errorCode: {
    type: 'keyword',
    _meta: {
      description: 'Structured error code (e.g. RESTORE_CONFLICT, RESTORE_VALIDATION)',
      optional: true,
    },
  },
};

export const changeHistoryTelemetryEventSchemas = {
  [ChangeHistoryTelemetryEventTypes.Opened]: openedSchema,
  [ChangeHistoryTelemetryEventTypes.ChangeSelected]: changeSelectedSchema,
  [ChangeHistoryTelemetryEventTypes.FilterApplied]: filterAppliedSchema,
  [ChangeHistoryTelemetryEventTypes.DiffViewed]: diffViewedSchema,
  [ChangeHistoryTelemetryEventTypes.RestoreConfirmed]: restoreConfirmedSchema,
  [ChangeHistoryTelemetryEventTypes.RestoreCompleted]: restoreCompletedSchema,
  [ChangeHistoryTelemetryEventTypes.RestoreFailed]: restoreFailedSchema,
};
