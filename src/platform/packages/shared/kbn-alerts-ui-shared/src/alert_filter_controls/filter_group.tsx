/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import {
  ControlGroupRenderer,
  type ControlGroupRendererProps,
  type ControlGroupRendererApi,
  type ControlGroupRuntimeState,
  type ControlGroupStateBuilder,
  type ControlStateTransform,
} from '@kbn/control-group-renderer';
import { controlGroupStateBuilder } from '@kbn/control-group-renderer/src/control_group_state_builder';
import type { Filter } from '@kbn/es-query';
import { buildEsQuery } from '@kbn/es-query';
import { OPTIONS_LIST_CONTROL } from '@kbn/controls-constants';
import { debounce, isEqual, isEqualWith } from 'lodash';
import type { PropsWithChildren } from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AddControl, SaveControls } from './buttons';
import { COMMON_OPTIONS_LIST_CONTROL_INPUTS, TEST_IDS, TIMEOUTS, URL_PARAM_KEY } from './constants';
import { FilterGroupContextMenu } from './context_menu';
import { FilterGroupContext } from './filter_group_context';
import { FiltersChangedBanner } from './filters_changed_banner';
import { useControlGroupSyncToLocalStorage } from './hooks/use_control_group_sync_to_local_storage';
import { useViewEditMode } from './hooks/use_view_edit_mode';
import { FilterGroupLoading } from './loading';
import { URL_PARAM_ARRAY_EXCEPTION_MSG } from './translations';
import type { FilterControlConfig, FilterGroupProps } from './types';
import {
  getFilterControlsComparator,
  getFilterItemObjListFromControlState,
  mergeControls,
  reorderControlsWithDefaultControls,
} from './utils';

