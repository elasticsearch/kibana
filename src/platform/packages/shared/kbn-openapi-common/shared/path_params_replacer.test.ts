/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { replaceParams } from './path_params_replacer';

describe('replaceParams', () => {
  it('replaces multiple path params', () => {
    expect(replaceParams('my/{a}/to/{b}', { a: '1', b: '2' })).toBe('my/1/to/2');
  });
});
