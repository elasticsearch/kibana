/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type KibanaExecutionContext } from '@kbn/core/public';
import { apiPublishesESQLVariables } from '@kbn/esql-types';
import type {
  GetStateType,
  LensInternalApi,
  LensPublicCallbacks,
  SharingSavedObjectProps,
  UserMessagesDisplayLocationId,
} from '@kbn/lens-common';
import type { LensApi } from '@kbn/lens-common-2';
import {
  apiPublishesProjectRouting,
  apiPublishesUnifiedSearch,
  fetch$,
  type FetchContext,
} from '@kbn/presentation-publishing';
import fastIsEqual from 'fast-deep-equal';
import { pick } from 'lodash';
import {
  BehaviorSubject,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  merge,
  pipe,
  skip,
  tap,
  type Subscription,
} from 'rxjs';
import { apm } from '@elastic/apm-rum';
import { getEditPath } from '../../common/constants';
import { prepareCallbacks } from './expressions/callbacks';
import { getExpressionRendererParams } from './expressions/expression_params';
import { getMergedSearchContext } from './expressions/merged_search_context';
import { getLogError } from './expressions/telemetry';
import { getUsedDataViews } from './expressions/update_data_views';
import {
  getParentContext,
  getRenderMode,
  hasAnnotationGroupReference,
  updateAttributesWithAnnotation,
} from './helper';
import { addLog } from './logger';
import {
  apiHasLensComponentCallbacks,
  apiHasUserMessages,
  hasTablesAdapter,
  isPartialInspectorAdapters,
  type OnDataCallback,
} from './type_guards';
import type { LensEmbeddableStartServices } from './types';
import { buildUserMessagesHelpers } from './user_messages/api';

const blockingMessageDisplayLocations: UserMessagesDisplayLocationId[] = [
  'visualization',
  'visualizationOnEmbeddable',
];

export type ReloadReason =
  | 'ESQLvariables'
  | 'attributes'
  | 'refId'
  | 'overrides'
  | 'disableTriggers'
  | 'viewMode'
  | 'searchContext';

function getSearchContext(parentApi: unknown) {
  const unifiedSearch$ = apiPublishesUnifiedSearch(parentApi)
    ? pick(parentApi, 'filters$', 'query$', 'timeslice$', 'timeRange$')
    : {
        filters$: new BehaviorSubject(undefined),
        query$: new BehaviorSubject(undefined),
        timeslice$: new BehaviorSubject(undefined),
        timeRange$: new BehaviorSubject(undefined),
      };

  const { projectRouting$ } = apiPublishesProjectRouting(parentApi)
    ? parentApi
    : { projectRouting$: undefined };

  return {
    filters: unifiedSearch$.filters$.getValue(),
    query: unifiedSearch$.query$.getValue(),
    timeRange: unifiedSearch$.timeRange$.getValue(),
    timeslice: unifiedSearch$.timeslice$?.getValue(),
    esqlVariables: apiPublishesESQLVariables(parentApi)
      ? parentApi.esqlVariables$.getValue()
      : undefined,
    projectRouting: projectRouting$?.getValue(),
  };
}

/**
 * The function computes the expression used to render the panel and produces the necessary props
 * for the ExpressionWrapper component, binding any outer context to them.
 * @returns
 */
