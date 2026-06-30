/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { of } from 'rxjs';
import type {
  CoreUserProfileDelegateContract,
  GetUserProfileResponse,
} from '@kbn/core-user-profile-browser';
import type { UserProfileData } from '@kbn/core-user-profile-common';

export const getDefaultUserProfileImplementation = (): CoreUserProfileDelegateContract => {
  return {
    userProfile$: of(null),
    enabled$: of(false),
    dataUpdates$: of({}),
    getCurrent: <D extends UserProfileData>() =>
      Promise.resolve(null as unknown as GetUserProfileResponse<D>),
    bulkGet: () => Promise.resolve([]),
    suggest: () => Promise.resolve([]),
    update: () => Promise.resolve(),
    partialUpdate: () => Promise.resolve(),
  };
};
