/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Reference } from '@kbn/content-management-utils';
import { RANGE_SLIDER_CONTROL } from '@kbn/controls-constants';
import {
  rangeSliderControlSchema,
  type LegacyStoredDataControlState,
  type LegacyStoredRangeSliderExplicitInput,
  type RangeSliderControlState,
  type StrictDataControlState,
} from '@kbn/controls-schemas';
import type { EmbeddableSetup } from '@kbn/embeddable-plugin/server';
import { transformDataControlIn, transformDataControlOut } from './data_control_transforms';

const RANGE_SLIDER_REF_NAME = 'rangeSliderDataView' as const;
const RANGE_SLIDER_LEGACY_REF_NAMES = [
  'rangeSliderDataView',
  'rangeSliderControlDataView',
] as const;

export const registerRangeSliderControlTransforms = (embeddable: EmbeddableSetup) => {
  embeddable.registerEmbeddableServerDefinition(RANGE_SLIDER_CONTROL, {
    title: 'Range slider control',
    getSchema: () => rangeSliderControlSchema,
    getTransforms: () => ({
      transformIn: (state: RangeSliderControlState) => {
        const { state: dataControlState, references } = transformDataControlIn(
          state as StrictDataControlState,
          RANGE_SLIDER_REF_NAME
        );
        return {
          state: dataControlState,
          references,
        };
      },
      transformOut: <
        StoredStateType extends Partial<
          LegacyStoredRangeSliderExplicitInput & RangeSliderControlState
        >
      >(
        state: StoredStateType,
        panelReferences: Reference[] | undefined,
        containerReferences: Reference[] | undefined,
        id: string | undefined
      ): Partial<RangeSliderControlState> => {
        const dataControlState = transformDataControlOut(
          id,
          state as Partial<LegacyStoredDataControlState & StrictDataControlState>,
          RANGE_SLIDER_LEGACY_REF_NAMES,
          panelReferences,
          containerReferences
        );
        return {
          ...dataControlState,
          ...(state.value && { value: state.value }),
          ...(typeof state.step === 'number' && { step: state.step }),
        };
      },
    }),
  });
};
