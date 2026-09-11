/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject } from 'rxjs';
import type { initializeTitleManager } from '@kbn/presentation-publishing';
import type { ESQLControlVariable } from '@kbn/esql-types';
import { apiPublishesESQLVariables } from '@kbn/esql-types';
import type { DataView } from '@kbn/data-views-plugin/common';
import type {
  ExpressionWrapperProps,
  LensInternalApi,
  LensOverrides,
  LensPanelProps,
  LensRuntimeState,
  VisualizationContext,
  UserMessage,
} from '@kbn/lens-common';
import { createEmptyLensState } from '../helper';

import { apiHasAbortController, apiHasLensComponentProps } from '../type_guards';
import type { LensEmbeddableStartServices } from '../types';

export function initializeInternalApi(
  initialState: LensRuntimeState,
  parentApi: unknown,
  titleManager: ReturnType<typeof initializeTitleManager>,
  { visualizationMap }: LensEmbeddableStartServices
): LensInternalApi {
  const hasRenderCompleted$ = new BehaviorSubject<boolean>(false);
  const expressionParams$ = new BehaviorSubject<ExpressionWrapperProps | null>(null);
  const expressionAbortController$ = new BehaviorSubject<AbortController>(
    apiHasAbortController(parentApi) ? parentApi.abortController : new AbortController()
  );
  const renderCount$ = new BehaviorSubject<number>(0);

  const attributes$ = new BehaviorSubject<LensRuntimeState['attributes']>(
    initialState.attributes || createEmptyLensState().attributes
  );
  const overrides$ = new BehaviorSubject(initialState.overrides);
  const disableTriggers$ = new BehaviorSubject(initialState.disableTriggers);
  const dataLoading$ = new BehaviorSubject<boolean | undefined>(undefined);

  const dataViews$ = new BehaviorSubject<DataView[] | undefined>(undefined);
  // This is an internal error state, not to be confused with the runtime error state thrown by the expression pipeline
  // In both cases a blocking error can happen, but for Lens validation errors we want to have full control over the UI
  // while for runtime errors the error will bubble up to the embeddable presentation layer
  const validationMessages$ = new BehaviorSubject<UserMessage[]>([]);
  // This other set of messages is for non-blocking messages that can be displayed in the UI
  const messages$ = new BehaviorSubject<UserMessage[]>([]);

  // This should settle the thing once and for all
  // the isNewPanel won't be serialized so it will be always false after the edit panel closes applying the changes
  const isNewlyCreated$ = new BehaviorSubject<boolean>(initialState.isNewPanel || false);

  const blockingError$ = new BehaviorSubject<Error | undefined>(undefined);
  const visualizationContext$ = new BehaviorSubject<VisualizationContext>({
    // doc can point to a different set of attributes for the visualization
    // i.e. when inline editing or applying a suggestion
    activeAttributes: initialState.attributes,
    mergedSearchContext: {},
    indexPatterns: {},
    indexPatternRefs: [],
    activeVisualizationState: undefined,
    activeDatasourceState: undefined,
    activeData: undefined,
  });

  const esqlVariables$ = apiPublishesESQLVariables(parentApi)
    ? parentApi.esqlVariables$
    : new BehaviorSubject<ESQLControlVariable[]>([]);

  const isEditingInProgress$ = new BehaviorSubject<boolean>(false);

  // No need to expose anything at public API right now, that would happen later on
  // where each initializer will pick what it needs and publish it
  return {
    attributes$,
    overrides$,
    disableTriggers$,
    esqlVariables$,
    dataLoading$,
    hasRenderCompleted$,
    expressionParams$,
    expressionAbortController$,
    renderCount$,
    isNewlyCreated$,
    dataViews$,
    blockingError$,
    messages$,
    validationMessages$,
    isEditingInProgress: () => isEditingInProgress$.getValue(),
    updateEditingState: (inProgress: boolean) => isEditingInProgress$.next(inProgress),
    dispatchError: () => {
      hasRenderCompleted$.next(true);
      renderCount$.next(renderCount$.getValue() + 1);
    },
    dispatchRenderStart: () => hasRenderCompleted$.next(false),
    dispatchRenderComplete: () => {
      renderCount$.next(renderCount$.getValue() + 1);
      hasRenderCompleted$.next(true);
    },
    updateExpressionParams: (newParams: ExpressionWrapperProps | null) =>
      expressionParams$.next(newParams),
    updateDataLoading: (newDataLoading: boolean | undefined) => dataLoading$.next(newDataLoading),
    updateOverrides: (overrides: LensOverrides['overrides']) => overrides$.next(overrides),
    updateAttributes: (attributes: LensRuntimeState['attributes']) => attributes$.next(attributes),
    updateAbortController: (abortController: AbortController) =>
      expressionAbortController$.next(abortController),
    updateDisabledTriggers: (disableTriggers: LensPanelProps['disableTriggers']) =>
      disableTriggers$.next(disableTriggers),
    updateDataViews: (dataViews: DataView[] | undefined) => dataViews$.next(dataViews),
    updateMessages: (newMessages: UserMessage[]) => messages$.next(newMessages),
    updateValidationMessages: (newMessages: UserMessage[]) => validationMessages$.next(newMessages),
    updateBlockingError: (blockingError: Error | undefined) => blockingError$.next(blockingError),
    setAsCreated: () => isNewlyCreated$.next(false),
    getDisplayOptions: () => {
      const latestAttributes = attributes$.getValue();
      if (!latestAttributes.visualizationType) {
        return {};
      }

      let displayOptions =
        visualizationMap[latestAttributes.visualizationType]?.getDisplayOptions?.() ?? {};

      if (apiHasLensComponentProps(parentApi) && parentApi.noPadding != null) {
        displayOptions = {
          ...displayOptions,
          noPadding: parentApi.noPadding,
        };
      }

      if (displayOptions.noPanelTitle == null && titleManager.api.hideTitle$?.getValue()) {
        displayOptions = {
          ...displayOptions,
          noPanelTitle: true,
        };
      }

      return displayOptions;
    },
    getVisualizationContext: () => visualizationContext$.getValue(),
    updateVisualizationContext: (newVisualizationContext: Partial<VisualizationContext>) => {
      visualizationContext$.next({
        ...visualizationContext$.getValue(),
        ...newVisualizationContext,
      });
    },
  };
}
