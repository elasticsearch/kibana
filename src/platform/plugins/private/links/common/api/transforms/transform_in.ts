/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { toStoredTags } from '@kbn/as-code-shared-transforms';
import type { Reference } from '@kbn/content-management-utils';
import type { LinksApiState, StoredLinksState } from '../../../server';
import { transformIn as transformEmbeddableIn } from '../../embeddable/transforms/transform_in';

export function transformIn(state: LinksApiState): {
  state: StoredLinksState;
  references: Reference[];
} {
  const { state: stateWithoutTags, references: tagReferences } = toStoredTags(state);
  const { state: transformedState, references } = transformEmbeddableIn(stateWithoutTags);

  return {
    state: transformedState,
    references: [...references, ...tagReferences],
  };
}