export const FilterGroup = (props: PropsWithChildren<FilterGroupProps>) => {
  const {
    dataViewId,
    onFiltersChange,
    timeRange,
    filters,
    query,
    defaultControls,
    spaceId,
    onInit,
    controlsUrlState,
    setControlsUrlState,
    maxControls = Infinity,
    Storage,
    ruleTypeIds,
    storageKey,
    disableLocalStorageSync = false,
  } = props;
  const [urlStateInitialized, setUrlStateInitialized] = useState(false);
  const [controlsFromUrl, setControlsFromUrl] = useState(controlsUrlState ?? []);

  const defaultControlsObj = useMemo(
    () =>
      defaultControls.reduce<Record<string, (typeof defaultControls)[0]>>((prev, current) => {
        prev[current.field_name] = current;
        return prev;
      }, {}),
    [defaultControls]
  );

  const [controlGroup, setControlGroup] = useState<ControlGroupRendererApi>();

  const localStoragePageFilterKey = useMemo(
    () => storageKey ?? `${ruleTypeIds.join(',')}.${spaceId}.${URL_PARAM_KEY}`,
    [ruleTypeIds, spaceId, storageKey]
  );

  const currentFiltersRef = useRef<Filter[]>();

  const {
    isViewMode,
    hasPendingChanges,
    pendingChangesPopoverOpen,
    closePendingChangesPopover,
    openPendingChangesPopover,
    switchToViewMode,
    switchToEditMode,
    setHasPendingChanges,
    filterGroupMode,
  } = useViewEditMode({});

  const {
    controlGroupState: controlGroupStateUpdates,
    setControlGroupState: setControlGroupStateUpdates,
    getStoredControlGroupState: getStoredControlState,
  } = useControlGroupSyncToLocalStorage({
    Storage,
    storageKey: localStoragePageFilterKey,
    shouldSync: !disableLocalStorageSync && isViewMode,
  });

  useEffect(() => {
    if (controlGroupStateUpdates) {
      const formattedFilters = getFilterItemObjListFromControlState(controlGroupStateUpdates);
      if (!formattedFilters) return;
      if (!isViewMode) return;
      setControlsUrlState?.(formattedFilters);
    }
  }, [controlGroupStateUpdates, setControlsUrlState, isViewMode]);

  const [showFiltersChangedBanner, setShowFiltersChangedBanner] = useState(false);

  const urlDataApplied = useRef<boolean>(false);

  const { filters: validatedFilters, query: validatedQuery } = useMemo(() => {
    try {
      buildEsQuery(
        { fields: [], title: '' },
        query ? [query] : [],
        filters?.filter((f) => f.meta.disabled === false) ?? [],
        {
          nestedIgnoreUnmapped: true,
          dateFormatTZ: undefined,
        }
      );
    } catch (e) {
      // We only need to handle kqlError because control group can handle Lucene error
      // Based on the behaviour from other components, ignore all filters and queries
      // if there is some error in the input filters and queries
      return {
        filters: [],
        query: undefined,
      };
    }
    return {
      filters,
      query,
    };
  }, [filters, query]);

  const handleStateUpdates = useCallback(
    (newState: ControlGroupRuntimeState) => {
      if (isEqual(getStoredControlState(), newState)) {
        return;
      }
      if (
        !isEqual(
          newState?.initialChildControlState,
          getStoredControlState()?.initialChildControlState
        ) &&
        !isViewMode
      ) {
        setHasPendingChanges(true);
      }
      setControlGroupStateUpdates(newState);
    },
    [setControlGroupStateUpdates, getStoredControlState, isViewMode, setHasPendingChanges]
  );

  const handleOutputFilterUpdates = useCallback(
    (newFilters: Filter[] | undefined) => {
      if (isEqual(currentFiltersRef.current, newFilters)) return;
      if (onFiltersChange) onFiltersChange(newFilters ?? []);
      currentFiltersRef.current = newFilters ?? [];
    },
    [onFiltersChange]
  );

  const debouncedFilterUpdates = useMemo(
    () => debounce(handleOutputFilterUpdates, TIMEOUTS.FILTER_UPDATES_DEBOUNCE_TIME),
    [handleOutputFilterUpdates]
  );

  const initializeUrlState = useCallback(() => {
    try {
      if (!Array.isArray(controlsUrlState)) {
        throw new Error(URL_PARAM_ARRAY_EXCEPTION_MSG);
      }
      const storedControlGroupState = getStoredControlState();
      if (storedControlGroupState) {
        const panelsFormatted = getFilterItemObjListFromControlState(storedControlGroupState);
        if (
          controlsUrlState.length &&
          !isEqualWith(
            panelsFormatted,
            controlsUrlState,
            getFilterControlsComparator('field_name', 'title')
          )
        ) {
          setShowFiltersChangedBanner(true);
          switchToEditMode();
        }
      }
      setControlsFromUrl(controlsUrlState);
    } catch (err) {
      // if there is an error ignore url Param
      // eslint-disable-next-line no-console
      console.error(err);
    }
    setUrlStateInitialized(true);
  }, [controlsUrlState, getStoredControlState, switchToEditMode]);

  useEffect(() => {
    if (!controlGroup) {
      return;
    }
    const filterSubscription = controlGroup.appliedFilters$.subscribe({
      next: debouncedFilterUpdates,
    });
    return () => {
      filterSubscription.unsubscribe();
    };
  }, [controlGroup, debouncedFilterUpdates]);

  useEffect(() => {
    if (!controlGroup) {
      return;
    }

    const inputSubscription = controlGroup.getInput$().subscribe({
      next: handleStateUpdates,
    });

    return () => {
      inputSubscription.unsubscribe();
    };
  }, [controlGroup, handleStateUpdates]);

  useEffect(() => {
    if (controlsUrlState && !urlStateInitialized) {
      initializeUrlState();
    }
  }, [controlsUrlState, initializeUrlState, urlStateInitialized]);

  const onControlGroupLoadHandler = useCallback(
    (controlGroupRendererApi: ControlGroupRendererApi | undefined) => {
      if (!controlGroupRendererApi) return;
      if (onInit) onInit(controlGroupRendererApi);
      setControlGroup(controlGroupRendererApi);
    },
    [onInit]
  );

  const selectControlsWithPriority = useCallback(() => {
    /*
     *
     * Below is the priority of how controls are fetched.
     *  1. URL
     *  2. If not found in URL, see in Localstorage
     *  3. If not found in Localstorage, defaultControls are assigned
     *
     * */

    let controlsFromLocalStorage: FilterControlConfig[] = [];
    const storedControlGroupState = getStoredControlState();
    if (storedControlGroupState) {
      controlsFromLocalStorage = getFilterItemObjListFromControlState(storedControlGroupState);
    }
    let overridingControls = mergeControls({
      controlsWithPriority: [controlsFromUrl, controlsFromLocalStorage],
      defaultControlsObj,
    });

    if (!overridingControls || overridingControls.length === 0) return defaultControls;

    overridingControls = overridingControls.map((item) => {
      return {
        // give default value to params which are coming from the URL
        field_name: item.field_name,
        title: item.title,
        selected_options: item.selected_options ?? [],
        exists_selected: item.exists_selected ?? false,
        exclude: item.exclude,
      };
    });

    return reorderControlsWithDefaultControls({
      controls: overridingControls,
      defaultControls,
    });
  }, [getStoredControlState, controlsFromUrl, defaultControlsObj, defaultControls]);

  const getCreationOptions: ControlGroupRendererProps['getCreationOptions'] = useCallback(
    async (defaultState, { addOptionsListControl }: ControlGroupStateBuilder) => {
      const initialState: ControlGroupRuntimeState = {
        ...defaultState,
        ignoreParentSettings: {
          ignoreValidations: true,
        },
      };
      const finalControls = selectControlsWithPriority();
      urlDataApplied.current = true;

      finalControls.forEach((control, idx) => {
        addOptionsListControl(
          initialState,
          {
            ...COMMON_OPTIONS_LIST_CONTROL_INPUTS,
            // option List controls will handle an invalid dataview
            // & display an appropriate message
            data_view_id: dataViewId ?? '',
            ...control,
            display_settings: {
              ...COMMON_OPTIONS_LIST_CONTROL_INPUTS.display_settings,
              ...control.display_settings,
            },
          },
          String(idx)
        );
      });
      return {
        initialState,
        getEditorConfig: () => {
          return {
            defaultDataViewId: dataViewId ?? undefined,
            hideDataViewSelector: true,
            hideAdditionalSettings: true,
            hideValuesSourceSelector: true,
            fieldFilterPredicate: (f) => f.type !== 'number',
          };
        },
      };
    },
    [dataViewId, selectControlsWithPriority]
  );

  const discardChangesHandler = useCallback(async () => {
    if (hasPendingChanges) {
      controlGroup?.updateInput({
        initialChildControlState: getStoredControlState()?.initialChildControlState,
      });
    }
    switchToViewMode();
    setShowFiltersChangedBanner(false);
  }, [controlGroup, switchToViewMode, getStoredControlState, hasPendingChanges]);

  const upsertPersistableControls = useCallback(async () => {
    if (!controlGroup) return;
    const currentPanels = getFilterItemObjListFromControlState(controlGroup.getInput());

    const reorderedControls = reorderControlsWithDefaultControls({
      controls: currentPanels,
      defaultControls,
    });

    if (!isEqualWith(reorderedControls, currentPanels, getFilterControlsComparator('field_name'))) {
      // reorder only if fields are in different order
      // or not same.
      const newInput = { initialChildControlState: {} };
      reorderedControls.forEach((control, idx) => {
        controlGroupStateBuilder.addOptionsListControl(
          newInput,
          {
            title: control.title,
            ...COMMON_OPTIONS_LIST_CONTROL_INPUTS,
            // option List controls will handle an invalid dataview
            // & display an appropriate message
            data_view_id: dataViewId ?? '',
            selected_options: control.selected_options,
            ...control,
            display_settings: {
              ...COMMON_OPTIONS_LIST_CONTROL_INPUTS.display_settings,
              ...control.display_settings,
            },
          },
          String(idx)
        );
      });
      controlGroup?.updateInput(newInput);
    }
  }, [controlGroup, dataViewId, defaultControls]);

  const saveChangesHandler = useCallback(async () => {
    await upsertPersistableControls();
    switchToViewMode();
    setShowFiltersChangedBanner(false);
  }, [switchToViewMode, upsertPersistableControls]);

  const newControlStateTransform: ControlStateTransform = useCallback(
    (newInput, controlType) => {
      // for any new controls, we want to avoid
      // default placeholder
      let result = newInput;
      if (controlType === OPTIONS_LIST_CONTROL) {
        result = {
          ...newInput,
          ...COMMON_OPTIONS_LIST_CONTROL_INPUTS,
        };

        if (newInput.field_name && newInput.field_name in defaultControlsObj) {
          result = {
            ...result,
            ...defaultControlsObj[newInput.field_name],
            //  title should not be overridden by the initial controls, hence the hardcoding
            title: newInput.title ?? result.title,
          };
        }
      }
      return result;
    },
    [defaultControlsObj]
  );

  const addControlsHandler = useCallback(() => {
    controlGroup?.openAddDataControlFlyout({
      controlStateTransform: newControlStateTransform,
    });
  }, [controlGroup, newControlStateTransform]);

  if (!spaceId) {
    return <FilterGroupLoading />;
  }

  return (
    <FilterGroupContext.Provider
      value={{
        dataViewId: dataViewId ?? '',
        initialControls: defaultControls,
        isViewMode,
        controlGroup,
        controlGroupStateUpdates,
        hasPendingChanges,
        pendingChangesPopoverOpen,
        setHasPendingChanges,
        switchToEditMode,
        switchToViewMode,
        openPendingChangesPopover,
        closePendingChangesPopover,
        setShowFiltersChangedBanner,
        saveChangesHandler,
        discardChangesHandler,
      }}
    >
      <div className="filter-group__wrapper">
        <EuiFlexGroup alignItems="center" justifyContent="center" gutterSize="s">
          {Array.isArray(controlsFromUrl) ? (
            <EuiFlexItem grow={true} data-test-subj={TEST_IDS.FILTER_CONTROLS}>
              <ControlGroupRenderer
                onApiAvailable={onControlGroupLoadHandler}
                getCreationOptions={getCreationOptions}
                timeRange={timeRange}
                query={validatedQuery}
                filters={validatedFilters}
                viewMode={filterGroupMode}
              />
              {!controlGroup ? <FilterGroupLoading /> : null}
            </EuiFlexItem>
          ) : null}
          {!isViewMode && !showFiltersChangedBanner ? (
            <>
              <EuiFlexItem grow={false}>
                <AddControl
                  onClick={addControlsHandler}
                  isDisabled={
                    controlGroupStateUpdates &&
                    Object.values(controlGroupStateUpdates.initialChildControlState).length >=
                      maxControls
                  }
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <SaveControls onClick={saveChangesHandler} />
              </EuiFlexItem>
            </>
          ) : null}
          <EuiFlexItem grow={false}>
            <FilterGroupContextMenu />
          </EuiFlexItem>
        </EuiFlexGroup>
        {showFiltersChangedBanner ? (
          <>
            <EuiSpacer size="l" />
            <FiltersChangedBanner
              saveChangesHandler={saveChangesHandler}
              discardChangesHandler={discardChangesHandler}
            />
          </>
        ) : null}
      </div>
    </FilterGroupContext.Provider>
  );
};
