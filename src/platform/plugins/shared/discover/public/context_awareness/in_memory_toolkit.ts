/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isEqual } from 'lodash';
import { BehaviorSubject, distinctUntilChanged } from 'rxjs';
import type { ContextAwarenessToolkit, ContextAwarenessToolkitActions } from './toolkit';
import {
  createProfileStateAdapterFactory,
  type ProfileStateAdapter,
  type ProfileStateDefinition,
  type ProfileStateRegistry,
} from './profile_state';

/**
 * Creates a complete context awareness toolkit for hosts that do not have tab-backed state.
 * Profile state is kept in memory for the lifetime of the scoped host instance.
 */
export const createInMemoryContextAwarenessToolkit = ({
  actions = {},
  profileStateRegistry,
}: {
  actions?: ContextAwarenessToolkitActions;
  profileStateRegistry: ProfileStateRegistry;
}): ContextAwarenessToolkit => {
  return {
    actions,
    getStateAdapter: createProfileStateAdapterFactory({
      profileStateRegistry,
      createAdapter: <TState extends object>(
        definition: ProfileStateDefinition<TState>
      ): ProfileStateAdapter<TState> => {
        const stateSubject = new BehaviorSubject<TState>(definition.defaultState);
        const state$ = stateSubject.pipe(distinctUntilChanged(isEqual));
        const getState = () => stateSubject.getValue();

        return {
          getState,
          getState$: () => state$,
          setState: (profileState) => {
            stateSubject.next(profileState);
          },
          updateState: (stateUpdate) => {
            stateSubject.next({ ...getState(), ...stateUpdate });
          },
        };
      },
    }),
  };
};
