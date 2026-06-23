/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { v4 as uuidv4 } from 'uuid';

import {
  ControlValuesSource,
  DEFAULT_DATA_CONTROL_STATE,
  DEFAULT_DSL_OPTIONS_LIST_STATE,
  DEFAULT_PINNED_CONTROL_STATE,
  DEFAULT_RANGE_SLIDER_STATE,
  DEFAULT_TIME_SLIDER_STATE,
  OPTIONS_LIST_CONTROL,
  RANGE_SLIDER_CONTROL,
  TIME_SLIDER_CONTROL,
} from '@kbn/controls-constants';
import type { ControlsLayout } from '@kbn/controls-renderer/src/types';
import type {
  DataControlState,
  OptionsListDSLControlState,
  RangeSliderControlState,
  PinnedControlState,
} from '@kbn/controls-schemas';
import { i18n } from '@kbn/i18n';
import type { EmbeddableApiContext } from '@kbn/presentation-publishing';
import type { Action, UiActionsStart } from '@kbn/ui-actions-plugin/public';

import { CONTROL_MENU_TRIGGER } from '@kbn/ui-actions-plugin/common/trigger_ids';
import type {
  ControlGroupRuntimeState,
  ControlPanelState,
  FlattenedPinnedControlState,
} from './types';

export const controlGroupStateBuilder = {
  addDataControlFromField: async (
    controlGroupState: Partial<ControlGroupRuntimeState>,
    controlState: Partial<Omit<DataControlState & FlattenedPinnedControlState, 'type'>> &
      Required<Pick<DataControlState, 'data_view_id' | 'field_name'>>,
    uiActionsService: UiActionsStart,
    controlId?: string
  ) => {
    const type = await getCompatibleControlType(
      controlState.data_view_id,
      controlState.field_name,
      uiActionsService
    );
    if (!type)
      throw new Error(
        i18n.translate('controls.controlGroupRenderer.addDataControlFromField.error', {
          defaultMessage: 'No control type is compatible with this field.',
        })
      );
    controlGroupState.initialChildControlState = {
      ...(controlGroupState.initialChildControlState ?? {}),
      [controlId ?? uuidv4()]: {
        ...DEFAULT_DATA_CONTROL_STATE,
        ...DEFAULT_PINNED_CONTROL_STATE,
        type,
        order: getNextControlOrder(controlGroupState.initialChildControlState),
        ...controlState,
      } as ControlPanelState,
    };
  },
  addOptionsListControl: (
    controlGroupState: Partial<ControlGroupRuntimeState>,
    controlState: Partial<
      Omit<
        Omit<PinnedControlState, keyof OptionsListDSLControlState | 'config'> &
          OptionsListDSLControlState,
        'type'
      >
    > &
      Required<Pick<OptionsListDSLControlState, 'data_view_id' | 'field_name'>>,
    controlId?: string
  ) => {
    controlGroupState.initialChildControlState = {
      ...(controlGroupState.initialChildControlState ?? {}),
      [controlId ?? uuidv4()]: {
        ...DEFAULT_PINNED_CONTROL_STATE,
        ...DEFAULT_DSL_OPTIONS_LIST_STATE,
        type: OPTIONS_LIST_CONTROL,
        order: getNextControlOrder(controlGroupState.initialChildControlState),
        ...controlState,
        values_source: ControlValuesSource.FIELD,
      } as ControlPanelState,
    };
  },
  addRangeSliderControl: (
    controlGroupState: Partial<ControlGroupRuntimeState>,
    controlState: Omit<
      Omit<PinnedControlState, keyof RangeSliderControlState> & RangeSliderControlState,
      'type'
    > &
      Required<Pick<RangeSliderControlState, 'data_view_id' | 'field_name'>>,
    controlId?: string
  ) => {
    controlGroupState.initialChildControlState = {
      ...(controlGroupState.initialChildControlState ?? {}),
      [controlId ?? uuidv4()]: {
        ...DEFAULT_PINNED_CONTROL_STATE,
        ...DEFAULT_RANGE_SLIDER_STATE,
        type: RANGE_SLIDER_CONTROL,
        order: getNextControlOrder(controlGroupState.initialChildControlState),
        ...controlState,
        values_source: ControlValuesSource.FIELD,
      } as unknown as ControlPanelState,
    };
  },
  addTimeSliderControl: (
    controlGroupState: Partial<ControlGroupRuntimeState>,
    controlId?: string
  ) => {
    controlGroupState.initialChildControlState = {
      ...(controlGroupState.initialChildControlState ?? {}),
      [controlId ?? uuidv4()]: {
        ...DEFAULT_TIME_SLIDER_STATE,
        type: TIME_SLIDER_CONTROL,
        order: getNextControlOrder(controlGroupState.initialChildControlState),
        width: 'large',
        grow: true,
      },
    };
  },
};

async function getCompatibleControlType(
  dataViewId: string,
  fieldName: string,
  uiActionsService: UiActionsStart
): Promise<PinnedControlState['type'] | undefined> {
  const controlTypes = (await uiActionsService.getTriggerActions(CONTROL_MENU_TRIGGER)) as Array<
    Action<EmbeddableApiContext & { state: unknown }> // This is CreateControlTypeAction but I cannot import it due to circular dependencies
  >;

  for (const action of controlTypes) {
    const trigger = uiActionsService.getTrigger(CONTROL_MENU_TRIGGER);
    const compatible = await action.isCompatible({
      trigger,
      embeddable: undefined, // parentApi isn't necessary for this
      state: { dataViewId, fieldName },
    });
    if (compatible) return action.type as PinnedControlState['type'];
  }
  return undefined;
}

function getNextControlOrder(controlPanelsState?: ControlsLayout['controls']) {
  if (!controlPanelsState) {
    return 0;
  }

  const values = Object.values(controlPanelsState);

  if (values.length === 0) {
    return 0;
  }

  let highestOrder = 0;
  values.forEach((controlPanelState) => {
    if (controlPanelState.order > highestOrder) {
      highestOrder = controlPanelState.order;
    }
  });
  return highestOrder + 1;
}