export function loadEmbeddableData(
  uuid: string,
  getState: GetStateType,
  api: LensApi,
  parentApi: unknown,
  internalApi: LensInternalApi,
  services: LensEmbeddableStartServices,
  metaInfo?: SharingSavedObjectProps
) {
  const { onLoad, onBeforeBadgesRender, ...callbacks } = apiHasLensComponentCallbacks(parentApi)
    ? parentApi
    : ({} as LensPublicCallbacks);

  const getConsumerMessages = () =>
    apiHasUserMessages(parentApi) ? parentApi.userMessages ?? [] : [];

  // Some convenience api for the user messaging
  const {
    getUserMessages,
    addUserMessages,
    updateBlockingErrors,
    updateValidationErrors,
    updateWarnings,
    resetMessages,
    updateMessages,
  } = buildUserMessagesHelpers(
    api,
    internalApi,
    services,
    onBeforeBadgesRender,
    metaInfo,
    getConsumerMessages
  );

  const dispatchBlockingErrorIfAny = () => {
    const blockingErrors = getUserMessages(blockingMessageDisplayLocations, {
      severity: 'error',
    });
    updateValidationErrors(blockingErrors);
    updateBlockingErrors(blockingErrors);
    if (blockingErrors.length > 0) {
      internalApi.dispatchError();
    }
    return blockingErrors.length > 0;
  };

  const onRenderComplete = () => {
    updateMessages(getUserMessages('embeddableBadge'));
    // No issues so far, blocking errors are handled directly by Lens from this point on
    if (!dispatchBlockingErrorIfAny()) {
      internalApi.dispatchRenderComplete();
    }
  };

  async function reload(
    // make reload easier to debug
    sourceId: ReloadReason,
    fetchContext?: FetchContext
  ) {
    addLog(`Embeddable reload reason: ${sourceId}`);

    resetMessages();

    // reset the render on reload
    internalApi.dispatchRenderStart();

    // notify about data loading
    internalApi.updateDataLoading(true);

    // the component is ready to load
    onLoad?.(true);

    const currentState = getState();

    const getExecutionContext = () => {
      const parentContext = getParentContext(parentApi);
      const lastState = getState();
      if (lastState.attributes) {
        const child: KibanaExecutionContext = {
          type: 'lens',
          name: lastState.attributes.visualizationType ?? '',
          id: uuid || 'new',
          // Prefer the panel-level title when it is set, falling back to the
          // chart's own title. With the `lens.apiFormat` path the chart title is
          // stripped from the wire format, so the panel title is the source of truth.
          description: lastState.title ?? lastState.attributes.title ?? '',
          url: `${services.coreStart.application.getUrlForApp('lens')}${getEditPath(
            lastState.ref_id
          )}`,
        };

        return parentContext
          ? {
              ...parentContext,
              child,
            }
          : child;
      }
    };

    // _data (expression result) is unused — Lens only needs the inspector adapters.
    // The signature OnDataCallback is used for consistency with the expressions plugin.
    const onDataCallback: OnDataCallback = (_data, adapters) => {
      internalApi.updateVisualizationContext({
        activeData: hasTablesAdapter(adapters) ? adapters.tables?.tables : undefined,
      });

      // data has loaded
      internalApi.updateDataLoading(false);
      // The third argument here is an observable to let the
      // consumer to be notified on data change
      onLoad?.(
        false,
        isPartialInspectorAdapters(adapters) ? adapters : undefined,
        api.dataLoading$
      );

      api.loadViewUnderlyingData();

      updateWarnings();
      // Render can still go wrong, so perfor a new check
      dispatchBlockingErrorIfAny();
    };

    const { onRender, onData, handleEvent, disableTriggers } = prepareCallbacks(
      api,
      internalApi,
      parentApi,
      getState,
      services,
      getExecutionContext(),
      onDataCallback,
      onRenderComplete,
      callbacks
    );

    const searchContext = getMergedSearchContext(
      currentState,
      fetchContext ? fetchContext : getSearchContext(parentApi),
      api.timeRange$,
      parentApi,
      services
    );

    // Go concurrently: build the expression and fetch the dataViews
    const [{ params, abortController, ...rest }, dataViewIds] = await Promise.all([
      getExpressionRendererParams(currentState, {
        searchContext,
        api,
        settings: {
          syncColors: currentState.syncColors,
          syncCursor: currentState.syncCursor,
          syncTooltips: currentState.syncTooltips,
        },
        renderMode: getRenderMode(parentApi),
        services,
        searchSessionId: api.searchSessionId$.getValue(),
        abortController: internalApi.expressionAbortController$.getValue(),
        getExecutionContext,
        logError: getLogError(getExecutionContext),
        addUserMessages,
        onRender,
        onData,
        handleEvent,
        disableTriggers,
        updateBlockingErrors,
        forceDSL: (parentApi as { forceDSL?: boolean }).forceDSL,
        getDisplayOptions: internalApi.getDisplayOptions,
      }),
      getUsedDataViews(
        currentState.attributes.references,
        currentState.attributes.state?.adHocDataViews,
        services.dataViews
      ),
    ]);

    // update the visualization context before anything else
    // as it will be used to compute blocking errors also in case of issues
    internalApi.updateVisualizationContext({
      activeAttributes: currentState.attributes,
      mergedSearchContext: params?.searchContext || {},
      ...rest,
    });

    // Publish the used dataViews on the Lens API
    internalApi.updateDataViews(dataViewIds);

    // This will catch also failed loaded dataViews
    const hasBlockingErrors = dispatchBlockingErrorIfAny();

    if (params?.expression != null && !hasBlockingErrors) {
      internalApi.updateExpressionParams(params);
    }

    internalApi.updateAbortController(abortController);
  }

  // Build a custom operator to be resused for various observables
  function waitUntilChanged() {
    return pipe(distinctUntilChanged(fastIsEqual), skip(1));
  }

  const mergedSubscriptions = merge(
    // On state change, reload
    // this is used to refresh the chart on inline editing
    // just make sure to avoid to rerender if there's no substantial change
    // make sure to debounce one tick to make the refresh work
    internalApi.attributes$.pipe(
      waitUntilChanged(),
      tap(() => {
        // the ES|QL query may have changed, so recompute the args for view underlying data
        if (api.isTextBasedLanguage()) {
          api.loadViewUnderlyingData();
        }
      }),
      map(() => 'attributes' as ReloadReason)
    ),
    api.savedObjectId$.pipe(
      waitUntilChanged(),
      map(() => 'refId' as ReloadReason)
    ),
    internalApi.overrides$.pipe(
      waitUntilChanged(),
      map(() => 'overrides' as ReloadReason)
    ),
    internalApi.disableTriggers$.pipe(
      waitUntilChanged(),
      map(() => 'disableTriggers' as ReloadReason)
    )
  );

  const subscriptions: Subscription[] = [
    // on search context change, reload
    fetch$(api)
      .pipe(debounceTime(0))
      .subscribe((fetchContext) => reload('searchContext' as ReloadReason, fetchContext)),
    mergedSubscriptions.pipe(debounceTime(0)).subscribe(reload),
    // Capture blocking errors in APM for observability
    internalApi.blockingError$
      .pipe(filter((error): error is Error => error != null))
      .subscribe((error) => {
        const currentState = getState();
        const parentContext = getParentContext(parentApi);
        const meta = parentContext?.meta as Record<string, string | undefined> | undefined;
        const transaction = apm.getCurrentTransaction();
        if (transaction) {
          const span = transaction.startSpan('lens-chart-error', 'lens-embeddable');

          if (span) {
            span.addLabels({
              kibana_meta_metric_type: currentState.attributes?.visualizationType ?? 'unknown',
              kibana_meta_profile_id: meta?.profile_id ?? 'unknown',
              kibana_meta_metric_id: meta?.metric_id ?? 'unknown',
            });
            apm.captureError(error);
            // @ts-expect-error RUM types don't include outcome
            span.outcome = 'failure';
            span.end();
          }
        }
      }),
    // make sure to reload on viewMode change
    api.viewMode$.subscribe(() => {
      // only reload if drilldowns are set
      if (getState().drilldowns?.length) {
        reload('viewMode');
      }
    }),
    // When a library annotation group is updated, fetch the latest data and push it
    // into attributes$ so the chart re-renders.
    services.eventAnnotationService.annotationGroupUpdated$
      .pipe(filter((updatedGroupId) => hasAnnotationGroupReference(getState(), updatedGroupId)))
      .subscribe(async (updatedGroupId) => {
        try {
          const libraryGroup = await services.eventAnnotationService.loadAnnotationGroup(
            updatedGroupId
          );
          const updated = updateAttributesWithAnnotation(getState(), updatedGroupId, libraryGroup);
          if (updated) {
            internalApi.updateAttributes(updated.attributes);
          }
        } catch (err) {
          addLog(`Failed to fetch annotation group ${updatedGroupId}: ${err}`);
        }
      }),
  ];
  // There are few key moments when errors are checked and displayed:
  // * at setup time (here) before the first expression evaluation
  // * at runtime => when the expression is running and ES/Kibana server could emit errors)
  // * at data time => data has arrived but for something goes wrong
  // * at render time => rendering happened but somethign went wrong
  // Bubble the error up to the embeddable system if any
  dispatchBlockingErrorIfAny();

  return {
    cleanup: () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    },
  };
}
