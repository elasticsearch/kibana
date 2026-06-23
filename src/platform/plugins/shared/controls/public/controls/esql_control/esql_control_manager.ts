/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import deepEqual from 'react-fast-compare';
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  filter,
  from,
  map,
  merge,
  of,
  skip,
  switchMap,
} from 'rxjs';

import type {
  OptionsListESQLControlState,
  OptionsListSearchTechnique,
  OptionsListSelection,
} from '@kbn/controls-schemas';
import type { AggregateQuery, TimeRange } from '@kbn/es-query';
import type { ESQLControlVariable, QueryESQLControl } from '@kbn/esql-types';
import {
  EsqlControlType,
  ESQLVariableType,
  isQueryESQLControl,
  isStaticESQLControl,
} from '@kbn/esql-types';
import { getESQLQueryVariables, hasStartEndParams } from '@kbn/esql-utils';
import {
  apiHasSections,
  fetch$,
  type PublishingSubject,
  type StateComparators,
} from '@kbn/presentation-publishing';

import {
  getESQLSingleColumnValues,
  type OptionsListSuggestions,
} from '../../../common/options_list';
import { dataService } from '../../services/kibana_services';
import { initializeTemporayStateManager } from '../data_controls/options_list_control/temporay_state_manager';
import type { ESQLOptionsListRuntimeState } from './types';
import { castESQLValue } from './utils/esql_type_utils';
import { getControlsTimezone } from '../utils';

function selectedOptionsComparatorFunction(a?: OptionsListSelection[], b?: OptionsListSelection[]) {
  return deepEqual(a ?? [], b ?? []);
}

type ComparatorsReturnType<ControlType = ESQLOptionsListRuntimeState['control_type']> =
  StateComparators<
    Pick<
      ESQLOptionsListRuntimeState,
      | 'selected_options'
      | 'variable_name'
      | 'single_select'
      | 'variable_type'
      | 'control_type'
      | 'title'
      | 'available_options'
    > &
      (ControlType extends EsqlControlType.STATIC_VALUES
        ? {}
        : Pick<QueryESQLControl, 'esql_query'>)
  >;

export const getSelectionComparators = <Type = ESQLOptionsListRuntimeState['control_type']>(
  controlType: Type
): ComparatorsReturnType<Type> => {
  return {
    selected_options: selectedOptionsComparatorFunction,
    variable_name: 'referenceEquality',
    variable_type: 'referenceEquality',
    title: 'referenceEquality',
    single_select: 'referenceEquality',
    control_type: 'skip', // static
    available_options: 'deepEquality',
    ...(controlType === EsqlControlType.VALUES_FROM_QUERY
      ? { esql_query: 'referenceEquality' }
      : {}),
  } as ComparatorsReturnType<Type>;
};

