/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  createProfileStateAdapterFactory,
  type ProfileStateAdapter,
  type ProfileStateDefinition,
  ProfileStateRegistry,
  ProfileStateType,
} from './profile_state';
import { TEST_PROFILE_STATE_DEF } from './__mocks__/profile_state';

describe('ProfileStateRegistry', () => {
  it('registers and matches definitions', () => {
    const registry = new ProfileStateRegistry();

    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(registry.hasDefinition(TEST_PROFILE_STATE_DEF)).toBe(true);
    expect(
      registry.hasDefinition({
        ...TEST_PROFILE_STATE_DEF,
        descriptor: {
          ...TEST_PROFILE_STATE_DEF.descriptor,
          uiValue: { type: ProfileStateType.Url },
        },
      })
    ).toBe(false);
  });

  it('does not match definitions with different defaults', () => {
    const registry = new ProfileStateRegistry();

    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.hasDefinition({
        ...TEST_PROFILE_STATE_DEF,
        defaultState: {
          ...TEST_PROFILE_STATE_DEF.defaultState,
          uiValue: 'differentDefaultUi',
        },
      })
    ).toBe(false);
  });

  it('rejects duplicate keys', () => {
    const registry = new ProfileStateRegistry();

    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(() => registry.registerDefinition(TEST_PROFILE_STATE_DEF)).toThrow(
      'State with key testProfileState is already registered.'
    );
  });

  it('picks registered fields by state type', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.pickStateByType({
        profileState: {
          testProfileState: {
            uiValue: 'ui',
            urlValue: 'url',
            persistentValue: 'persistent',
          },
          unregisteredProfileState: { uiValue: 'ignored' },
        },
        stateType: ProfileStateType.Ui,
      })
    ).toEqual({
      testProfileState: {
        uiValue: 'ui',
      },
    });
  });

  it('returns an empty object when no fields match', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.pickStateByType({
        profileState: {
          testProfileState: {
            uiValue: 'ui',
          },
        },
        stateType: ProfileStateType.Persistent,
      })
    ).toEqual({});
  });

  it('returns an empty object when picking state by type from undefined state', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.pickStateByType({
        profileState: undefined,
        stateType: ProfileStateType.Persistent,
      })
    ).toEqual({});
  });

  it('ignores sparse and unregistered fields when picking state by type', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.pickStateByType({
        profileState: {
          testProfileState: {
            uiValue: 'ui',
            unregisteredValue: 'ignored',
          },
          unregisteredProfileState: {
            uiValue: 'ignored',
          },
        },
        stateType: ProfileStateType.Ui,
      })
    ).toEqual({
      testProfileState: {
        uiValue: 'ui',
      },
    });
  });

  it('picks state by type merged over defaults', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.pickStateByType({
        profileState: {
          testProfileState: {
            uiValue: 'ui',
            persistentValue: 'persistent',
          },
        },
        stateType: ProfileStateType.Persistent,
        shouldMergeDefaults: true,
      })
    ).toEqual({
      testProfileState: {
        uiValue: 'defaultUi',
        urlValue: 'defaultUrl',
        persistentValue: 'persistent',
        nestedValue: { count: 0 },
      },
    });
  });

  it('picks no merged state when no registered fields match the requested type', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.pickStateByType({
        profileState: {
          testProfileState: {
            uiValue: 'ui',
          },
          unregisteredProfileState: {
            persistentValue: 'ignored',
          },
        },
        stateType: ProfileStateType.Persistent,
        shouldMergeDefaults: true,
      })
    ).toEqual({});
  });
});

describe('createProfileStateAdapterFactory', () => {
  const createRegisteredRegistry = () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);
    return registry;
  };

  const createTestAdapter = <TState extends object>(
    state: TState
  ): ProfileStateAdapter<TState> => ({
    getState: () => state,
    getState$: jest.fn(),
    setState: jest.fn(),
    updateState: jest.fn(),
  });

  it('creates an adapter for a registered definition', () => {
    const createAdapterSpy = jest.fn();
    const createAdapter = <TState extends object>(definition: ProfileStateDefinition<TState>) => {
      createAdapterSpy(definition);
      return createTestAdapter(definition.defaultState);
    };
    const getStateAdapter = createProfileStateAdapterFactory({
      createAdapter,
      profileStateRegistry: createRegisteredRegistry(),
    });

    const adapter = getStateAdapter(TEST_PROFILE_STATE_DEF);

    expect(adapter.getState()).toEqual(TEST_PROFILE_STATE_DEF.defaultState);
    expect(createAdapterSpy).toHaveBeenCalledWith(TEST_PROFILE_STATE_DEF);
  });

  it('caches adapters by definition key', () => {
    const createAdapterSpy = jest.fn();
    const createAdapter = <TState extends object>(definition: ProfileStateDefinition<TState>) => {
      createAdapterSpy(definition);
      return createTestAdapter(definition.defaultState);
    };
    const getStateAdapter = createProfileStateAdapterFactory({
      createAdapter,
      profileStateRegistry: createRegisteredRegistry(),
    });

    expect(getStateAdapter(TEST_PROFILE_STATE_DEF)).toBe(getStateAdapter(TEST_PROFILE_STATE_DEF));
    expect(createAdapterSpy).toHaveBeenCalledTimes(1);
  });

  it('throws when the profile state definition is not registered', () => {
    const getStateAdapter = createProfileStateAdapterFactory({
      createAdapter: jest.fn(),
      profileStateRegistry: new ProfileStateRegistry(),
    });

    expect(() => getStateAdapter(TEST_PROFILE_STATE_DEF)).toThrow(
      'State with key testProfileState is not registered.'
    );
  });
});
