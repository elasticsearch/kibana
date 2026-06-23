/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { pick } from 'lodash';
import React, { useEffect } from 'react';
import { BehaviorSubject, combineLatest, map, merge } from 'rxjs';
import { ESQL_CONTROL } from '@kbn/controls-constants';
import type { OptionsListESQLControlState } from '@kbn/controls-schemas';
import type { EmbeddablePublicDefinition } from '@kbn/embeddable-plugin/public';
import {
  apiPublishesESQLVariables,
  ESQLVariableType,
  isStaticESQLControl,
  type QueryESQLControl,
  type StaticESQLControl,
} from '@kbn/esql-types';
import {
  apiHasPinnedPanels,
  apiPublishesChildren,
  apiPublishesESQLQuery,
  initializeRelatedPanels,
  initializeStateApi,
  type StateComparators,
} from '@kbn/presentation-publishing';
import { getESQLQueryVariables } from '@kbn/esql-utils';

import { uiActionsService } from '../../services/kibana_services';
import { defaultControlLabelComparators, initializeLabelManager } from '../control_labels';
import { OptionsListControl } from '../data_controls/options_list_control/components/options_list_control';
import { OptionsListControlContext } from '../data_controls/options_list_control/options_list_context_provider';
import { VariableControlsStrings } from './constants';
import { panelIsRelatedByEsqlVariable } from './panel_is_related_by_esql_variable';
import { getSelectionComparators, initializeESQLControlManager } from './esql_control_manager';
import {
  type ESQLControlApi,
  type ESQLOptionsListComponentApi,
  type ESQLOptionsListRuntimeState,
} from './types';
import { getTooltipTitle } from './utils/get_tooltip_title';
import { getPlacementHints, LAYOUT_CONSTRAINTS } from '../constants';

export const getESQLControlFactory = <
  State extends OptionsListESQLControlState = OptionsListESQLControlState
>(): EmbeddablePublicDefinition<
  State extends { control_type: 'STATIC_VALUES' } ? StaticESQLControl : QueryESQLControl,
  ESQLControlApi<State>
