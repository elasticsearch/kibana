/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ProfileStateDefinition } from '../profile_state';
import { ProfileStateRegistry, ProfileStateType } from '../profile_state';

export interface TestProfileState {
  uiValue: string;
  urlValue: string;
  persistentValue: string;
  nestedValue: {
    count: number;
  };
}

export const TEST_PROFILE_STATE_DEF: ProfileStateDefinition<TestProfileState> = {
  key: 'testProfileState',
  descriptor: {
    uiValue: { type: ProfileStateType.Ui },
    urlValue: { type: ProfileStateType.Url },
    persistentValue: { type: ProfileStateType.Persistent },
    nestedValue: { type: ProfileStateType.Ui },
  },
  defaultState: {
    uiValue: 'defaultUi',
    urlValue: 'defaultUrl',
    persistentValue: 'defaultPersistent',
    nestedValue: { count: 0 },
  },
};

export const createRegisteredTestProfileStateRegistry = () => {
  const profileStateRegistry = new ProfileStateRegistry();
  profileStateRegistry.registerDefinition(TEST_PROFILE_STATE_DEF);
  return profileStateRegistry;
};
