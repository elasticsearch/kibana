/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createContext } from 'react';

import type { CoreAuthenticationService } from '@kbn/core-security-browser';

import type { UserProfileService } from '../service';

export interface CurrentUserServices {
  /** Core's authentication service, i.e. `coreStart.security.authc`. */
  authc: CoreAuthenticationService;
  /** Core's user profile service, i.e. `coreStart.userProfile`. */
  userProfile: UserProfileService;
}

export const CurrentUserContext = createContext<CurrentUserServices | null>(null);
