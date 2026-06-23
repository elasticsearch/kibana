/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import type { BehaviorSubject } from 'rxjs';

import type { TypeOf } from '@kbn/config-schema';
import type { controlTitleSchema, dataControlSchema } from './control_schema';
import type {
  getControlsGroupSchema,
  controlWidthSchema,
  pinnedControlSchema,
} from './controls_group_schema';
import type {
  optionsListDSLControlSchema,
  optionsListESQLControlSchema,
  optionsListDisplaySettingsSchema,
  optionsListSearchTechniqueSchema,
  optionsListSelectionSchema,
  optionsListSortSchema,
} from './options_list_schema';
import type { rangeSliderControlSchema, rangeValueSchema } from './range_slider_schema';
import type { timeSliderControlSchema } from './time_slider_schema';

/**
 * Collect every key from each branch of a discriminated union, then build a
 * single object type where each key is optional and typed as the union of its
 * non-`never` types across the variants.
 */
type AllKeysOfUnion<T> = T extends unknown ? keyof T : never;
type LooseUnion<T> = {
  [K in AllKeysOfUnion<T>]?: T extends unknown
    ? K extends keyof T
      ? [T[K]] extends [never]
        ? never
        : T[K]
      : never
    : never;
};

export type ControlsGroupState = TypeOf<ReturnType<typeof getControlsGroupSchema>>;
export type PinnedControlState = ControlsGroupState[number];
export type PinnedControlLayoutState = TypeOf<typeof pinnedControlSchema> & {
  order: number;
  type: string;
};

export type ControlWidth = TypeOf<typeof controlWidthSchema>;
export type ControlState = TypeOf<typeof controlTitleSchema>;

export type StrictDataControlState = TypeOf<typeof dataControlSchema>;
export type DataControlState = LooseUnion<StrictDataControlState>;

export type OptionsListDisplaySettings = TypeOf<typeof optionsListDisplaySettingsSchema>;

export type OptionsListDSLControlState = LooseUnion<TypeOf<typeof optionsListDSLControlSchema>>;
export type OptionsListESQLControlState = TypeOf<typeof optionsListESQLControlSchema>;
export type OptionsListControlState = OptionsListDSLControlState | OptionsListESQLControlState;

export type OptionsListSearchTechnique = TypeOf<typeof optionsListSearchTechniqueSchema>;
export type OptionsListSelection = TypeOf<typeof optionsListSelectionSchema>;
export type OptionsListSortingType = TypeOf<typeof optionsListSortSchema>;

export type RangeSliderControlState = LooseUnion<TypeOf<typeof rangeSliderControlSchema>>;
export type RangeSliderValue = TypeOf<typeof rangeValueSchema>;

export type TimeSlice = [number, number];
export type TimeSliderControlState = TypeOf<typeof timeSliderControlSchema>;

export interface HasCustomPrepend {
  CustomPrependComponent: React.FC<{}>;
}
export interface PublishesTooltipLabel {
  tooltipLabel$: BehaviorSubject<string>;
}

export const apiPublishesTooltipLabel = (api: unknown): api is PublishesTooltipLabel =>
  Boolean((api as PublishesTooltipLabel)?.tooltipLabel$);
