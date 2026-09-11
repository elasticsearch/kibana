/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createProfileProviderSharedServicesMock } from '../../../__mocks__';
import { SolutionType } from '../../../profiles';
import { SECURITY_PROFILE_ID } from '../constants';
import { createSecurityRootProfileProvider } from './profile';

const createProvider = () =>
  createSecurityRootProfileProvider(createProfileProviderSharedServicesMock());

describe('createSecurityRootProfileProvider', () => {
  it('should use the root security profile ID', () => {
    expect(createProvider().profileId).toBe(SECURITY_PROFILE_ID.root);
  });

  describe('resolve', () => {
    it('should not match for non-security solutions', async () => {
      const provider = createProvider();
      expect(await provider.resolve({ solutionNavId: SolutionType.Observability })).toEqual({
        isMatch: false,
      });
      expect(await provider.resolve({ solutionNavId: null })).toEqual({ isMatch: false });
    });

    it('should match for the security solution', async () => {
      expect(await createProvider().resolve({ solutionNavId: SolutionType.Security })).toEqual({
        isMatch: true,
        context: { solutionType: SolutionType.Security },
      });
    });
  });
});
