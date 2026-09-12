/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EmbeddablePublicDefinition } from '@kbn/embeddable-plugin/public';
import type { PanelSettingsApi } from '@kbn/embeddable-plugin/public';
import { initializeTitleManager, initializeStateApi } from '@kbn/presentation-publishing';
import type { PublishesWritableUnifiedSearch } from '@kbn/presentation-publishing';
import { LENS_EMBEDDABLE_TYPE, type LensRuntimeState } from '@kbn/lens-common';
import type { LensApi, LensWireAPIConfig } from '@kbn/lens-common-2';
import { merge } from 'rxjs';

import { loadEmbeddableData } from './data_loader';
import { isTextBasedLanguage, deserializeState } from './helper';
import { initializeEditApi } from './initializers/initialize_edit';
import { initializeInspector } from './initializers/initialize_inspector';
import {
  dashboardServicesComparators,
  initializeDashboardServices,
} from './initializers/initialize_dashboard_services';
import { initializeInternalApi } from './initializers/initialize_internal_api';
import {
  initializeSearchContext,
  searchContextComparators,
} from './initializers/initialize_search_context';
import { initializeActionApi } from './initializers/initialize_actions';
import { initializeIntegrations } from './initializers/initialize_integrations';
import { initializeStateManagement } from './initializers/initialize_state_management';
import { LensEmbeddableComponent } from './renderer/lens_embeddable_component';
import { EditorFrameServiceProvider } from '../editor_frame_service/editor_frame_service_context';
import type { LensEmbeddableStartServices } from './types';

