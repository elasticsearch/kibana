/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObject } from '@kbn/core/server';
import { ZodError } from '@kbn/zod';
import type { StoredVegaLibraryItemState } from '../vega_saved_object';
import { getVegaCRUResponseBody } from './get_cru_response_body';

const getSavedObject = (
  attributes: StoredVegaLibraryItemState
): SavedObject<StoredVegaLibraryItemState> => ({
  id: 'vega-library-item-id',
  type: 'vega',
  attributes,
  references: [],
});

describe('getVegaCRUResponseBody', () => {
  test('parses stored attributes into the API response', () => {
    const attributes = {
      title: 'Vega chart',
      spec: { format: 'json' as const, value: { mark: 'point' } },
    };

    expect(getVegaCRUResponseBody(getSavedObject(attributes))).toEqual({
      id: 'vega-library-item-id',
      data: attributes,
      meta: { managed: false },
    });
  });

  test('rejects stored attributes that do not satisfy the API response schema', () => {
    const savedObject = getSavedObject({
      title: 'Vega chart',
      spec: { format: 'hjson', value: '' },
    });

    expect(() => getVegaCRUResponseBody(savedObject)).toThrow(ZodError);
  });
});
