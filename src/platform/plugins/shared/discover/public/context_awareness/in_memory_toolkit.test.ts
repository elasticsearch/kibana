/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createInMemoryContextAwarenessToolkit } from './in_memory_toolkit';
import {
  createRegisteredTestProfileStateRegistry,
  TEST_PROFILE_STATE_DEF,
  type TestProfileState,
} from './__mocks__/profile_state';

const createRegisteredRegistry = () => {
  return createRegisteredTestProfileStateRegistry();
};

describe('createInMemoryContextAwarenessToolkit', () => {
  it('exposes provided actions', () => {
    const refreshData = jest.fn();
    const toolkit = createInMemoryContextAwarenessToolkit({
      actions: { refreshData },
      profileStateRegistry: createRegisteredRegistry(),
    });

    expect(toolkit.actions.refreshData).toBe(refreshData);
  });

  it('stores all profile state descriptor types in memory', () => {
    const stateAdapter = createInMemoryContextAwarenessToolkit({
      profileStateRegistry: createRegisteredRegistry(),
    }).getStateAdapter(TEST_PROFILE_STATE_DEF);

    expect(stateAdapter.getState()).toEqual(TEST_PROFILE_STATE_DEF.defaultState);

    stateAdapter.setState({
      uiValue: 'ui',
      urlValue: 'url',
      persistentValue: 'persistent',
      nestedValue: { count: 1 },
    });

    expect(stateAdapter.getState()).toEqual({
      uiValue: 'ui',
      urlValue: 'url',
      persistentValue: 'persistent',
      nestedValue: { count: 1 },
    });

    stateAdapter.updateState({ urlValue: 'updatedUrl' });

    expect(stateAdapter.getState()).toEqual({
      uiValue: 'ui',
      urlValue: 'updatedUrl',
      persistentValue: 'persistent',
      nestedValue: { count: 1 },
    });
  });

  it('emits profile state updates and skips deep equal duplicate values', () => {
    const stateAdapter = createInMemoryContextAwarenessToolkit({
      profileStateRegistry: createRegisteredRegistry(),
    }).getStateAdapter(TEST_PROFILE_STATE_DEF);
    const emittedValues: Array<Partial<TestProfileState>> = [];
    const subscription = stateAdapter.getState$().subscribe((state) => emittedValues.push(state));

    stateAdapter.setState({
      uiValue: 'ui',
      urlValue: 'url',
      persistentValue: 'persistent',
      nestedValue: { count: 1 },
    });
    stateAdapter.setState({
      uiValue: 'ui',
      urlValue: 'url',
      persistentValue: 'persistent',
      nestedValue: { count: 1 },
    });
    stateAdapter.updateState({ nestedValue: { count: 2 } });
    subscription.unsubscribe();

    expect(emittedValues).toEqual([
      TEST_PROFILE_STATE_DEF.defaultState,
      {
        uiValue: 'ui',
        urlValue: 'url',
        persistentValue: 'persistent',
        nestedValue: { count: 1 },
      },
      {
        uiValue: 'ui',
        urlValue: 'url',
        persistentValue: 'persistent',
        nestedValue: { count: 2 },
      },
    ]);
  });

  it('isolates state between toolkit instances', () => {
    const profileStateRegistry = createRegisteredRegistry();
    const firstToolkit = createInMemoryContextAwarenessToolkit({ profileStateRegistry });
    const secondToolkit = createInMemoryContextAwarenessToolkit({ profileStateRegistry });

    firstToolkit.getStateAdapter(TEST_PROFILE_STATE_DEF).setState({
      uiValue: 'ui',
      urlValue: 'url',
      persistentValue: 'persistent',
      nestedValue: { count: 1 },
    });

    expect(secondToolkit.getStateAdapter(TEST_PROFILE_STATE_DEF).getState()).toEqual(
      TEST_PROFILE_STATE_DEF.defaultState
    );
  });
});
