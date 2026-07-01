/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { toStoredTags } from './tags_transforms';

describe('transformTagsIn', () => {
  test('Should exclude duplicate tags', () => {
    const { state, references: tagRefs } = toStoredTags({ tags: ['tag2', 'tag2'] });

    expect(state).toMatchInlineSnapshot(`Object {}`);
    expect(tagRefs).toMatchInlineSnapshot(`
      Array [
        Object {
          "id": "tag2",
          "name": "tag-ref-tag2",
          "type": "tag",
        },
      ]
    `);
  });
});
