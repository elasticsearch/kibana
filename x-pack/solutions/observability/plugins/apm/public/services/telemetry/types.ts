/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup, RootSchema } from '@kbn/core/public';
import type { getIngestionPath } from '@kbn/elastic-agent-utils';
export interface TelemetryServiceSetupParams {
  analytics: AnalyticsServiceSetup;
}

export enum SearchQueryActions {
  Submit = 'submit',
  Refresh = 'refresh',
}
export interface SearchQuerySubmittedParams {
  kueryFields: string[];
  timerange: string;
  action: SearchQueryActions;
}

export interface SloOverviewFlyoutSearchQueriedParams {
  searchQuery: string;
}

export interface SloOverviewFlyoutStatusFilteredParams {
  statuses: string[];
}

export interface ServiceMapDagreLayoutFallbackParams {
  /** Error constructor name (e.g. TypeError) */
  error_name: string;
  /** Truncated Error.message from Dagre (no graph / service data) */
  error_message: string;
  /** First stack frames flattened; locates Dagre/minified chunk line for investigation */
  stack_head: string;
}

export interface ServiceMapAddedToDashboardParams {
  /** True when the user opened the "new dashboard" flow vs picking an existing one. */
  new_dashboard: boolean;
  /** True when a service.name filter was attached to the panel state. */
  has_service_name: boolean;
  /** True when a KQL filter was attached (URL kuery + Controls + pills, captured at click time). */
  has_kuery: boolean;
  /** Number of view-filter chips (alerts + SLO + connection + anomaly) attached to the panel state. */
  view_filter_count: number;
  /** True when the new panel is configured to follow the dashboard's global filters. */
  sync_with_dashboard_filters: boolean;
}

export type MetricsCalloutType = 'overlap' | 'non_overlap';

export interface MetricsCalloutDateRangeSelectedParams {
  calloutType: MetricsCalloutType;
  selectedInstrumentationType: ReturnType<typeof getIngestionPath>;
}

export interface MetricsCalloutLoadedParams {
  calloutType: MetricsCalloutType;
  shownInstrumentationType: ReturnType<typeof getIngestionPath>;
}

export interface ServiceFlyoutViewedParams {
  tabId: string;
  source: string;
}

export interface ITelemetryClient {
  reportSearchQuerySubmitted(params: SearchQuerySubmittedParams): void;
  reportSloOverviewFlyoutViewed(): void;
  reportSloOverviewFlyoutSearchQueried(params: SloOverviewFlyoutSearchQueriedParams): void;
  reportSloOverviewFlyoutStatusFiltered(params: SloOverviewFlyoutStatusFilteredParams): void;
  reportSloInfoShown(): void;
  reportServiceMapDagreLayoutFallback(params: ServiceMapDagreLayoutFallbackParams): void;
  reportServiceMapAddedToDashboard(params: ServiceMapAddedToDashboardParams): void;
  reportMetricsCalloutDateRangeSelected(params: MetricsCalloutDateRangeSelectedParams): void;
  reportMetricsCalloutLoaded(params: MetricsCalloutLoadedParams): void;
  reportServiceFlyoutViewed(params: ServiceFlyoutViewedParams): void;
}

export enum TelemetryEventTypes {
  SEARCH_QUERY_SUBMITTED = 'Search Query Submitted',
  SLO_OVERVIEW_FLYOUT_VIEWED = 'slo_overview_flyout_viewed',
  SLO_OVERVIEW_FLYOUT_SEARCH_QUERIED = 'slo_overview_flyout_search_queried',
  SLO_OVERVIEW_FLYOUT_STATUS_FILTERED = 'slo_overview_flyout_status_filtered',
  SLO_INFO_SHOWN = 'slo_info_shown',
  SERVICE_MAP_DAGRE_LAYOUT_FALLBACK = 'service_map_dagre_layout_fallback',
  SERVICE_MAP_ADDED_TO_DASHBOARD = 'service_map_added_to_dashboard',
  METRICS_CALLOUT_DATE_RANGE_SELECTED = 'metrics_callout_date_range_selected',
  METRICS_CALLOUT_LOADED = 'metrics_callout_loaded',
  SERVICE_FLYOUT_VIEWED = 'service_flyout_viewed',
}

export type TelemetryEvent =
  | {
      eventType: TelemetryEventTypes.SEARCH_QUERY_SUBMITTED;
      schema: RootSchema<SearchQuerySubmittedParams>;
    }
  | {
      eventType: TelemetryEventTypes.SLO_OVERVIEW_FLYOUT_VIEWED;
      schema: {};
    }
  | {
      eventType: TelemetryEventTypes.SLO_OVERVIEW_FLYOUT_SEARCH_QUERIED;
      schema: RootSchema<SloOverviewFlyoutSearchQueriedParams>;
    }
  | {
      eventType: TelemetryEventTypes.SLO_OVERVIEW_FLYOUT_STATUS_FILTERED;
      schema: RootSchema<SloOverviewFlyoutStatusFilteredParams>;
    }
  | { eventType: TelemetryEventTypes.SLO_INFO_SHOWN; schema: {} }
  | {
      eventType: TelemetryEventTypes.SERVICE_MAP_DAGRE_LAYOUT_FALLBACK;
      schema: RootSchema<ServiceMapDagreLayoutFallbackParams>;
    }
  | {
      eventType: TelemetryEventTypes.SERVICE_MAP_ADDED_TO_DASHBOARD;
      schema: RootSchema<ServiceMapAddedToDashboardParams>;
    }
  | {
      eventType: TelemetryEventTypes.METRICS_CALLOUT_DATE_RANGE_SELECTED;
      schema: RootSchema<MetricsCalloutDateRangeSelectedParams>;
    }
  | {
      eventType: TelemetryEventTypes.METRICS_CALLOUT_LOADED;
      schema: RootSchema<MetricsCalloutLoadedParams>;
    }
  | {
      eventType: TelemetryEventTypes.SERVICE_FLYOUT_VIEWED;
      schema: RootSchema<ServiceFlyoutViewedParams>;
    };