export const createLensEmbeddableFactory = (
  services: LensEmbeddableStartServices
): EmbeddablePublicDefinition<LensWireAPIConfig, LensApi> => {
  return {
    type: LENS_EMBEDDABLE_TYPE,
    /**
     * This is called after the deserialize, so some assumptions can be made about its arguments:
     * @param uuid      a unique identifier for the embeddable panel
     * @param state     the Lens "runtime" state, which means that 'attributes' is always present.
     *                  The difference for a by-value and a by-ref can be determined by the presence of 'savedObjectId' in the state
     * @param buildApi  a utility function to build the Lens API together to instrument the embeddable container on how to detect
     *                  significative changes in the state (i.e. worth a save or not)
     * @param parentApi a set of props passed down from the embeddable container. Note: no assumptions can be made about its content
     *                  so the usage of type-guards is recommended before extracting data from it.
     *                  Due to the new embeddable being rendered by a <ReactEmbeddableRenderer /> wrapper, this is the only way
     *                  to pass data/props from a container.
     *                  Typical use cases is the forwarding of the unifiedSearch context to the embeddable, or the passing props
     *                  from the Lens component container to the Lens embeddable.
     * @returns an object with the Lens API and the React component to render in the Embeddable
     */
    buildEmbeddable: async ({
      initializeDrilldownsManager,
      initialState,
      finalizeApi,
      parentApi,
      uuid,
    }) => {
      const titleManager = initializeTitleManager(initialState);

      const drilldownsManager = initializeDrilldownsManager(uuid, initialState);

      const initialRuntimeState = await deserializeState(services, initialState);

      /**
       * Observables and functions declared here are used internally to store mutating state values
       * This is an internal API not exposed outside of the embeddable.
       */
      const internalApi = initializeInternalApi(
        initialRuntimeState,
        parentApi,
        titleManager,
        services
      );

      /**
       * Initialize various configurations required to build all the required
       * parts for the Lens embeddable.
       */
      const stateConfig = initializeStateManagement(initialRuntimeState, internalApi);
      const dashboardConfig = initializeDashboardServices(
        initialRuntimeState,
        getLatestState,
        internalApi,
        stateConfig,
        parentApi,
        titleManager,
        services
      );

      const inspectorConfig = initializeInspector(services);

      const searchContextConfig = initializeSearchContext(
        initialRuntimeState,
        internalApi,
        parentApi,
        services
      );

      const panelSettingsApi: PanelSettingsApi = {
        ...titleManager.api,
        defaultTitle$: dashboardConfig.api.defaultTitle$,
        defaultDescription$: dashboardConfig.api.defaultDescription$,
        timeRange$: searchContextConfig.api.timeRange$,
        setTimeRange: (searchContextConfig.api as PublishesWritableUnifiedSearch).setTimeRange,
        isCompatibleWithUnifiedSearch: searchContextConfig.api.isCompatibleWithUnifiedSearch,
        parentApi,
      };

      const editConfig = initializeEditApi(
        uuid,
        initialRuntimeState,
        getLatestState,
        internalApi,
        stateConfig.api,
        inspectorConfig.api,
        searchContextConfig.api,
        isTextBasedLanguage,
        services,
        parentApi,
        panelSettingsApi
      );

      const integrationsConfig = initializeIntegrations(getLatestState);
      const actionsConfig = initializeActionApi(
        uuid,
        initialRuntimeState,
        getLatestState,
        parentApi,
        searchContextConfig.api,
        internalApi,
        services,
        drilldownsManager
      );

      /**
       * This is useful to have always the latest version of the state
       * at hand when calling callbacks or performing actions
       */
      function getLatestState(): LensRuntimeState {
        return {
          ...actionsConfig.getLatestState(),
          ...dashboardConfig.getLatestState(),
          ...searchContextConfig.getLatestState(),
          ...stateConfig.getLatestState(),
        };
      }

      const stateApi = initializeStateApi<LensWireAPIConfig>({
        uuid,
        parentApi,
        serializeState: () => {
          if (internalApi.isEditingInProgress()) {
            return initialState;
          }
          return integrationsConfig.api.serializeState();
        },
        anyStateChange$: merge(
          actionsConfig.anyStateChange$,
          dashboardConfig.anyStateChange$,
          stateConfig.anyStateChange$,
          searchContextConfig.anyStateChange$
        ),
        getComparators: () => {
          const comparators = {
            ...stateConfig.getComparators(),
            ...actionsConfig.getComparators(),
            ...dashboardServicesComparators,
            ...searchContextComparators,
            isNewPanel: 'skip',
            references: 'skip',
          } as const;
          // set all comparators to 'skip' when inline editing is in progress
          if (internalApi.isEditingInProgress()) {
            const keys = Object.keys(comparators) as (keyof typeof comparators)[];
            return keys.reduce((acc, key) => {
              acc[key] = 'skip';
              return acc;
            }, {} as Record<keyof typeof comparators, 'skip'>);
          }
          return comparators;
        },
        applySerializedState: async (nextState) => {
          actionsConfig.reinitializeState(nextState);
          dashboardConfig.reinitializeState(nextState);
          searchContextConfig.reinitializeState(nextState);
          const nextRuntimeState = await deserializeState(services, nextState);
          stateConfig.reinitializeRuntimeState(nextRuntimeState);
        },
      });

      /**
       * Lens API is the object that can be passed to the final component/renderer and
       * provide access to the services for and by the outside world
       */
      const api: LensApi = finalizeApi(
        // Note: the order matters here, so make sure to have the
        // dashboardConfig who owns the savedObjectId after the
        // stateConfig one who owns the inline editing
        {
          ...stateApi,
          ...editConfig.api,
          ...inspectorConfig.api,
          ...searchContextConfig.api,
          ...actionsConfig.api,
          ...integrationsConfig.api,
          ...stateConfig.api,
          ...dashboardConfig.api,
          supportsJsonExport: true,
          cancelRequests: () => {
            const abortController = internalApi.expressionAbortController$.getValue();
            abortController.abort();
            internalApi.updateAbortController(new AbortController());
          },
        }
      );

      // Compute the expression using the provided parameters
      // Inside a subscription will be updated based on each unifiedSearch change
      // and as side effect update few observables as  expressionParams$, expressionAbortController$ and renderCount$ with the new values upon updates
      const expressionConfig = loadEmbeddableData(
        uuid,
        getLatestState,
        api,
        parentApi,
        internalApi,
        services,
        undefined,
        searchContextConfig.internalApi.setApproximationApplied
      );

      const onUnmount = () => {
        expressionConfig.cleanup();
        actionsConfig.cleanup();
        searchContextConfig.cleanup();
      };

      return {
        api,
        Component: () => (
          <EditorFrameServiceProvider
            visualizationMap={services.visualizationMap}
            datasourceMap={services.datasourceMap}
          >
            <LensEmbeddableComponent api={api} internalApi={internalApi} onUnmount={onUnmount} />
          </EditorFrameServiceProvider>
        ),
      };
    },
  };
};
