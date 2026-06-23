/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isEmpty, isEqual, pick } from 'lodash';
import type { ControlGroupRuntimeState } from '@kbn/control-group-renderer';
import type { OptionsListDSLControlState } from '@kbn/controls-schemas';
import { convertCamelCasedKeysToSnakeCase } from '@kbn/presentation-publishing';
import type { FilterControlConfig } from './types';

export const getPanelsInOrderFromControlsState = (controlState: ControlGroupRuntimeState) => {
  const panels = convertCamelCasedKeysToSnakeCase(controlState.initialChildControlState) ?? {};
  return Object.values(panels).sort((a, b) => a.order - b.order);
};

export const getFilterItemObjListFromControlState = (controlState: ControlGroupRuntimeState) => {
  const panels = getPanelsInOrderFromControlsState(controlState) as OptionsListDSLControlState[];
  return panels
    .filter((panel) => panel.field_name)
    .map((panel) => {
      const { field_name, selected_options, title, exists_selected, exclude, display_settings } =
        panel;
      return {
        field_name: field_name!,
        selected_options,
        // Without this check, adding new field filters (that don't have a title) causes the "Filters
        // changed" banner to show up indefinitely on every reload because rison strips `undefined`
        // values, causing a mismatch with the localStorage-derived config under lodash `isEqual`.
        ...(title !== undefined && { title }),
        exists_selected,
        exclude,
        display_settings: {
          hide_action_bar: display_settings?.hide_action_bar ?? false,
        },
      };
    });
};

interface MergableControlsArgs {
  /*
   * Set of controls that need be merged with priority
   * Set of controls with lower index take priority over the next one.
   *
   * Final set of controls is merged with the defaulControls
   *
   */
  controlsWithPriority: FilterControlConfig[][];
  defaultControlsObj: Record<string, FilterControlConfig>;
}

/*
 * mergeControls merges controls based on priority with the default controls
 *
 * @return undefined if all provided controls are empty
 * */
export const mergeControls = ({
  controlsWithPriority,
  defaultControlsObj,
}: MergableControlsArgs) => {
  const highestPriorityControlSet = controlsWithPriority.find((control) => !isEmpty(control));

  return highestPriorityControlSet?.map((singleControl) => {
    if (singleControl.field_name in defaultControlsObj) {
      return {
        ...defaultControlsObj[singleControl.field_name],
        ...singleControl,
      };
    }
    return singleControl;
  });
};

interface ReorderControlsArgs {
  /*
   * Ordered Controls
   *
   * */
  controls: FilterControlConfig[];
  /*
   * default controls in order
   * */
  defaultControls: FilterControlConfig[];
}

/**
 * reorderControlsWithPersistentControls reorders the controls such that controls which
 * are persistent in default controls should be upserted in given order
 *
 * */
export const reorderControlsWithDefaultControls = (args: ReorderControlsArgs) => {
  const { controls, defaultControls } = args;
  const controlsObject = controls.reduce((prev, current) => {
    prev[current.field_name] = current;
    return prev;
  }, {} as Record<string, FilterControlConfig>);

  const defaultControlsObj = defaultControls.reduce((prev, current) => {
    prev[current.field_name] = current;
    return prev;
  }, {} as Record<string, FilterControlConfig>);

  const resultDefaultControls: FilterControlConfig[] = defaultControls
    .filter((defaultControl) => defaultControl.persist)
    .map((defaultControl) => {
      return {
        ...defaultControl,
        ...(controlsObject[defaultControl.field_name] ?? {}),
      };
    });

  const resultNonPersitantControls = controls
    .filter(
      // filter out persisting controls since we have already taken
      // in account above
      (control) => !defaultControlsObj[control.field_name]?.persist
    )
    .map((control) => ({
      // insert some default properties from default controls
      // irrespective of whether they are persistent or not.
      ...(defaultControlsObj[control.field_name] ?? {}),
      ...control,
    }));

  return [...resultDefaultControls, ...resultNonPersitantControls];
};

/*
 * getFilterControlsComparator provides a comparator that can be used with `isEqualWith` to compare
 * 2 instances of FilterItemObj
 *
 * */
export const getFilterControlsComparator =
  (...fieldsToCompare: Array<keyof FilterControlConfig>) =>
  (filterItemObject1: FilterControlConfig[], filterItemObject2: FilterControlConfig[]) => {
    if (filterItemObject1.length !== filterItemObject2.length) return false;
    const filterItemObjectWithSelectedKeys1 = filterItemObject1.map((v) => {
      return pick(v, fieldsToCompare);
    });

    const filterItemObjectWithSelectedKeys2 = filterItemObject2.map((v) => {
      return pick(v, fieldsToCompare);
    });

    return isEqual(filterItemObjectWithSelectedKeys1, filterItemObjectWithSelectedKeys2);
  };
