/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObjectReference } from '@kbn/core/server';
import type { DrilldownTransforms } from '@kbn/embeddable-plugin/common';
import { VEGA_SAVED_OBJECT_TYPE } from '../../../common/constants';
import { VEGA_SAVED_OBJECT_REF_NAME } from './get_transform_in';
import type { StoredVegaEmbeddableState } from '../types';

export const getTransformOut = (transformDrilldownsOut: DrilldownTransforms['transformOut']) => {
  const transformOut = (
    storedState: StoredVegaEmbeddableState,
    panelReferences?: SavedObjectReference[]
  ) => {
    const state = transformDrilldownsOut(storedState, panelReferences);

    // by ref
    const savedObjectRef = (panelReferences ?? []).find(
      (ref) => VEGA_SAVED_OBJECT_TYPE === ref.type && ref.name === VEGA_SAVED_OBJECT_REF_NAME
    );

    if (savedObjectRef) {
      return {
        ...state,
        ref_id: savedObjectRef.id,
      };
    }

    // by value
    return state;
  };
  return transformOut;
};
