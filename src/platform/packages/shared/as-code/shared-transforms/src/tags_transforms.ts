/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Reference } from '@kbn/content-management-utils';

const tagSavedObjectTypeName = 'tag'; // cannot import from plugin @kbn/saved-objects-tagging-plugin/common

export function toAsCodeTags(references: Reference[] = []) {
  const tags: string[] = references
    ? references.filter(({ type }) => type === tagSavedObjectTypeName).map(({ id }) => id)
    : [];
  return { tags };
}

export function toStoredTags<State extends { tags?: string[] } = { tags?: string[] }>(
  state: State
): { state: Omit<State, 'tags'>; references: Reference[] } {
  const { tags, ...restOfState } = state;
  const uniqueTagIds = new Set<string>([]);
  (tags ?? []).forEach((tagId) => {
    uniqueTagIds.add(tagId);
  });

  return {
    state: restOfState,
    references: Array.from(uniqueTagIds).map((tagId) => ({
      type: tagSavedObjectTypeName,
      id: tagId,
      name: `tag-ref-${tagId}`,
    })),
  };
}
