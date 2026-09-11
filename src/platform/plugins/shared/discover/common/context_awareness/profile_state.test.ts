/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { TEST_PROFILE_STATE_DEF } from '../../public/context_awareness/__mocks__/profile_state';
import { DiscoverTabType } from '@kbn/discover-session-constants';
import { METRICS_GRID_SETTINGS_DEFAULTS } from '@kbn/discover-utils';
import {
  createProfileSavedStateTransform,
  type ProfileStateDefinition,
  ProfileStateRegistry,
  ProfileStateType,
} from './profile_state';
import { METRICS_STATE_DEF } from './profile_state_definitions/metrics_grid_profile_state';
import { METRICS_GRID_SAVED_STATE_TRANSFORM } from './profile_state_transforms/metrics_grid_saved_state_transform';

const createSavedMetricsSettings = (dimensions: string[]) => ({
  ...METRICS_GRID_SETTINGS_DEFAULTS,
  dimensions,
});

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

  describe('saved state transforms', () => {
    it('rejects a transform whose state definition is not registered', () => {
      const registry = new ProfileStateRegistry();

      expect(() => registry.registerTransform(METRICS_GRID_SAVED_STATE_TRANSFORM)).toThrow(
        'State with key metricsState must be registered before this transform.'
      );
    });

    it('rejects a transform whose state definition does not match the registered definition', () => {
      const registry = new ProfileStateRegistry();
      registry.registerDefinition({
        ...METRICS_STATE_DEF,
        defaultState: {
          ...METRICS_STATE_DEF.defaultState,
          dimensions: ['host.name'],
        },
      });

      expect(() => registry.registerTransform(METRICS_GRID_SAVED_STATE_TRANSFORM)).toThrow(
        'State with key metricsState must be registered before this transform.'
      );
    });

    it('converts profile state to and from saved state', () => {
      const registry = new ProfileStateRegistry();
      registry.registerDefinition(METRICS_STATE_DEF);
      registry.registerTransform(METRICS_GRID_SAVED_STATE_TRANSFORM);

      const savedState = registry.toSavedState(DiscoverTabType.Metrics, {
        metricsState: { dimensions: ['host.name'] },
      });

      expect(savedState).toEqual({
        type: DiscoverTabType.Metrics,
        ...createSavedMetricsSettings(['host.name']),
      });
      expect(registry.fromSavedState(savedState)).toEqual({
        metricsState: createSavedMetricsSettings(['host.name']),
      });
    });

    it('returns undefined saved state when the tab type is undefined', () => {
      const registry = new ProfileStateRegistry();
      registry.registerDefinition(METRICS_STATE_DEF);
      registry.registerTransform(METRICS_GRID_SAVED_STATE_TRANSFORM);

      expect(registry.toSavedState(undefined, {})).toBeUndefined();
    });

    it('returns undefined when no transform is registered', () => {
      const registry = new ProfileStateRegistry();

      expect(registry.toSavedState(DiscoverTabType.Metrics, {})).toBeUndefined();
    });

    it('expands defaults when profile state has not been explicitly set', () => {
      const registry = new ProfileStateRegistry();
      registry.registerDefinition(METRICS_STATE_DEF);
      registry.registerTransform(METRICS_GRID_SAVED_STATE_TRANSFORM);

      expect(registry.toSavedState(DiscoverTabType.Metrics, {})).toEqual({
        type: DiscoverTabType.Metrics,
        ...createSavedMetricsSettings([]),
      });
    });

    it('returns empty profile state when saved state is undefined or has no transform', () => {
      const registry = new ProfileStateRegistry();

      expect(registry.fromSavedState(undefined)).toEqual({});
      expect(
        registry.fromSavedState({
          type: DiscoverTabType.Metrics,
          ...createSavedMetricsSettings(['host.name']),
        })
      ).toEqual({});
    });

    it('rejects a second transform for the same tab type', () => {
      const registry = new ProfileStateRegistry();
      registry.registerDefinition(METRICS_STATE_DEF);
      registry.registerTransform(METRICS_GRID_SAVED_STATE_TRANSFORM);

      const duplicateTransform = createProfileSavedStateTransform({
        tabType: DiscoverTabType.Metrics,
        stateDefinitions: [METRICS_STATE_DEF],
        toSavedState: ([{ dimensions }]) => createSavedMetricsSettings(dimensions),
        fromSavedState: ({ dimensions }) => [{ dimensions }],
      });

      expect(() => registry.registerTransform(duplicateTransform)).toThrow(
        'Transform for tab type metrics is already registered.'
      );
    });

    it('rejects duplicate state definitions in a transform', () => {
      const registry = new ProfileStateRegistry();
      registry.registerDefinition(METRICS_STATE_DEF);

      const transform = createProfileSavedStateTransform({
        tabType: DiscoverTabType.Metrics,
        stateDefinitions: [METRICS_STATE_DEF, METRICS_STATE_DEF],
        toSavedState: ([{ dimensions }]) => createSavedMetricsSettings(dimensions),
        fromSavedState: ({ dimensions }) => [{ dimensions }, {}],
      });

      expect(() => registry.registerTransform(transform)).toThrow(
        'State with key metricsState is already included in the transform for tab type metrics.'
      );
    });

    it('maps multiple state definitions to and from ordered tuples', () => {
      const registry = new ProfileStateRegistry();
      const secondaryDefinition: ProfileStateDefinition<{ suffix: string }> = {
        key: 'secondaryState',
        descriptor: { suffix: { type: ProfileStateType.Persistent } },
        defaultState: { suffix: 'default-suffix' },
      };
      const transform = createProfileSavedStateTransform({
        tabType: DiscoverTabType.Metrics,
        stateDefinitions: [METRICS_STATE_DEF, secondaryDefinition],
        toSavedState: ([metricsState, secondaryState]) => ({
          ...createSavedMetricsSettings([...metricsState.dimensions, secondaryState.suffix]),
        }),
        fromSavedState: ({ dimensions }) => [
          { dimensions: dimensions.slice(0, -1) },
          { suffix: dimensions.at(-1) },
        ],
      });

      registry.registerDefinition(METRICS_STATE_DEF);
      registry.registerDefinition(secondaryDefinition);
      registry.registerTransform(transform);

      const savedState = registry.toSavedState(DiscoverTabType.Metrics, {
        metricsState: { dimensions: ['host.name'] },
      });

      expect(savedState).toEqual({
        type: DiscoverTabType.Metrics,
        ...createSavedMetricsSettings(['host.name', 'default-suffix']),
      });
      expect(registry.fromSavedState(savedState)).toEqual({
        metricsState: { dimensions: ['host.name'] },
        secondaryState: { suffix: 'default-suffix' },
      });
    });
  });

  it('picks registered fields by state type', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.pickStateByType({
        profileStateMap: {
          testProfileState: {
            uiValue: 'ui',
            urlValue: 'url',
            persistentValue: 'persistent',
          },
          unregisteredProfileState: { uiValue: 'ignored' },
        },
        stateTypes: [ProfileStateType.Ui],
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
        profileStateMap: {
          testProfileState: {
            uiValue: 'ui',
          },
        },
        stateTypes: [ProfileStateType.Persistent],
      })
    ).toEqual({});
  });

  it('returns an empty object when picking state by type from undefined state', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.pickStateByType({
        profileStateMap: undefined,
        stateTypes: [ProfileStateType.Persistent],
      })
    ).toEqual({});
  });

  it('ignores sparse and unregistered fields when picking state by type', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.pickStateByType({
        profileStateMap: {
          testProfileState: {
            uiValue: 'ui',
            unregisteredValue: 'ignored',
          },
          unregisteredProfileState: {
            uiValue: 'ignored',
          },
        },
        stateTypes: [ProfileStateType.Ui],
      })
    ).toEqual({
      testProfileState: {
        uiValue: 'ui',
      },
    });
  });

  it('picks state by type expanded with defaults for requested types', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.pickStateByType({
        profileStateMap: {
          testProfileState: {
            uiValue: 'ui',
            persistentValue: 'persistent',
          },
        },
        stateTypes: [ProfileStateType.Url, ProfileStateType.Persistent],
        defaultsHandling: 'expand',
      })
    ).toEqual({
      testProfileState: {
        urlValue: 'defaultUrl',
        persistentValue: 'persistent',
      },
    });
  });

  it('picks no expanded state when no registered fields match the requested type', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.pickStateByType({
        profileStateMap: {
          testProfileState: {
            uiValue: 'ui',
          },
          unregisteredProfileState: {
            persistentValue: 'ignored',
          },
        },
        stateTypes: [ProfileStateType.Persistent],
        defaultsHandling: 'expand',
      })
    ).toEqual({});
  });

  it('picks state by type stripped of default values', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.pickStateByType({
        profileStateMap: {
          testProfileState: {
            uiValue: 'defaultUi',
            urlValue: 'url',
            persistentValue: 'defaultPersistent',
            nestedValue: { count: 0 },
          },
        },
        stateTypes: [ProfileStateType.Ui, ProfileStateType.Url, ProfileStateType.Persistent],
        defaultsHandling: 'strip',
      })
    ).toEqual({
      testProfileState: {
        urlValue: 'url',
      },
    });
  });

  it('omits default-only state when stripping defaults', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.pickStateByType({
        profileStateMap: {
          testProfileState: TEST_PROFILE_STATE_DEF.defaultState,
        },
        stateTypes: [ProfileStateType.Ui, ProfileStateType.Url, ProfileStateType.Persistent],
        defaultsHandling: 'strip',
      })
    ).toEqual({});
  });

  it('merges registered profile state maps in order', () => {
    const registry = new ProfileStateRegistry();
    const secondaryProfileStateDef: ProfileStateDefinition<{
      secondaryUiValue: string;
      secondaryUrlValue: string;
    }> = {
      key: 'secondaryProfileState',
      descriptor: {
        secondaryUiValue: { type: ProfileStateType.Ui },
        secondaryUrlValue: { type: ProfileStateType.Url },
      },
      defaultState: {
        secondaryUiValue: 'defaultSecondaryUi',
        secondaryUrlValue: 'defaultSecondaryUrl',
      },
    };

    registry.registerDefinition(TEST_PROFILE_STATE_DEF);
    registry.registerDefinition(secondaryProfileStateDef);

    expect(
      registry.mergeState(
        {
          testProfileState: {
            uiValue: 'firstUi',
            urlValue: 'firstUrl',
            unregisteredValue: 'ignored',
          },
          secondaryProfileState: {
            secondaryUrlValue: 'firstSecondaryUrl',
          },
          unregisteredProfileState: {
            uiValue: 'ignored',
          },
        },
        undefined,
        {
          testProfileState: {
            uiValue: 'secondUi',
            persistentValue: 'secondPersistent',
          },
          secondaryProfileState: {
            secondaryUiValue: 'secondSecondaryUi',
          },
        }
      )
    ).toEqual({
      testProfileState: {
        uiValue: 'secondUi',
        urlValue: 'firstUrl',
        persistentValue: 'secondPersistent',
      },
      secondaryProfileState: {
        secondaryUrlValue: 'firstSecondaryUrl',
        secondaryUiValue: 'secondSecondaryUi',
      },
    });
  });

  it('returns an empty object when merging only undefined or unregistered state', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.mergeState(undefined, {
        unregisteredProfileState: {
          uiValue: 'ignored',
        },
      })
    ).toEqual({});
  });

  it('picks fields by state type from a single profile state object', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.filterFieldsByType({
        profileState: {
          uiValue: 'ui',
          urlValue: 'url',
          persistentValue: 'persistent',
          nestedValue: { count: 1 },
        },
        stateKey: TEST_PROFILE_STATE_DEF.key,
        stateTypes: [ProfileStateType.Ui, ProfileStateType.Url],
      })
    ).toEqual({
      uiValue: 'ui',
      urlValue: 'url',
      nestedValue: { count: 1 },
    });
  });

  it('returns undefined when no fields match a single profile state object', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.filterFieldsByType({
        profileState: {
          uiValue: 'ui',
        },
        stateKey: TEST_PROFILE_STATE_DEF.key,
        stateTypes: [ProfileStateType.Persistent],
      })
    ).toBeUndefined();
  });

  it('picks fields by state type from a single profile state object expanded with defaults', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.filterFieldsByType({
        profileState: {
          uiValue: 'ui',
          persistentValue: 'persistent',
        },
        stateKey: TEST_PROFILE_STATE_DEF.key,
        stateTypes: [ProfileStateType.Url, ProfileStateType.Persistent],
        defaultsHandling: 'expand',
      })
    ).toEqual({
      urlValue: 'defaultUrl',
      persistentValue: 'persistent',
    });
  });

  it('picks fields by state type from a single profile state object stripped of defaults', () => {
    const registry = new ProfileStateRegistry();
    registry.registerDefinition(TEST_PROFILE_STATE_DEF);

    expect(
      registry.filterFieldsByType({
        profileState: {
          uiValue: 'ui',
          urlValue: 'defaultUrl',
          persistentValue: 'defaultPersistent',
          nestedValue: { count: 0 },
        },
        stateKey: TEST_PROFILE_STATE_DEF.key,
        stateTypes: [ProfileStateType.Ui, ProfileStateType.Url, ProfileStateType.Persistent],
        defaultsHandling: 'strip',
      })
    ).toEqual({
      uiValue: 'ui',
    });
  });
});
