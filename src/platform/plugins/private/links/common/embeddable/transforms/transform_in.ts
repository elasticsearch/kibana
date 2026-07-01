/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Reference } from '@kbn/content-management-utils';

import type { StoredLinksState } from '../../../server';
import { LINKS_LIBRARY_TYPE } from '../../constants';
import type { LinksByReferenceState, LinksByValueState, LinksEmbeddableState } from '../types';
import { transformLinksIn } from './transform_links';

export function transformIn(state: LinksEmbeddableState): {
  state: StoredLinksState;
  references: Reference[];
} {
  if ((state as LinksByReferenceState).ref_id) {
    const { ref_id, ...rest } = state as LinksByReferenceState;
    return {
      state: rest,
      references: [
        {
          name: 'savedObjectRef',
          type: LINKS_LIBRARY_TYPE,
          id: ref_id,
        },
      ],
    };
  }

  const { links, references } = transformLinksIn((state as LinksByValueState).links);
  return {
    state: {
      title: '',
      ...state,
      links,
    },
    references,
  };
}
