/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import { formatZodErrors } from './format_errors';
import { getNonEmptyStringCodec, NonEmptyString } from './common';

describe('formatZodErrors', () => {
  it('orders Invalid field before Invalid value (Scout public API details)', () => {
    const schema = z.looseObject({
      name: NonEmptyString,
      urls: getNonEmptyStringCodec('url'),
    });
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(formatZodErrors(result.error, { input: {} }).join(' | ')).toBe(
      'Invalid field "url", must be a non-empty string. | Invalid value "undefined" supplied to "name"'
    );
  });
});