> => {
  return {
    type: ESQL_CONTROL,
    getPlacementHints,
    layoutConstraints: LAYOUT_CONSTRAINTS,
    buildEmbeddable: async ({ initialState, finalizeApi, uuid, parentApi }) => {
      const state = initialState;

      const dataLoading$ = new BehaviorSubject<boolean | undefined>(false);
      const setDataLoading = (loading: boolean | undefined) => dataLoading$.next(loading);

      const selections = initializeESQLControlManager(uuid, parentApi, state, setDataLoading);
      const labelManager = initializeLabelManager(
        { title: initialState.title, variableName: initialState.variable_name },
        selections.internalApi,
        'variableName'
      );

      const tooltipLabel$ = new BehaviorSubject<string>(state.title ?? '');
      const tooltipLabelSubscription = combineLatest([
        selections.api.esqlVariable$,
        labelManager.api.label$,
      ])
        .pipe(
          map(([{ key: variableName, type: variableType }, label]) => {
            return getTooltipTitle(variableName, variableType, label);
          })
        )
        .subscribe((next) => tooltipLabel$.next(next));

      const stateApi = initializeStateApi<typeof initialState>({
        uuid,
        parentApi,
        serializeState: () =>
          ({
            ...selections.getLatestState(),
            ...labelManager.getLatestState(),
          } as typeof initialState),
        anyStateChange$: merge(labelManager.anyStateChange$, selections.anyStateChange$),
        getComparators: () => {
          return {
            ...getSelectionComparators(state.control_type),
            ...defaultControlLabelComparators,
            display_settings: 'skip',
          } as StateComparators<typeof initialState>;
        },
        applySerializedState: (nextState) => {
          selections.reinitializeState({
            available_options: [],
            ...nextState,
          } as ESQLOptionsListRuntimeState);
          labelManager.reinitializeState(nextState);
        },
      });

      const relatedPanelsApi = initializeRelatedPanels({
        uuid,
        parentApi,
        ...panelIsRelatedByEsqlVariable({
          esqlVariable$: selections.api.esqlVariable$,
        }),
      });

      const api = finalizeApi({
        ...stateApi,
        ...selections.api,
        ...labelManager.api,
        ...relatedPanelsApi,
        dataLoading$,
        isExpandable: false,
        isCustomizable: false,
        /**
         * TODO: Remove isDuplicable: false once duplicating ES|QL controls has been implemented
         * ES|QL controls can only output unique variable names, so in order to duplicate the control,
         * we would need to add a number or other uniquifying character to the end of the variable name.
         * The problem with this is that the user cannot edit variable names after the control is created.
         * Once we come up with a good UX solution to this, we can remove this
         */
        isDuplicable: false,
        isPinnable: true,
        canIndicateRelatedSiblings: true,
        tooltipLabel$,
        isEditingEnabled: () => true,
        getTypeDisplayName: () => VariableControlsStrings.displayName,
        onEdit: async () => {
          const nextState = {
            ...selections.getLatestState(),
            ...labelManager.getLatestState(),
          };
          const variablesInParent = apiPublishesESQLVariables(api.parentApi)
            ? api.parentApi.esqlVariables$.value
            : [];
          const onSaveControl = async (updatedState: ESQLOptionsListRuntimeState) => {
            selections.reinitializeState(updatedState);
            labelManager.reinitializeState(updatedState);
          };

          try {
            await uiActionsService.executeTriggerActions('ESQL_CONTROL_TRIGGER', {
              queryString: isStaticESQLControl(nextState)
                ? getRelatedStaticQuery(
                    nextState.variable_type as ESQLVariableType,
                    parentApi,
                    selections.api.esqlVariable$.getValue().key,
                    relatedPanelsApi.relatedPanels$
                  )
                : nextState.esql_query,
              variableType: nextState.variable_type,
              controlType: nextState.control_type,
              esqlVariables: variablesInParent,
              onSaveControl,
              parentApi,
              initialState: nextState,
              controlId: uuid,
            });
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Error getting ESQL control trigger', e);
          }
        },
      }) as ESQLControlApi<State>;

      const componentApi: ESQLOptionsListComponentApi = {
        ...pick(api, [
          'dataLoading$',
          'label$',
          'type',
          'parentApi',
          'tooltipLabel$',
          'relatedPanels$',
          'canIndicateRelatedSiblings',
        ]),
        ...selections.internalApi,
        uuid,
        setDataLoading,

        makeSelection(key?: string) {
          if (!key) return;
          const singleSelect = selections.api.singleSelect$.value;
          if (singleSelect) {
            selections.internalApi.setSelectedOptions([key]);
          } else {
            // Get current selection state, not initial state
            const current = componentApi.selectedOptions$.value || [];
            const isSelected = current.includes(key);
            // Don't allow empty selections until "ANY" value is supported: https://github.com/elastic/elasticsearch/issues/136735
            if (isSelected && current.length === 1) {
              return;
            }
            const newSelection = isSelected ? current.filter((k) => k !== key) : [...current, key];
            selections.internalApi.setSelectedOptions(newSelection);
          }
        },
        // Pass no-ops and default values for all of the features of OptionsList that ES|QL controls don't currently use
        singleSelect$: selections.api.singleSelect$,
        invalidSelections$: selections.internalApi.invalidSelections$,
        deselectOption: (key?: string) => {
          const incompatibleSelections = selections.internalApi.invalidSelections$.value;
          const isIncompatible = key ? incompatibleSelections.has(key) : false;
          if (isIncompatible) {
            // remove from incompatible selections
            const newIncompatibleSelections = new Set(incompatibleSelections);
            newIncompatibleSelections.delete(key!);
            selections.internalApi.setInvalidSelections(newIncompatibleSelections);

            // remove from selected options
            const currentSelected = componentApi.selectedOptions$.value || [];
            const newSelected = currentSelected.filter((option) => option !== key);
            selections.internalApi.setSelectedOptions(newSelected);
          }
        },
        selectAll: (keys: string[]) => {
          selections.internalApi.setSelectedOptions(keys);
        },
        deselectAll: () => {
          // Don't allow empty selections until "ANY" value is supported: https://github.com/elastic/elasticsearch/issues/136735
        },
      };

      const isPinned = apiHasPinnedPanels(parentApi) ? parentApi.panelIsPinned(uuid) : false;

      return {
        api,
        Component: () => {
          useEffect(() => {
            return () => {
              selections.cleanup();
              labelManager.cleanup();
              tooltipLabelSubscription.unsubscribe();
            };
          }, []);

          return (
            <OptionsListControlContext.Provider
              value={{
                componentApi,
                displaySettings: {
                  hide_action_bar: false,
                  hide_exclude: true,
                  hide_exists: true,
                  hide_sort: true,
                  placeholder: VariableControlsStrings.emptySelectionPlaceholder,
                },
                customStrings: {
                  invalidSelectionsLabel: VariableControlsStrings.getIncompatibleSelectionsLabel(
                    componentApi.invalidSelections$.value.size
                  ),
                },
              }}
            >
              <OptionsListControl
                // Don't allow empty selections until "ANY" value is supported: https://github.com/elastic/elasticsearch/issues/136735
                disableMultiValueEmptySelection={true}
                isPinned={isPinned}
              />
            </OptionsListControlContext.Provider>
          );
        },
      };
    },
  };
};

function getRelatedStaticQuery(
  variableType: ESQLVariableType,
  parentApi: unknown,
  variableKey: string,
  relatedPanels$: BehaviorSubject<string[]>
): string {
  /**
   * For non-field type static controls, we do not populate suggestions based on another query
   */
  if (variableType !== ESQLVariableType.FIELDS) return '';

  /**
   * For static ??field controls, we need to know which query to pull suggestions from
   */
  const getRelatedQuery = (_api: unknown) => {
    const query = apiPublishesESQLQuery(_api) ? _api.query$.getValue().esql : undefined;
    return query && getESQLQueryVariables(query).includes(variableKey) ? query : undefined;
  };

  const parentQuery = getRelatedQuery(parentApi); // check if parent API publishes a related query
  if (!parentQuery && apiPublishesChildren(parentApi)) {
    // the parent API does not publish a related query, so check all related children
    for (const panel of relatedPanels$.getValue()) {
      const child = parentApi.children$.getValue()[panel];
      const childQuery = getRelatedQuery(child);
      if (childQuery) {
        // found a child with a query that references this variable, so return it;
        // only one query can be used to build suggestions
        return childQuery;
      }
    }
  }
  return parentQuery ?? '';
}
