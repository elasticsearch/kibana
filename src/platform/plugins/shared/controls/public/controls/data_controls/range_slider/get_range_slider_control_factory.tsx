/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect } from 'react';
import { BehaviorSubject, combineLatest, debounceTime, map, merge, of, skip } from 'rxjs';

import {
  apiHasPinnedPanels,
  apiHasSections,
  panelIsRelatedByGlobalFilters,
  apiPublishesViewMode,
  fetch$,
  initializeRelatedPanels,
  initializeStateApi,
  useBatchedPublishingSubjects,
} from '@kbn/presentation-publishing';
import { DEFAULT_RANGE_SLIDER_STATE, RANGE_SLIDER_CONTROL } from '@kbn/controls-constants';
import type { EmbeddablePublicDefinition } from '@kbn/embeddable-plugin/public';
import type { RangeSliderControlState } from '@kbn/controls-schemas';

import { isCompressed } from '../../../control_group/utils/is_compressed';
import {
  defaultDataControlComparators,
  initializeDataControlManager,
} from '../data_control_manager';
import { RangeSliderControl } from './components/range_slider_control';
import { hasNoResults$ } from './has_no_results';
import { minMax$ } from './min_max';
import { initializeRangeControlSelections } from './range_control_selections';
import { RangeSliderStrings } from './range_slider_strings';
import type { RangeSliderControlApi } from './types';
import { editorComparators, initializeEditorStateManager } from './editor_state_manager';
import { buildFilter } from './utils/filter_utils';
import { getPlacementHints, LAYOUT_CONSTRAINTS } from '../../constants';

export const getRangesliderControlFactory = (): EmbeddablePublicDefinition<
  RangeSliderControlState,
  RangeSliderControlApi
