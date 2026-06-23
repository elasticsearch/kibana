/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect } from 'react';
import {
  BehaviorSubject,
  Subject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  merge,
  of,
  skip,
} from 'rxjs';

import {
  ControlValuesSource,
  OPTIONS_LIST_CONTROL,
  DEFAULT_DSL_OPTIONS_LIST_STATE,
} from '@kbn/controls-constants';
import type { OptionsListSelection, OptionsListDSLControlState } from '@kbn/controls-schemas';
import type { EmbeddablePublicDefinition } from '@kbn/embeddable-plugin/public';
import {
  apiHasPinnedPanels,
  apiHasSections,
  panelIsRelatedByGlobalFilters,
  initializeRelatedPanels,
  initializeStateApi,
  type PublishingSubject,
} from '@kbn/presentation-publishing';

import type { OptionsListSuccessResponse } from '../../../../common/options_list';
import { isValidSearch } from '../../../../common/options_list';
import {
  defaultDataControlComparators,
  initializeDataControlManager,
  type DataControlStateManager,
} from '../data_control_manager';
import { OptionsListControl } from './components/options_list_control';
import { MIN_OPTIONS_LIST_REQUEST_SIZE } from './constants';
import {
  editorComparators,
  initializeEditorStateManager,
  type EditorState,
} from './editor_state_manager';
import { fetchAndValidate$ } from './fetch_and_validate';
import { OptionsListControlContext } from './options_list_context_provider';
import { OptionsListStrings } from './options_list_strings';
import { initializeSelectionsManager, selectionComparators } from './selections_manager';
import { initializeTemporayStateManager } from './temporay_state_manager';
import type { DSLOptionsListComponentApi, OptionsListControlApi } from './types';
import { buildFilter } from './utils/filter_utils';
import {
  clearSelections,
  deselectAll,
  deselectOption,
  makeSelection,
  selectAll,
} from './utils/selection_utils';
import { getPlacementHints, LAYOUT_CONSTRAINTS } from '../../constants';

// TODO Remove when we're able to get accurate document counts for ES|QL-source controls and can reenable doc-count sorting on them
const normalizeEsqlSort = (
  controlState: OptionsListDSLControlState
): OptionsListDSLControlState => {
  if (
    controlState.values_source !== ControlValuesSource.ESQL ||
    (controlState.sort?.by ?? DEFAULT_DSL_OPTIONS_LIST_STATE.sort.by) !== '_count'
  ) {
    return controlState;
  }

  return {
    ...controlState,
    sort: {
      by: '_key',
      direction: controlState.sort?.direction ?? DEFAULT_DSL_OPTIONS_LIST_STATE.sort.direction,
    },
  };
};

export const getOptionsListControlFactory = (): EmbeddablePublicDefinition<
  OptionsListDSLControlState,
  OptionsListControlApi
