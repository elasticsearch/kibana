/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DEFAULT_AUTO_APPLY_SELECTIONS, DEFAULT_DATA_CONTROL_STATE } from '@kbn/controls-constants';
import { convertCamelCasedKeysToSnakeCase } from '@kbn/presentation-publishing';
import { get } from 'lodash';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';

export function extractPinnedPanelsState(state: { [key: string]: unknown }): {
  pinned_panels?: DashboardState['pinned_panels'];
  autoApplyFilters?: boolean;
} {
  /**
   * <=9.3, pinned panels **only ever** referred to controls; however, >9.3, we made it more generic
   * and stored them under `pinned_panels` to one day allow for other panel types
   */
  let pathToState; // >9.3 pinned_panels do not have any other state
  let pathToControls = 'pinned_panels'; // >9.3 pinned panels exported directly under pinned_panels
  if (state.controlGroupState && typeof state.controlGroupState === 'object') {
    // >8.16 to <=8.18 passed control group runtime state in with controlGroupState key
    pathToState = 'controlGroupState';
    pathToControls = 'controlGroupState.initialChildControlState';
  } else if (state.controlGroupInput && typeof state.controlGroupInput === 'object') {
    // <=9.3 controls exported as controlGroupInput
    pathToState = 'controlGroupInput';
    if ('panels' in state.controlGroupInput) {
      // <8.16 controls exported as panels
      pathToControls = 'controlGroupInput.panels';
    } else if ('controls' in state.controlGroupInput) {
      // >8.18 to <=9.3 controls exported as controls
      pathToControls = 'controlGroupInput.controls';
    }
  }

  const controls = pathToControls ? get(state, pathToControls) : undefined;
  let standardizedPinnedPanels: DashboardState['pinned_panels'] = [];
  if (Array.isArray(controls)) {
    // >8.18 controls are exported as an array without order
    standardizedPinnedPanels = controls.map((control) => {
      if ('controlConfig' in control) {
        // >8.18 to <9.4 controls had `config` stored under `controlConfig`
        const { controlConfig, ...rest } = control;
        control = { ...rest, config: controlConfig };
      }
      // < 9.4 `id` is stored as `uid`
      if (control.uid) {
        const { uid, ...rest } = control;
        control = { id: uid, ...rest };
      }
      return control; // otherwise, we are dealing with state >=9.4
    });
  } else if (controls !== null && typeof controls === 'object') {
    // <=8.18 controls were exported as an object with order
    standardizedPinnedPanels = Object.entries(controls)
      .sort(([, controlA], [, controlB]) => {
        return controlA.order - controlB.order;
      })
      .map(([controlId, control]) => {
        // <8.16 controls were exported with `explicitInput` instead of `config`
        if ('explicitInput' in control) {
          const { explicitInput, order, ...restOfControlState } = control;
          return {
            id: controlId,
            ...restOfControlState,
            config: explicitInput,
          };
        } else {
          // >=8.16 to <=8.18 controls were exported as flat objects for all configs
          const { grow, order, type, width, ...config } = control;
          return {
            id: controlId,
            type,
            ...(grow !== undefined && { grow }),
            ...(width !== undefined && { width }),
            config,
          };
        }
      }) as DashboardState['pinned_panels'];
  }

  function transformControlType(type: string) {
    if (type === 'timeSlider') {
      return 'time_slider_control';
    }

    if (type === 'rangeSliderControl') {
      return 'range_slider_control';
    }

    if (type === 'optionsListControl') {
      return 'options_list_control';
    }

    if (type === 'esqlControl') {
      return 'esql_control';
    }

    return type;
  }

  standardizedPinnedPanels = standardizedPinnedPanels.map((control) => ({
    ...control,
    type: transformControlType(control.type),
  })) as Required<DashboardState>['pinned_panels'];

  const controlState = pathToState ? get(state, pathToState) : null;
  let autoApplySelections: boolean | undefined;
  if (controlState !== null && typeof controlState === 'object') {
    let useGlobalFilters = DEFAULT_DATA_CONTROL_STATE.use_global_filters;
    let ignoreValidations = DEFAULT_DATA_CONTROL_STATE.ignore_validations;
    // >9.4 control group `ignoreParentSettings` gets translated to individual control settings
    if (
      'ignoreParentSettings' in controlState &&
      typeof controlState.ignoreParentSettings === 'object'
    ) {
      const ignoreParentSettings = controlState.ignoreParentSettings ?? {};
      const legacyIgnoreFilters = Boolean(
        ('ignoreFilters' in ignoreParentSettings && ignoreParentSettings.ignoreFilters) ||
          ('ignoreQuery' in ignoreParentSettings && ignoreParentSettings.ignoreQuery)
      );
      useGlobalFilters = !legacyIgnoreFilters;
      ignoreValidations = Boolean(
        'ignoreValidations' in ignoreParentSettings && ignoreParentSettings.ignoreValidations
      );
    }

    // >9.4 non-default control group `chainingSystem` gets translated to `useGlobalFilters`
    if (
      'chainingSystem' in controlState &&
      typeof controlState.chainingSystem === 'string' &&
      controlState.chainingSystem === 'NONE'
    ) {
      useGlobalFilters = false;
    }

    if (
      useGlobalFilters !== DEFAULT_DATA_CONTROL_STATE.use_global_filters ||
      ignoreValidations !== DEFAULT_DATA_CONTROL_STATE.ignore_validations
    ) {
      standardizedPinnedPanels = standardizedPinnedPanels.map((control) => {
        if (control.type === 'time_slider_control' || control.type === 'esql_control')
          return control;
        // these settings are only relevant for data controls
        return {
          ...control,
          config: {
            ...control.config,
            use_global_filters: useGlobalFilters,
            ignore_validations: ignoreValidations,
          },
        } as DashboardState['pinned_panels'][number];
      });
    }

    // >9.4 the `autoApplySelections` control group setting became the `autoApplyFilters` dashboard setting
    if (
      'autoApplySelections' in controlState &&
      typeof controlState.autoApplySelections === 'boolean'
    ) {
      autoApplySelections = controlState.autoApplySelections;
    } else if (
      'showApplySelections' in controlState &&
      typeof controlState.showApplySelections === 'boolean'
    ) {
      // <8.16 autoApplySelections exported as !showApplySelections
      autoApplySelections = !controlState.showApplySelections;
    }
  }

  // <9.4 convert camel cased control state to snake case
  standardizedPinnedPanels = standardizedPinnedPanels.map((panel) =>
    convertCamelCasedKeysToSnakeCase<DashboardState['pinned_panels'][number]>(panel)
  );

  const hasExplicitPinnedPanels =
    Object.hasOwn(state, 'pinned_panels') && Array.isArray(state.pinned_panels);

  return {
    autoApplyFilters:
      autoApplySelections !== DEFAULT_AUTO_APPLY_SELECTIONS ? autoApplySelections : undefined,
    pinned_panels:
      standardizedPinnedPanels.length || hasExplicitPinnedPanels
        ? standardizedPinnedPanels
        : undefined,
  };
}