export function initializeESQLControlManager(
  uuid: string,
  parentApi: unknown,
  initialState: OptionsListESQLControlState,
  setDataLoading: (loading: boolean) => void
) {
  const sectionId$ = apiHasSections(parentApi) ? parentApi.panelSection$(uuid) : of(undefined);
  /** The control_type does not change during runtime, so it is safe to declare the type based on initial state */
  const isStaticControl = isStaticESQLControl(initialState);
  const isEsqlQueryControl = !isStaticControl;

  const availableOptions$ = new BehaviorSubject<string[]>(
    isStaticControl ? initialState.available_options ?? [] : []
  );
  const selectedOptions$ = new BehaviorSubject<string[]>(initialState.selected_options);
  const hasSelections$ = new BehaviorSubject<boolean>(false); // hardcoded to false to prevent clear action from appearing.
  const singleSelect$ = new BehaviorSubject<boolean>(initialState.single_select);
  const variableName$ = new BehaviorSubject<string>(initialState.variable_name);
  const variableType$ = new BehaviorSubject<ESQLVariableType>(
    initialState.variable_type as ESQLVariableType
  );
  const esqlQuery$ = new BehaviorSubject<string>(isEsqlQueryControl ? initialState.esql_query : '');
  let valuesColumnType: string | undefined;
  const totalCardinality$ = new BehaviorSubject<number>(
    isStaticControl ? initialState.available_options.length : 0
  );

  const searchString$ = new BehaviorSubject<string>('');
  const displayedAvailableOptions$ = new BehaviorSubject<OptionsListSuggestions<string>>(
    isStaticControl ? initialState.available_options.map((value) => ({ value })) : []
  );

  // Use it for incompatible suggestions
  const temporaryStateManager = initializeTemporayStateManager<string>();

  function setSearchString(next: string) {
    searchString$.next(next);
  }

  function setSelectedOptions(next: OptionsListSelection[] | undefined) {
    if (!next) return;
    const selected = next as string[];
    if (!selectedOptionsComparatorFunction(selectedOptions$.value, selected)) {
      selectedOptions$.next(selected);
    }
  }

  function haveVariablesValuesChanged(
    currentVariables: ESQLControlVariable[],
    previousVariables: ESQLControlVariable[],
    variablesInQuery: string[]
  ): boolean {
    if (variablesInQuery.length === 0) return false;

    for (const variableName of variablesInQuery) {
      const currentVariable = currentVariables.find((v) => v.key === variableName);
      const previousVariable = previousVariables.find((v) => v.key === variableName);

      if (!deepEqual(currentVariable?.value, previousVariable?.value)) {
        return true;
      }
    }
    return false;
  }

  // For Values From Query controls, update values on dashboard load/reload
  // or when dependencies change in case of chaining controls
  let previousESQLVariables: ESQLControlVariable[] = [];
  let previousTimeRange: TimeRange | undefined;
  let hasInitialFetch = false;
  let fetchAbortController = new AbortController();
  const fetchSubscription = isStaticControl
    ? undefined
    : fetch$({ uuid, parentApi })
        .pipe(
          filter(({ esqlVariables, timeRange }) => {
            if (hasStartEndParams(esqlQuery$.getValue()) && !timeRange) {
              return false;
            }
            const variablesInQuery = getESQLQueryVariables(esqlQuery$.getValue());
            const variablesInParent = esqlVariables || [];

            // Filter out this control's own variable
            const currentVariableName = variableName$.getValue();
            const externalVariables = variablesInParent.filter(
              (variable) => variable.key !== currentVariableName
            );

            // Check if timeRange has changed
            const timeRangeChanged = !deepEqual(previousTimeRange, timeRange);

            const shouldFetch =
              !hasInitialFetch ||
              timeRangeChanged ||
              haveVariablesValuesChanged(
                externalVariables,
                previousESQLVariables,
                variablesInQuery
              );

            if (shouldFetch) {
              previousESQLVariables = [...externalVariables];
              previousTimeRange = timeRange ? { ...timeRange } : undefined;
              hasInitialFetch = true;
            }

            return shouldFetch;
          }),
          switchMap(({ timeRange, esqlVariables }) => {
            fetchAbortController.abort();
            fetchAbortController = new AbortController();
            const { signal } = fetchAbortController;

            setDataLoading(true);
            const variablesInParent = esqlVariables || [];
            return from(
              getESQLSingleColumnValues({
                query: esqlQuery$.getValue(),
                search: dataService.search.search,
                signal,
                timeRange,
                esqlVariables: variablesInParent,
                timezone: getControlsTimezone(),
              })
            );
          })
        )
        .subscribe((result) => {
          setDataLoading(false);
          if (getESQLSingleColumnValues.isSuccess(result)) {
            valuesColumnType = result.column.type;
            const newAvailableOptions = result.values.map(
              // Coerce numeric columns into strings
              (value) => String(value)
            );
            availableOptions$.next(newAvailableOptions);

            // Check if current selections are still compatible
            const currentSelections = selectedOptions$.getValue() ?? [];
            const incompatibleSelections = new Set<string>();

            currentSelections.forEach((selection) => {
              if (!newAvailableOptions.includes(selection)) {
                incompatibleSelections.add(selection);
              }
            });

            // Update incompatible selections
            temporaryStateManager.api.setInvalidSelections(incompatibleSelections);
          }
        });

  // Filter the displayed available options by the current search string
  // TODO: Run this filtering server-side instead of client side; this just replicates the basic behavior
  // of a combo box dropdown for keyboard accessibility
  const availableOptionsSearchSubscription = combineLatest([searchString$, availableOptions$])
    .pipe(debounceTime(50))
    .subscribe(([searchString, availableOptions]) => {
      const displayOptions =
        availableOptions?.filter((option) =>
          option.toLowerCase().includes(searchString.toLowerCase())
        ) ?? [];
      displayedAvailableOptions$.next(displayOptions.map((value) => ({ value })));
      totalCardinality$.next(displayOptions.length);
    });

  // derive ESQL control variable from state.
  const getEsqlVariable = (sectionId?: string) => {
    const isSingleSelect = singleSelect$.value;
    const selectedValues = selectedOptions$.value;
    const columnType = isEsqlQueryControl ? valuesColumnType : undefined;

    // For single select, return the first value; for multi-select, return the array
    let value: ESQLControlVariable['value'];

    if (isSingleSelect) {
      // Single select: return the first value or empty string if none selected
      const firstValue = selectedValues[0];
      if (firstValue !== undefined) {
        value = castESQLValue(firstValue, columnType);
      } else {
        value = '';
      }
    } else {
      // Multi select: return array with numbers converted from strings when possible
      value = selectedValues.map((val) => castESQLValue(val, columnType));
    }

    return {
      key: variableName$.value,
      value,
      type: variableType$.value,
      meta: {
        controlledBy: uuid,
        ...(sectionId && { group: sectionId }),
      },
    };
  };

  const startingSection = apiHasSections(parentApi) ? parentApi.getPanelSection(uuid) : undefined;
  const esqlVariable$ = new BehaviorSubject<ESQLControlVariable>(getEsqlVariable(startingSection));
  const variableSubscriptions = combineLatest([
    sectionId$,
    variableName$,
    variableType$,
    selectedOptions$,
    availableOptions$,
    singleSelect$,
  ])
    .pipe(skip(1)) // esqlVariable$ is initialized above
    .subscribe(([sectionId]) => {
      const newVariables = getEsqlVariable(sectionId);
      if (!deepEqual(esqlVariable$.getValue(), newVariables))
        esqlVariable$.next(getEsqlVariable(sectionId));
    });

  const query$ = new BehaviorSubject<AggregateQuery>({
    esql: isEsqlQueryControl ? initialState.esql_query ?? '' : '',
  });
  const publishQuerySubscription = esqlQuery$.subscribe((esql) => {
    query$.next({ esql });
  });

  return {
    cleanup: () => {
      fetchAbortController.abort();
      variableSubscriptions.unsubscribe();
      fetchSubscription?.unsubscribe();
      availableOptionsSearchSubscription.unsubscribe();
      publishQuerySubscription.unsubscribe();
    },
    api: {
      hasSelections$: hasSelections$ as PublishingSubject<boolean | undefined>,
      esqlVariable$: esqlVariable$ as PublishingSubject<ESQLControlVariable>,
      singleSelect$: singleSelect$ as PublishingSubject<boolean>,
      query$,
    },
    anyStateChange$: merge(
      selectedOptions$.pipe(
        skip(1),
        map(() => undefined)
      ),
      availableOptions$.pipe(
        skip(1),
        map(() => undefined)
      ),
      variableName$.pipe(
        skip(1),
        map(() => undefined)
      ),
      singleSelect$.pipe(
        skip(1),
        map(() => undefined)
      ),
      variableType$.pipe(
        skip(1),
        map(() => undefined)
      ),
      esqlQuery$.pipe(
        skip(1),
        map(() => undefined)
      )
    ),
    reinitializeState: (lastSaved?: ESQLOptionsListRuntimeState) => {
      setSelectedOptions(lastSaved?.selected_options ?? []);
      variableName$.next(lastSaved?.variable_name ?? '');
      singleSelect$.next(lastSaved?.single_select ?? true);
      variableType$.next((lastSaved?.variable_type as ESQLVariableType) ?? ESQLVariableType.VALUES);
      valuesColumnType = undefined;
      temporaryStateManager.api.setInvalidSelections(new Set());
      previousESQLVariables = [];
      previousTimeRange = undefined;
      hasInitialFetch = false;
      availableOptions$.next(lastSaved?.available_options ?? []);
      esqlQuery$.next(isQueryESQLControl(lastSaved) ? lastSaved.esql_query : '');
    },
    getLatestState: (): OptionsListESQLControlState => {
      return {
        selected_options: selectedOptions$.getValue(),
        variable_name: variableName$.getValue(),
        single_select: singleSelect$.getValue(),
        variable_type: variableType$.getValue(),
        /** The control_type is static from creation */
        ...(isStaticControl
          ? {
              control_type: EsqlControlType.STATIC_VALUES,
              available_options: availableOptions$.getValue(),
            }
          : { control_type: EsqlControlType.VALUES_FROM_QUERY, esql_query: esqlQuery$.getValue() }),
      };
    },
    internalApi: {
      selectedOptions$,
      availableOptions$: displayedAvailableOptions$,
      totalCardinality$,
      setSelectedOptions,
      setSearchString,
      searchTechnique$: new BehaviorSubject<OptionsListSearchTechnique>('wildcard'),
      searchString$,
      searchStringValid$: new BehaviorSubject(true),
      invalidSelections$: temporaryStateManager.api.invalidSelections$,
      setInvalidSelections: temporaryStateManager.api.setInvalidSelections,
      variableName$,
    },
  };
}