> => {
  return {
    type: OPTIONS_LIST_CONTROL,
    getPlacementHints,
    layoutConstraints: LAYOUT_CONSTRAINTS,
    buildEmbeddable: async ({ initialState, finalizeApi, uuid, parentApi }) => {
      const state = normalizeEsqlSort(initialState);

      const editorStateManager = initializeEditorStateManager(state);
      const temporaryStateManager = initializeTemporayStateManager<OptionsListSelection>();
      const selectionsManager = initializeSelectionsManager(state);

      const dataControlManager: DataControlStateManager =
        await initializeDataControlManager<EditorState>({
          controlId: uuid,
          controlType: OPTIONS_LIST_CONTROL,
          typeDisplayName: OptionsListStrings.control.getDisplayName(),
          state,
          parentApi,
          willHaveInitialFilter: selectionsManager.internalApi.hasInitialSelections,
          getInitialFilter: (dataView) => buildFilter(dataView, uuid, state),
          editorStateManager,
        });

      const selectionsSubscription = selectionsManager.anyStateChange$.subscribe(
        dataControlManager.internalApi.onSelectionChange
      );
      /** Handle loading state; since suggestion fetching and validation are tied, only need one loading subject */
      const loadingSuggestions$ = new BehaviorSubject<boolean>(false);
      const dataLoadingSubscription = combineLatest([
        loadingSuggestions$,
        dataControlManager.api.dataLoading$,
      ])
        .pipe(
          debounceTime(100), // debounce set loading so that it doesn't flash as the user types
          map((values) => values.some((value) => value))
        )
        .subscribe((isLoading) => {
          temporaryStateManager.api.setDataLoading(isLoading);
        });

      /** Debounce the search string changes to reduce the number of fetch requests */
      const debouncedSearchString = temporaryStateManager.api.searchString$.pipe(debounceTime(100));

      /** Validate the search string as the user types */
      const validSearchStringSubscription = combineLatest([
        debouncedSearchString,
        dataControlManager.api.field$,
        editorStateManager.api.searchTechnique$,
      ]).subscribe(([newSearchString, field, searchTechnique]) => {
        temporaryStateManager.api.setSearchStringValid(
          isValidSearch({
            searchString: newSearchString,
            fieldType: field?.type,
            searchTechnique,
          })
        );
      });

      /** Clear state when the field changes */
      const fieldChangedSubscription = combineLatest([
        dataControlManager.api.fieldName$,
        dataControlManager.api.dataViewId$,
        dataControlManager.api.valuesSource$,
      ])
        .pipe(
          filter(([, , valuesSource]) => valuesSource === ControlValuesSource.FIELD),
          distinctUntilChanged(
            ([fieldNameA, dataViewIdA], [fieldNameB, dataViewIdB]) =>
              fieldNameA === fieldNameB && dataViewIdA === dataViewIdB
          ),
          skip(1) // skip first, since this represents initialization
        )
        .subscribe(() => {
          temporaryStateManager.api.setSearchString('');
          selectionsManager.api.setSelectedOptions(DEFAULT_DSL_OPTIONS_LIST_STATE.selected_options);
          selectionsManager.api.setExistsSelected(false);
          selectionsManager.api.setExclude(false);
          selectionsManager.api.setSort(DEFAULT_DSL_OPTIONS_LIST_STATE.sort);
          temporaryStateManager.api.setRequestSize(MIN_OPTIONS_LIST_REQUEST_SIZE);
        });

      /** Fetch the suggestions and perform validation */
      const suggestionLoadError$ = new BehaviorSubject<Error | undefined>(undefined);
      const loadMoreSubject = new Subject<void>();
      const fetchSubscription = fetchAndValidate$({
        api: {
          ...dataControlManager.api,
          loadMoreSubject,
          loadingSuggestions$,
          debouncedSearchString,
          parentApi,
          uuid,
        },
        requestSize$: temporaryStateManager.api.requestSize$,
        runPastTimeout$: editorStateManager.api.runPastTimeout$,
        selectedOptions$: selectionsManager.api.selectedOptions$,
        searchTechnique$: editorStateManager.api.searchTechnique$,
        sort$: selectionsManager.api.sort$,
      }).subscribe((result) => {
        // if there was an error during fetch, set suggestion load error and return early
        if (Object.hasOwn(result, 'error')) {
          suggestionLoadError$.next((result as { error: Error }).error);
          return;
        } else if (suggestionLoadError$.getValue()) {
          // otherwise,  if there was a previous error, clear it
          suggestionLoadError$.next(undefined);
        }

        // fetch was successful so set all attributes from result
        const successResponse = result as OptionsListSuccessResponse;
        temporaryStateManager.api.setAvailableOptions(successResponse.suggestions);
        temporaryStateManager.api.setTotalCardinality(successResponse.totalCardinality);
        temporaryStateManager.api.setInvalidSelections(
          new Set(successResponse.invalidSelections ?? [])
        );

        // reset the request size back to the minimum (if it's not already)
        if (temporaryStateManager.api.requestSize$.getValue() !== MIN_OPTIONS_LIST_REQUEST_SIZE) {
          temporaryStateManager.api.setRequestSize(MIN_OPTIONS_LIST_REQUEST_SIZE);
        }
      });

      /** Remove all other selections if this control becomes a single select */
      const singleSelectSubscription = editorStateManager.api.singleSelect$
        .pipe(filter((singleSelect) => Boolean(singleSelect)))
        .subscribe(() => {
          const currentSelections = selectionsManager.api.selectedOptions$.getValue() ?? [];
          if (currentSelections.length > 1)
            selectionsManager.api.setSelectedOptions([currentSelections[0]]);
        });

      const hasSelections$ = new BehaviorSubject<boolean>(
        Boolean(state.selected_options?.length || state.exists_selected)
      );
      const hasSelectionsSubscription = combineLatest([
        selectionsManager.api.selectedOptions$,
        selectionsManager.api.existsSelected$,
      ])
        .pipe(
          map(([selectedOptions, existsSelected]) => {
            return Boolean(selectedOptions?.length || existsSelected);
          }),
          distinctUntilChanged()
        )
        .subscribe((hasSelections) => {
          hasSelections$.next(hasSelections);
        });

      /** Output filters when selections and/or filter meta data changes */
      const sectionId$ = apiHasSections(parentApi) ? parentApi.panelSection$(uuid) : of(undefined);

      const outputFilterSubscription = combineLatest([
        dataControlManager.api.dataViews$,
        dataControlManager.api.fieldName$,
        selectionsManager.api.selectedOptions$,
        selectionsManager.api.existsSelected$,
        selectionsManager.api.exclude$,
        sectionId$,
      ])
        .pipe(debounceTime(0))
        .subscribe(
          ([dataViews, fieldName, selectedOptions, existsSelected, exclude, sectionId]) => {
            const dataView = dataViews?.[0];
            if (!dataView) return;

            const newFilter = buildFilter(dataView, uuid, {
              field_name: fieldName,
              selected_options: selectedOptions,
              exists_selected: existsSelected,
              exclude,
              sectionId,
            });
            dataControlManager.internalApi.setOutputFilter(newFilter);
          }
        );

      const stateApi = initializeStateApi<OptionsListDSLControlState>({
        uuid,
        parentApi,
        serializeState: (): OptionsListDSLControlState => ({
          ...dataControlManager.getLatestState(),
          ...selectionsManager.getLatestState(),
          ...editorStateManager.getLatestState(),
          // serialize state that cannot be changed to keep it consistent
          display_settings: state.display_settings,
        }),
        anyStateChange$: merge(
          dataControlManager.anyStateChange$,
          selectionsManager.anyStateChange$,
          editorStateManager.anyStateChange$
        ).pipe(map(() => undefined)),
        getComparators: () => {
          return {
            ...defaultDataControlComparators,
            ...selectionComparators,
            ...editorComparators,
            // This state cannot currently be changed after the control is created
            display_settings: 'skip',
          };
        },
        defaultState: {
          search_technique: DEFAULT_DSL_OPTIONS_LIST_STATE.search_technique,
          sort: DEFAULT_DSL_OPTIONS_LIST_STATE.sort,
          exclude: false,
          exists_selected: false,
        },
        applySerializedState: (nextState) => {
          const normalizedState = normalizeEsqlSort(nextState);
          dataControlManager.reinitializeState(normalizedState);
          selectionsManager.reinitializeState(normalizedState);
          editorStateManager.reinitializeState(normalizedState);
        },
      });

      const relatedPanelsApi = initializeRelatedPanels({
        uuid,
        parentApi,
        ...panelIsRelatedByGlobalFilters(dataControlManager.api.useGlobalFilters$),
      });

      const blockingError$ = new BehaviorSubject<Error | undefined>(undefined);
      const errorsSubscription = combineLatest([
        dataControlManager.api.blockingError$,
        suggestionLoadError$,
      ])
        .pipe(
          map(([controlError, suggestionError]) => {
            return controlError ?? suggestionError;
          })
        )
        .subscribe((error) => blockingError$.next(error));

      const api = finalizeApi({
        ...stateApi,
        ...dataControlManager.api,
        ...relatedPanelsApi,
        blockingError$,
        dataLoading$: temporaryStateManager.api.dataLoading$,
        getTypeDisplayName: OptionsListStrings.control.getDisplayName,
        clearSelections: () => clearSelections({ selectionsManager, temporaryStateManager }),
        hasSelections$: hasSelections$ as PublishingSubject<boolean | undefined>,
        setSelectedOptions: selectionsManager.api.setSelectedOptions,
      });

      const componentApi: DSLOptionsListComponentApi = {
        ...api,
        ...editorStateManager.api,
        ...selectionsManager.api,
        ...temporaryStateManager.api,
        loadMoreSubject,
        deselectOption: (key) =>
          deselectOption({ api, selectionsManager, temporaryStateManager, key }),
        makeSelection: (key: string | undefined, showOnlySelected: boolean) =>
          makeSelection({
            api,
            selectionsManager,
            temporaryStateManager,
            editorStateManager,
            key,
            showOnlySelected,
          }),
        selectAll: (keys: string[]) => selectAll({ api, keys, selectionsManager }),
        deselectAll: (keys: string[]) => deselectAll({ api, keys, selectionsManager }),
      };

      const isPinned = apiHasPinnedPanels(parentApi) ? parentApi.panelIsPinned(uuid) : false;

      return {
        api,
        Component: () => {
          useEffect(() => {
            return () => {
              // on unmount, clean up all subscriptions
              dataLoadingSubscription.unsubscribe();
              fetchSubscription.unsubscribe();
              fieldChangedSubscription.unsubscribe();
              outputFilterSubscription.unsubscribe();
              singleSelectSubscription.unsubscribe();
              validSearchStringSubscription.unsubscribe();
              hasSelectionsSubscription.unsubscribe();
              selectionsSubscription.unsubscribe();
              errorsSubscription.unsubscribe();

              dataControlManager.cleanup();
            };
          }, []);

          return (
            <OptionsListControlContext.Provider
              value={{
                componentApi,
                displaySettings: state.display_settings ?? {},
              }}
            >
              <OptionsListControl isPinned={isPinned} />
            </OptionsListControlContext.Provider>
          );
        },
      };
    },
  };
};
