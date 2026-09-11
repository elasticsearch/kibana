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
import type { VegaByReferenceState, VegaEmbeddableState } from '../schema';
import type { StoredVegaEmbeddableState } from '../types';

export const VEGA_SAVED_OBJECT_REF_NAME = 'savedObjectRef';

export const getTransformIn = (transformDrilldownsIn: DrilldownTransforms['transformIn']) => {
  const transformIn = (
    state: VegaEmbeddableState
  ): {
    state: StoredVegaEmbeddableState;
    references: SavedObjectReference[];
  } => {
    const { state: storedState, references: drilldownReferences } = transformDrilldownsIn(state);

    // by ref
    if ((storedState as VegaByReferenceState).ref_id) {
      const { ref_id, ...rest } = storedState as VegaByReferenceState;
      return {
        state: rest as StoredVegaEmbeddableState,
        references: [
          {
            name: VEGA_SAVED_OBJECT_REF_NAME,
            type: VEGA_SAVED_OBJECT_TYPE,
            id: ref_id,
          },
          ...drilldownReferences,
        ],
      };
    }

    // by value
    return {
      state: storedState,
      references: drilldownReferences,
    };
  };
  return transformIn;
};
