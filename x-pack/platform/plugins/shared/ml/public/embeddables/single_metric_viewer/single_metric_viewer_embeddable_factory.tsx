/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StartServicesAccessor } from '@kbn/core/public';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/public';
import { i18n } from '@kbn/i18n';
import { openLazyFlyout } from '@kbn/presentation-util';

import type { EmbeddablePublicDefinition } from '@kbn/embeddable-plugin/public';
import React from 'react';
import useUnmount from 'react-use/lib/useUnmount';
import type { SingleMetricViewerEmbeddableState } from '@kbn/ml-server-schemas/embeddables/single_metric_viewer';
import {
  apiHasExecutionContext,
  initializeTimeRangeManager,
  initializeTitleManager,
  timeRangeComparators,
  titleComparators,
  useStateFromPublishingSubject,
} from '@kbn/presentation-publishing';
import { BehaviorSubject, Subscription, merge } from 'rxjs';
import { initializeStateApi } from '@kbn/presentation-publishing';
import { ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/single_metric_viewer';
import type { MlPluginStart, MlStartDependencies } from '../../plugin';
import type { SingleMetricViewerEmbeddableApi } from '../types';
import {
  initializeSingleMetricViewerControls,
  singleMetricViewerComparators,
} from './single_metric_viewer_controls_initializer';
import { initializeSingleMetricViewerDataFetcher } from './single_metric_viewer_data_fetcher';
import { getServices } from './get_services';
import { useReactEmbeddableExecutionContext } from '../common/use_embeddable_execution_context';
import { getSingleMetricViewerComponent } from '../../shared_components/single_metric_viewer';
import { EmbeddableSingleMetricViewerUserInput } from './single_metric_viewer_setup_flyout';
import { checkPermissionAsync } from '../../application/capabilities/check_capabilities';

export const getSingleMetricViewerEmbeddableFactory = (
  getStartServices: StartServicesAccessor<MlStartDependencies, MlPluginStart>,
  usageCollection?: UsageCollectionSetup
) => {
  const factory: EmbeddablePublicDefinition<
    SingleMetricViewerEmbeddableState,
    SingleMetricViewerEmbeddableApi
  > = {
    type: ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE,
    buildEmbeddable: async ({ initialState, finalizeApi, uuid, parentApi }) => {
      await checkPermissionAsync(getStartServices, 'canGetJobs', true);
      const services = await getServices(getStartServices, usageCollection);
      const subscriptions = new Subscription();
      const titleManager = initializeTitleManager(initialState);
      const timeRangeManager = initializeTimeRangeManager(initialState);

      const singleMetricManager = initializeSingleMetricViewerControls(
        initialState,
        titleManager.api
      );

      const dataLoading$ = new BehaviorSubject<boolean | undefined>(true);
      const blockingError$ = new BehaviorSubject<Error | undefined>(undefined);

      const stateApi = initializeStateApi<SingleMetricViewerEmbeddableState>({
        uuid,
        parentApi,
        serializeState: () => ({
          ...titleManager.getLatestState(),
          ...timeRangeManager.getLatestState(),
          ...singleMetricManager.getLatestState(),
        }),
        anyStateChange$: merge(
          titleManager.anyStateChange$,
          timeRangeManager.anyStateChange$,
          singleMetricManager.anyStateChange$
        ),
        getComparators: () => ({
          ...titleComparators,
          ...timeRangeComparators,
          ...singleMetricViewerComparators,
        }),
        applySerializedState: (nextState) => {
          timeRangeManager.reinitializeState(nextState);
          titleManager.reinitializeState(nextState);
          singleMetricManager.reinitializeState(nextState);
        },
      });

      const api = finalizeApi({
        isEditingEnabled: () => true,
        getTypeDisplayName: () =>
          i18n.translate('xpack.ml.singleMetricViewerEmbeddable.typeDisplayName', {
            defaultMessage: 'single metric viewer',
          }),
        onEdit: async () => {
          const [coreStart, { data, share }, { mlApi }] = services;
          openLazyFlyout({
            core: coreStart,
            parentApi,
            flyoutProps: {
              focusedPanelId: uuid,
            },
            loadContent: async ({ closeFlyout }) => {
              return (
                <EmbeddableSingleMetricViewerUserInput
                  coreStart={coreStart}
                  services={{ data, share }}
                  mlApi={mlApi}
                  onConfirm={(result) => {
                    singleMetricManager.api.updateUserInput(result);
                    closeFlyout();
                  }}
                  onCancel={closeFlyout}
                  input={{
                    ...titleManager.getLatestState(),
                    ...singleMetricManager.getLatestState(),
                  }}
                />
              );
            },
          });
        },
        ...titleManager.api,
        ...timeRangeManager.api,
        ...singleMetricManager.api,
        ...stateApi,
        dataLoading$,
        blockingError$,
      });

      const { singleMetricViewerData$, onDestroy } = initializeSingleMetricViewerDataFetcher(
        api,
        services[1].data.query.timefilter.timefilter
      );

      const SingleMetricViewerComponent = getSingleMetricViewerComponent(...services, api);

      return {
        api,
        Component: () => {
          if (!apiHasExecutionContext(parentApi)) {
            throw new Error('Parent API does not have execution context');
          }

          const { singleMetricViewerData, bounds, lastRefresh } =
            useStateFromPublishingSubject(singleMetricViewerData$);

          useReactEmbeddableExecutionContext(
            services[0].executionContext,
            parentApi.executionContext,
            ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE,
            uuid
          );

          useUnmount(() => {
            singleMetricManager.cleanup();
            onDestroy();
            subscriptions.unsubscribe();
          });

          // Need to make sure we fall back to `undefined` if `functionDescription` is an empty string,
          // otherwise anomaly table data will not be loaded.
          const functionDescription =
            (singleMetricViewerData?.functionDescription ?? '') === ''
              ? undefined
              : singleMetricViewerData?.functionDescription;

          return (
            <SingleMetricViewerComponent
              shouldShowForecastButton={true}
              bounds={bounds}
              functionDescription={functionDescription}
              lastRefresh={lastRefresh}
              onError={(error) => blockingError$.next(error)}
              selectedDetectorIndex={singleMetricViewerData?.selectedDetectorIndex}
              selectedEntities={singleMetricViewerData?.selectedEntities}
              selectedJobId={singleMetricViewerData?.jobIds[0]}
              forecastId={singleMetricViewerData?.forecastId}
              uuid={api.uuid}
              onForecastIdChange={api.updateForecastId}
              onRenderComplete={() => {
                dataLoading$.next(false);
              }}
            />
          );
        },
      };
    },
  };

  return factory;
};
