/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { TelemetryEvent } from './types';
import { TelemetryEventTypes } from './types';

const searchQuerySubmittedEventType: TelemetryEvent = {
  eventType: TelemetryEventTypes.SEARCH_QUERY_SUBMITTED,
  schema: {
    kueryFields: {
      type: 'array',
      items: {
        type: 'text',
        _meta: {
          description: 'The kuery fields used in the search',
        },
      },
    },
    timerange: {
      type: 'text',
      _meta: {
        description: 'The timerange of the search',
      },
    },
    action: {
      type: 'keyword',
      _meta: {
        description: 'The action performed (e.g., submit, refresh)',
      },
    },
  },
};

const sloOverviewFlyoutViewedEventType: TelemetryEvent = {
  eventType: TelemetryEventTypes.SLO_OVERVIEW_FLYOUT_VIEWED,
  schema: {},
};

const sloOverviewFlyoutSearchQueriedEventType: TelemetryEvent = {
  eventType: TelemetryEventTypes.SLO_OVERVIEW_FLYOUT_SEARCH_QUERIED,
  schema: {
    searchQuery: {
      type: 'keyword',
      _meta: { description: 'The search query entered by the user' },
    },
  },
};

const sloOverviewFlyoutStatusFilteredEventType: TelemetryEvent = {
  eventType: TelemetryEventTypes.SLO_OVERVIEW_FLYOUT_STATUS_FILTERED,
  schema: {
    statuses: {
      type: 'array',
      items: {
        type: 'keyword',
        _meta: {
          description: 'A status filter value (e.g., VIOLATED, DEGRADING, HEALTHY, NO_DATA)',
        },
      },
    },
  },
};

const sloInfoShownEventType: TelemetryEvent = {
  eventType: TelemetryEventTypes.SLO_INFO_SHOWN,
  schema: {},
};

const serviceMapDagreLayoutFallbackEventType: TelemetryEvent = {
  eventType: TelemetryEventTypes.SERVICE_MAP_DAGRE_LAYOUT_FALLBACK,
  schema: {
    error_name: {
      type: 'keyword',
      _meta: {
        description: 'Error constructor name when Dagre.layout throws',
      },
    },
    error_message: {
      type: 'text',
      _meta: {
        description: 'Truncated Error.message from Dagre (no APM graph payload)',
      },
    },
    stack_head: {
      type: 'text',
      _meta: {
        description: 'First stack frames when available; helps map minified chunks to Dagre',
      },
    },
  },
};

const serviceMapAddedToDashboardEventType: TelemetryEvent = {
  eventType: TelemetryEventTypes.SERVICE_MAP_ADDED_TO_DASHBOARD,
  schema: {
    new_dashboard: {
      type: 'boolean',
      _meta: { description: 'True if a new dashboard was created vs adding to existing' },
    },
    has_service_name: {
      type: 'boolean',
      _meta: { description: 'True if a service.name filter was attached' },
    },
    has_kuery: {
      type: 'boolean',
      _meta: { description: 'True if any KQL filter (URL/Controls/pills) was attached' },
    },
    view_filter_count: {
      type: 'integer',
      _meta: { description: 'Number of view-filter chips (alerts/SLO/connection/anomaly)' },
    },
    sync_with_dashboard_filters: {
      type: 'boolean',
      _meta: { description: 'True if the panel follows the dashboard global filters' },
    },
  },
};

const metricsCalloutDateRangeSelectedEventType: TelemetryEvent = {
  eventType: TelemetryEventTypes.METRICS_CALLOUT_DATE_RANGE_SELECTED,
  schema: {
    calloutType: {
      type: 'keyword',
      _meta: {
        description: 'Whether the mixed metrics callout is for overlapping or non-overlapping data',
      },
    },
    selectedInstrumentationType: {
      type: 'keyword',
      _meta: {
        description: 'The instrumentation type selected by the user: classic_apm or otel_native',
      },
    },
  },
};

const metricsCalloutLoadedEventType: TelemetryEvent = {
  eventType: TelemetryEventTypes.METRICS_CALLOUT_LOADED,
  schema: {
    calloutType: {
      type: 'keyword',
      _meta: {
        description: 'Whether the mixed metrics callout is for overlapping or non-overlapping data',
      },
    },
    shownInstrumentationType: {
      type: 'keyword',
      _meta: {
        description: 'The instrumentation type shown by the callout: classic_apm or otel_native',
      },
    },
  },
};

const serviceFlyoutViewedEventType: TelemetryEvent = {
  eventType: TelemetryEventTypes.SERVICE_FLYOUT_VIEWED,
  schema: {
    tabId: {
      type: 'keyword',
      _meta: {
        description: 'The service flyout tab shown when viewed',
      },
    },
    source: {
      type: 'keyword',
      _meta: {
        description: 'Where the flyout was opened from',
      },
    },
  },
};

export const apmTelemetryEventBasedTypes = [
  searchQuerySubmittedEventType,
  sloOverviewFlyoutViewedEventType,
  sloOverviewFlyoutSearchQueriedEventType,
  sloOverviewFlyoutStatusFilteredEventType,
  sloInfoShownEventType,
  serviceMapDagreLayoutFallbackEventType,
  serviceMapAddedToDashboardEventType,
  metricsCalloutDateRangeSelectedEventType,
  metricsCalloutLoadedEventType,
  serviceFlyoutViewedEventType,
];
