/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { restorableStateDocViewShareableStateSchema } from './restorable_state_doc_view';

describe('restorableStateDocViewShareableStateSchema', () => {
  it('keeps the shareable clickCount and strips unknown restorable keys', () => {
    const result = restorableStateDocViewShareableStateSchema.safeParse({
      clickCount: 3,
      scrollTop: 120,
    });

    expect(result).toEqual({ success: true, data: { clickCount: 3 } });
  });

  it('rejects an out-of-bounds or non-integer count', () => {
    expect(restorableStateDocViewShareableStateSchema.safeParse({ clickCount: -1 }).success).toBe(
      false
    );
    expect(restorableStateDocViewShareableStateSchema.safeParse({ clickCount: 1.5 }).success).toBe(
      false
    );
    expect(
      restorableStateDocViewShareableStateSchema.safeParse({ clickCount: 1_000_001 }).success
    ).toBe(false);
  });
});
