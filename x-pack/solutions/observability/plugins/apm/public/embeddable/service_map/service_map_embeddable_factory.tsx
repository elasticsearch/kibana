/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { EuiLoadingSpinner } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { DefaultEmbeddableApi } from '@kbn/embeddable-plugin/public';
import type { EmbeddablePublicDefinition } from '@kbn/embeddable-plugin/public';
import type {
  CanExpandPanels,
  HasEditCapabilities,
  PublishesBlockingError,
  PublishesUnifiedSearch,
  ViewMode,
} from '@kbn/presentation-publishing';
import {
  apiCanExpandPanels,
  apiHasParentApi,
  getViewModeSubject,
  initializeStateManager,
  initializeTimeRangeManager,
  initializeTitleManager,
  timeRangeComparators,
  titleComparators,
  useBatchedPublishingSubjects,
  useFetchContext,
  type StateComparators,
  type WithAllKeys,
} from '@kbn/presentation-publishing';
import { initializeStateApi } from '@kbn/presentation-publishing';
import type { AggregateQuery, Filter, Query, TimeRange } from '@kbn/es-query';
import { openLazyFlyout } from '@kbn/presentation-util';
import { BehaviorSubject, combineLatest, map, merge } from 'rxjs';
import { SERVICE_ENVIRONMENT, SERVICE_NAME } from '@kbn/apm-types';
import {
  ENVIRONMENT_ALL,
  ENVIRONMENT_NOT_DEFINED,
} from '../../../common/environment_filter_values';
import type {
  ServiceMapCustomState,
  ServiceMapEmbeddableState,
} from '../../../common/embeddable/service_map_embeddable_schema';

import type { EmbeddableDeps } from '../types';
import { ApmEmbeddableContext } from '../embeddable_context';
import type { ServiceMapViewFilters } from '../../components/app/service_map/apply_service_map_visibility';
import { ServiceMapEmbeddable } from './service_map_embeddable';
import { ServiceMapEditorFlyout } from './service_map_editor_flyout';
import { APM_SERVICE_MAP_EMBEDDABLE } from './constants';

const defaultCustomState: WithAllKeys<ServiceMapCustomState> = {
  environment: ENVIRONMENT_ALL.value,
  kuery: undefined,
  service_name: undefined,
  service_group_id: undefined,
  map_orientation: 'horizontal',
  sync_with_dashboard_filters: false,
  alert_status_filter: undefined,
  slo_status_filter: undefined,
  connection_filter: undefined,
  anomaly_severity_filter: undefined,
};

const customStateComparators: StateComparators<ServiceMapCustomState> = {
  environment: 'referenceEquality',
  kuery: 'referenceEquality',
  service_name: 'referenceEquality',
  service_group_id: 'referenceEquality',
  map_orientation: 'referenceEquality',
  sync_with_dashboard_filters: 'referenceEquality',
  // Fresh arrays on every save would mark the panel dirty even without value changes.
  alert_status_filter: 'deepEquality',
  slo_status_filter: 'deepEquality',
  connection_filter: 'deepEquality',
  anomaly_severity_filter: 'deepEquality',
};

export type ServiceMapEmbeddableApi = DefaultEmbeddableApi<ServiceMapEmbeddableState> &
  HasEditCapabilities &
  PublishesBlockingError &
  PublishesUnifiedSearch & {
    setTimeRange: (timeRange: TimeRange | undefined) => void;
    canEditUnifiedSearch: () => boolean;
  };

function buildFiltersFromState(
  serviceName: string | undefined,
  environment: string | undefined
): Filter[] {
  const filters: Filter[] = [];

  if (serviceName) {
    filters.push({
      meta: { key: SERVICE_NAME, type: 'phrase', params: { query: serviceName } },
      query: { match_phrase: { [SERVICE_NAME]: serviceName } },
    });
  }

  if (environment && environment !== ENVIRONMENT_ALL.value) {
    if (environment === ENVIRONMENT_NOT_DEFINED.value) {
      filters.push({
        meta: { key: SERVICE_ENVIRONMENT, type: 'exists', negate: true },
        query: { exists: { field: SERVICE_ENVIRONMENT } },
      });
    } else {
      filters.push({
        meta: { key: SERVICE_ENVIRONMENT, type: 'phrase', params: { query: environment } },
        query: { match_phrase: { [SERVICE_ENVIRONMENT]: environment } },
      });
    }
  }

  return filters;
}

function buildQueryFromKuery(kuery: string | undefined): Query | undefined {
  const trimmed = (kuery ?? '').trim();
  if (!trimmed) {
    return undefined;
  }
  return { query: trimmed, language: 'kuery' };
}

const NO_EXPANDED_PANEL$ = new BehaviorSubject<string | undefined>(undefined);
const DEFAULT_VIEW_MODE$ = new BehaviorSubject<ViewMode>('view');