> => {
  return {
    type: RANGE_SLIDER_CONTROL,
    getPlacementHints,
    layoutConstraints: LAYOUT_CONSTRAINTS,
    buildEmbeddable: async ({ initialState, finalizeApi, uuid, parentApi }) => {
      const state = initialState;
      const loadingMinMax$ = new BehaviorSubject<boolean>(false);
      const loadingHasNoResults$ = new BehaviorSubject<boolean>(false);
      const dataLoading$ = new BehaviorSubject<boolean | undefined>(undefined);

      const editorStateManager = initializeEditorStateManager(state);

      const dataControlManager = await initializeDataControlManager<
        Pick<RangeSliderControlState, 'step'>
      >({
        controlId: uuid,
        controlType: RANGE_SLIDER_CONTROL,
        typeDisplayName: RangeSliderStrings.control.getDisplayName(),
        state,
        parentApi,
        willHaveInitialFilter: state.value !== undefined,
        getInitialFilter: (dataView) => buildFilter(dataView, uuid, state),
        editorStateManager,
      });

      const selections = initializeRangeControlSelections(
        state,
        dataControlManager.internalApi.onSelectionChange
      );

      const stateApi = initializeStateApi<RangeSliderControlState>({
        uuid,
        parentApi,
        serializeState: () => ({
          ...dataControlManager.getLatestState(),
          ...editorStateManager.getLatestState(),
          value: selections.value$.getValue(),
        }),
        anyStateChange$: merge(
          dataControlManager.anyStateChange$,
          selections.value$.pipe(
            skip(1),
            map(() => undefined)
          ),
          editorStateManager.anyStateChange$
        ),
        getComparators: () => {
          return {
            ...editorComparators,
            ...defaultDataControlComparators,
            value: 'deepEquality',
          };
        },
        applySerializedState: (nextState) => {
          dataControlManager.reinitializeState(nextState);
          editorStateManager.reinitializeState(nextState);
          selections.setValue(nextState.value);
        },
      });

      const relatedPanelsApi = initializeRelatedPanels({
        uuid,
        parentApi,
        ...panelIsRelatedByGlobalFilters(dataControlManager.api.useGlobalFilters$),
      });

      const api = finalizeApi({
        ...stateApi,
        ...dataControlManager.api,
        ...relatedPanelsApi,
        dataLoading$,
        clearSelections: () => {
          selections.setValue(undefined);
        },
        hasSelections$: selections.hasRangeSelection$,
      });

      const dataLoadingSubscription = combineLatest([
        loadingMinMax$,
        loadingHasNoResults$,
        dataControlManager.api.dataLoading$,
      ])
        .pipe(
          debounceTime(100),
          map((values) => values.some((value) => value))
        )
        .subscribe((isLoading) => {
          dataLoading$.next(isLoading);
        });

      // Clear state when the field changes
      const fieldChangedSubscription = combineLatest([
        dataControlManager.api.fieldName$,
        dataControlManager.api.dataViewId$,
      ])
        .pipe(skip(1))
        .subscribe(() => {
          editorStateManager.api.setStep(DEFAULT_RANGE_SLIDER_STATE.step);
          selections.setValue(undefined);
        });

      const controlFetch$ = fetch$({ uuid, parentApi });
      const max$ = new BehaviorSubject<number | undefined>(undefined);
      const min$ = new BehaviorSubject<number | undefined>(undefined);
      const minMaxSubscription = minMax$({
        controlFetch$,
        dataViews$: dataControlManager.api.dataViews$,
        fieldName$: dataControlManager.api.fieldName$,
        esqlQuery$: dataControlManager.api.esqlQuery$,
        valuesSource$: dataControlManager.api.valuesSource$,
        useGlobalFilters$: dataControlManager.api.useGlobalFilters$,
        setIsLoading: (isLoading: boolean) => {
          // clear previous loading error on next loading start
          if (isLoading && dataControlManager.api.blockingError$.value) {
            dataControlManager.api.setBlockingError(undefined);
          }
          loadingMinMax$.next(isLoading);
        },
      }).subscribe(
        ({
          error,
          min,
          max,
        }: {
          error?: Error;
          min: number | undefined;
          max: number | undefined;
        }) => {
          if (error) {
            dataControlManager.api.setBlockingError(error);
          }
          max$.next(max !== undefined ? Math.ceil(max) : undefined);
          min$.next(min !== undefined ? Math.floor(min) : undefined);

          const [from, to] = selections.value$.getValue() ?? [];
          if (max !== undefined && Number(to ?? -Infinity) > Math.ceil(max))
            selections.setValue([from, String(Math.ceil(max))]);
          if (min !== undefined && Number(from ?? Infinity) < Math.ceil(min))
            selections.setValue([String(Math.floor(min)), to]);
        }
      );

      /** Output filters when selections and/or filter meta data changes */
      const sectionId$ = apiHasSections(parentApi) ? parentApi.panelSection$(uuid) : of(undefined);

      const outputFilterSubscription = combineLatest([
        dataControlManager.api.dataViews$,
        dataControlManager.api.fieldName$,
        selections.value$,
        sectionId$,
      ])
        .pipe(debounceTime(0))
        .subscribe(([dataViews, fieldName, value, sectionId]) => {
          const dataView = dataViews?.[0];
          if (!dataView) return;

          const newFilter = buildFilter(dataView, uuid, {
            field_name: fieldName,
            value,
            sectionId,
          });
          dataControlManager.internalApi.setOutputFilter(newFilter);
        });

      const selectionHasNoResults$ = new BehaviorSubject(false);
      const hasNotResultsSubscription = hasNoResults$({
        api: dataControlManager.api,
        controlFetch$,
        setIsLoading: (isLoading: boolean) => {
          loadingHasNoResults$.next(isLoading);
        },
      }).subscribe((hasNoResults) => {
        selectionHasNoResults$.next(hasNoResults);
      });

      const viewMode$ = apiPublishesViewMode(parentApi)
        ? parentApi.viewMode$
        : new BehaviorSubject<boolean>(true);

      const isPinned = apiHasPinnedPanels(parentApi) ? parentApi.panelIsPinned(uuid) : false;

      return {
        api,
        Component: () => {
          const [
            dataLoading,
            fieldFormatter,
            max,
            min,
            selectionHasNoResults,
            step,
            value,
            fieldName,
            viewMode,
            label,
          ] = useBatchedPublishingSubjects(
            dataLoading$,
            dataControlManager.api.fieldFormatter,
            max$,
            min$,
            selectionHasNoResults$,
            editorStateManager.api.step$,
            selections.value$,
            dataControlManager.api.fieldName$,
            viewMode$,
            dataControlManager.api.label$
          );

          useEffect(() => {
            return () => {
              dataLoadingSubscription.unsubscribe();
              fieldChangedSubscription.unsubscribe();
              hasNotResultsSubscription.unsubscribe();
              minMaxSubscription.unsubscribe();
              outputFilterSubscription.unsubscribe();

              dataControlManager.cleanup();
            };
          }, []);

          return (
            <RangeSliderControl
              fieldName={fieldName ?? ''}
              fieldFormatter={fieldFormatter}
              isInvalid={Boolean(value) && selectionHasNoResults}
              isLoading={typeof dataLoading === 'boolean' ? dataLoading : false}
              isEdit={viewMode === 'edit'}
              max={max}
              min={min}
              onChange={selections.setValue}
              step={step}
              value={value}
              uuid={uuid}
              compressed={isCompressed(api)}
              isPinned={isPinned}
              label={label}
            />
          );
        },
      };
    },
  };
};
