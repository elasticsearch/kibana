/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { SolutionType } from '../../../profiles';
import { createSearchRootProfileProvider } from './profile';

describe('createSearchRootProfileProvider', () => {
  const provider = createSearchRootProfileProvider();

  it('identifies Search navigation', () => {
    expect(provider.resolve({ solutionNavId: SolutionType.Search })).toEqual({
      isMatch: true,
      context: { solutionType: SolutionType.Search },
    });
  });

  it.each([
    undefined,
    null,
    SolutionType.Default,
    SolutionType.Observability,
    SolutionType.Security,
  ])('does not match %s navigation', (solutionNavId) => {
    expect(provider.resolve({ solutionNavId })).toEqual({ isMatch: false });
  });
});