export const getServiceMapEmbeddableFactory = (deps: EmbeddableDeps) => {
  const factory: EmbeddablePublicDefinition<ServiceMapEmbeddableState, ServiceMapEmbeddableApi> = {
    type: APM_SERVICE_MAP_EMBEDDABLE,
    buildEmbeddable: async ({ initialState, finalizeApi, uuid, parentApi }) => {
      const { coreStart } = deps;
      const state = initialState;

      const titleManager = initializeTitleManager(state);
      const timeRangeManager = initializeTimeRangeManager({
        time_range: state.time_range,
      });

      const customStateManager = initializeStateManager<ServiceMapCustomState>(
        {
          environment: state.environment,
          kuery: state.kuery,
          service_name: state.service_name,
          service_group_id: state.service_group_id,
          map_orientation: state.map_orientation,
          sync_with_dashboard_filters: state.sync_with_dashboard_filters,
          alert_status_filter: state.alert_status_filter,
          slo_status_filter: state.slo_status_filter,
          connection_filter: state.connection_filter,
          anomaly_severity_filter: state.anomaly_severity_filter,
        },
        defaultCustomState
      );

      const query$ = new BehaviorSubject<Query | AggregateQuery | undefined>(
        buildQueryFromKuery(state.kuery)
      );
      const filters$ = new BehaviorSubject<Filter[] | undefined>(
        buildFiltersFromState(state.service_name, state.environment)
      );
      const blockingError$ = new BehaviorSubject<Error | undefined>(undefined);

      const stateApi = initializeStateApi<ServiceMapEmbeddableState>({
        parentApi,
        uuid,
        serializeState: () => ({
          ...titleManager.getLatestState(),
          ...timeRangeManager.getLatestState(),
          ...customStateManager.getLatestState(),
        }),
        anyStateChange$: merge(
          titleManager.anyStateChange$,
          timeRangeManager.anyStateChange$,
          customStateManager.anyStateChange$
        ).pipe(map(() => undefined)),
        getComparators: () => ({
          ...titleComparators,
          ...timeRangeComparators,
          ...customStateComparators,
        }),
        applySerializedState: (nextState) => {
          titleManager.reinitializeState(nextState);
          timeRangeManager.reinitializeState({ time_range: nextState.time_range });
          customStateManager.reinitializeState(nextState);
        },
      });

      const api = finalizeApi({
        ...titleManager.api,
        ...timeRangeManager.api,
        ...stateApi,
        blockingError$,
        filters$,
        query$,
        canEditUnifiedSearch: () => true,
        getTypeDisplayName: () =>
          i18n.translate('xpack.apm.serviceMap.embeddable.typeDisplayName', {
            defaultMessage: 'configuration',
          }),
        isEditingEnabled: () => true,
        onEdit: async () => {
          openLazyFlyout({
            core: coreStart,
            parentApi,
            flyoutProps: {
              size: 'm',
              'data-test-subj': 'apmServiceMapEditorFlyout',
              focusedPanelId: uuid,
            },
            loadContent: async ({ closeFlyout, ariaLabelledBy }) => {
              const editorInitialState = stateApi.serializeState();
              const applyCustomState = (newState: ServiceMapEmbeddableState) => {
                if (newState.environment !== undefined) {
                  customStateManager.api.setEnvironment(newState.environment);
                }
                customStateManager.api.setKuery(newState.kuery);
                customStateManager.api.setServiceName(newState.service_name);
                customStateManager.api.setMapOrientation(newState.map_orientation);
                customStateManager.api.setSyncWithDashboardFilters(
                  newState.sync_with_dashboard_filters
                );
                customStateManager.api.setAlertStatusFilter(newState.alert_status_filter);
                customStateManager.api.setSloStatusFilter(newState.slo_status_filter);
                customStateManager.api.setConnectionFilter(newState.connection_filter);
                customStateManager.api.setAnomalySeverityFilter(newState.anomaly_severity_filter);
              };
              return (
                <ApmEmbeddableContext deps={deps}>
                  <ServiceMapEditorFlyout
                    ariaLabelledBy={ariaLabelledBy}
                    deps={deps}
                    timeRange={timeRangeManager.api.timeRange$.getValue()}
                    initialState={editorInitialState}
                    onCancel={closeFlyout}
                    onPreview={applyCustomState}
                    onRevert={() => stateApi.applySerializedState(editorInitialState)}
                    onSave={(newState: ServiceMapEmbeddableState) => {
                      applyCustomState(newState);
                      closeFlyout();
                    }}
                  />
                </ApmEmbeddableContext>
              );
            },
          });
        },
      });

      // Precompute stable subject references for panel-maximized and view-mode detection.
      const expandedPanelIdSubject =
        apiHasParentApi(api) && apiCanExpandPanels(api.parentApi)
          ? (api.parentApi as CanExpandPanels).expandedPanelId$
          : NO_EXPANDED_PANEL$;
      const viewModeSubject = getViewModeSubject(api.parentApi) ?? DEFAULT_VIEW_MODE$;

      return {
        api,
        Component: () => {
          useEffect(() => {
            const filtersSubscription = combineLatest([
              customStateManager.api.serviceName$,
              customStateManager.api.environment$,
            ]).subscribe(([sn, env]) => {
              filters$.next(buildFiltersFromState(sn, env));
            });
            const querySubscription = customStateManager.api.kuery$.subscribe((k) => {
              query$.next(buildQueryFromKuery(k));
            });
            return () => {
              filtersSubscription.unsubscribe();
              querySubscription.unsubscribe();
            };
          }, []);

          const [
            environment,
            kuery,
            serviceName,
            serviceGroupId,
            mapOrientation,
            syncWithDashboardFilters,
            alertStatusFilter,
            sloStatusFilter,
            connectionFilter,
            anomalySeverityFilter,
          ] = useBatchedPublishingSubjects(
            customStateManager.api.environment$,
            customStateManager.api.kuery$,
            customStateManager.api.serviceName$,
            customStateManager.api.serviceGroupId$,
            customStateManager.api.mapOrientation$,
            customStateManager.api.syncWithDashboardFilters$,
            customStateManager.api.alertStatusFilter$,
            customStateManager.api.sloStatusFilter$,
            customStateManager.api.connectionFilter$,
            customStateManager.api.anomalySeverityFilter$
          );

          const [showEmbeddedControls, setShowEmbeddedControls] = useState(
            () =>
              expandedPanelIdSubject.getValue() === uuid && viewModeSubject.getValue() !== 'edit'
          );

          useEffect(() => {
            const sub = combineLatest([expandedPanelIdSubject, viewModeSubject]).subscribe(
              ([expandedId, vm]) => {
                setShowEmbeddedControls(expandedId === uuid && vm !== 'edit');
              }
            );
            return () => sub.unsubscribe();
          }, []);

          const viewFilters = useMemo(
            () =>
              ({
                alertStatusFilter: alertStatusFilter ?? [],
                sloStatusFilter: sloStatusFilter ?? [],
                connectionFilter: connectionFilter ?? [],
                anomalySeverityFilter: anomalySeverityFilter ?? [],
              } as ServiceMapViewFilters),
            [alertStatusFilter, sloStatusFilter, connectionFilter, anomalySeverityFilter]
          );

          const onViewFiltersChange = useCallback((next: ServiceMapViewFilters) => {
            customStateManager.api.setAlertStatusFilter(
              next.alertStatusFilter.length ? next.alertStatusFilter : undefined
            );
            customStateManager.api.setSloStatusFilter(
              next.sloStatusFilter.length ? next.sloStatusFilter : undefined
            );
            customStateManager.api.setConnectionFilter(
              next.connectionFilter.length ? next.connectionFilter : undefined
            );
            customStateManager.api.setAnomalySeverityFilter(
              next.anomalySeverityFilter.length ? next.anomalySeverityFilter : undefined
            );
          }, []);

          const fetchContext = useFetchContext(api);
          const effectiveTimeRange = fetchContext.timeRange;
          if (!effectiveTimeRange) {
            return (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                data-test-subj="apmServiceMapEmbeddableWaitingForTimeRange"
              >
                <EuiLoadingSpinner size="xl" />
              </div>
            );
          }

          const parentFilters = syncWithDashboardFilters ? fetchContext.filters : undefined;
          const parentQuery = syncWithDashboardFilters ? fetchContext.query : undefined;

          return (
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              <ApmEmbeddableContext
                deps={deps}
                rangeFrom={effectiveTimeRange.from}
                rangeTo={effectiveTimeRange.to}
                kuery={kuery}
              >
                <ServiceMapEmbeddable
                  rangeFrom={effectiveTimeRange.from}
                  rangeTo={effectiveTimeRange.to}
                  environment={environment}
                  kuery={kuery}
                  serviceName={serviceName ?? undefined}
                  serviceGroupId={serviceGroupId ?? undefined}
                  core={deps.coreStart}
                  onBlockingError={(error) => blockingError$.next(error)}
                  mapOrientation={mapOrientation ?? 'horizontal'}
                  onMapOrientationChange={customStateManager.api.setMapOrientation}
                  parentFilters={parentFilters}
                  parentQuery={parentQuery}
                  viewFilters={viewFilters}
                  onViewFiltersChange={onViewFiltersChange}
                  showEmbeddedControls={showEmbeddedControls}
                />
              </ApmEmbeddableContext>
            </div>
          );
        },
      };
    },
  };
  return factory;
};
