/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ProfileStateDefinition, ProfileStateRegistry } from '../../profile_state';
import { ProfileStateType } from '../../profile_state';

export interface ExampleProfileState {
  timestampColor: string;
}

export const EXAMPLE_PROFILE_STATE_DEFAULTS: ExampleProfileState = {
  timestampColor: 'hollow',
};

export const EXAMPLE_PROFILE_STATE_DEF: ProfileStateDefinition<ExampleProfileState> = {
  key: 'exampleProfileState',
  descriptor: {
    timestampColor: { type: ProfileStateType.Ui },
  },
  defaultState: EXAMPLE_PROFILE_STATE_DEFAULTS,
};

export const registerExampleProfileStateDefinitions = (registry: ProfileStateRegistry) => {
  registry.registerDefinition(EXAMPLE_PROFILE_STATE_DEF);
};
