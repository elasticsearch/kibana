/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SerializableRecord } from '@kbn/utility-types';
import type { DiscoverTabType } from '@kbn/discover-session-constants';
import type { DiscoverSessionTabTypeState } from '@kbn/saved-search-plugin/common';
import { isEqual } from 'lodash';

/**
 * Field-level lifetime preference for profile state values.
 */
export enum ProfileStateType {
  /**
   * Ephemeral UI state for the current host/session.
   */
  Ui = 'ui',
  /**
   * URL-addressable state when the host supports URL syncing.
   */
  Url = 'url',
  /**
   * Persisted state when the host supports state persistence.
   */
  Persistent = 'persistent',
}

/**
 * Profile state field types that the host persists in local tab storage across reloads.
 */
export const LOCALLY_PERSISTED_PROFILE_STATE_TYPES = [
  ProfileStateType.Persistent,
  ProfileStateType.Url,
];

/**
 * Describes the intended lifetime for each field in a profile state definition.
 */
export type ProfileStateDescriptor<TState extends SerializableRecord> = {
  [key in keyof TState]: {
    type: ProfileStateType;
  };
};

/**
 * Typed state definition registered by profile providers and consumed via
 * `ContextAwarenessToolkit.getStateAdapter`.
 */
export interface ProfileStateDefinition<TState extends SerializableRecord> {
  /**
   * Unique storage key for this profile state blob.
   */
  key: string;
  /**
   * Field-level lifetime metadata for this state shape.
   */
  descriptor: ProfileStateDescriptor<TState>;
  /**
   * Typed fallback returned before any host state has been written.
   */
  defaultState: TState;
}

/**
 * A map of profile state blobs keyed by their registered definition key.
 */
export type ProfileStateMap = Record<string, SerializableRecord | undefined>;

/**
 * Controls how registered default values are handled when filtering profile state.
 */
export type ProfileStateDefaultsHandling = 'none' | 'expand' | 'strip';

type SavedTabType = DiscoverSessionTabTypeState['type'];

type TabTypeState<TTabType extends SavedTabType> = Omit<
  Extract<DiscoverSessionTabTypeState, { type: TTabType }>,
  'type'
>;

type ProfileStateDefinitions = readonly ProfileStateDefinition<SerializableRecord>[];

type ProfileStates<TDefinitions extends ProfileStateDefinitions> = {
  [TIndex in keyof TDefinitions]: TDefinitions[TIndex]['defaultState'];
};

type PartialProfileStates<TDefinitions extends ProfileStateDefinitions> = {
  [TIndex in keyof TDefinitions]: Partial<TDefinitions[TIndex]['defaultState']>;
};

/** Maps an ordered tuple of profile states to and from a tab type's complete saved payload. */
export interface ProfileSavedStateTransform<
  TTabType extends SavedTabType,
  TDefinitions extends ProfileStateDefinitions
> {
  /** Saved tab type handled by this transform. */
  tabType: TTabType;
  /** State definitions in the order expected and returned by the transform callbacks. */
  stateDefinitions: TDefinitions;
  /** Converts effective profile states, with defaults expanded, to the complete saved payload. */
  toSavedState: (profileStates: ProfileStates<TDefinitions>) => TabTypeState<TTabType>;
  /** Restores partial profile states in the same order as `stateDefinitions`. */
  fromSavedState: (savedState: TabTypeState<TTabType>) => PartialProfileStates<TDefinitions>;
}

/** Identity helper so callers don't have to write the transform's generics by hand. */
export const createProfileSavedStateTransform = <
  TTabType extends SavedTabType,
  const TDefinitions extends ProfileStateDefinitions
>(
  transform: ProfileSavedStateTransform<TTabType, TDefinitions>
): ProfileSavedStateTransform<TTabType, TDefinitions> => transform;

type ProfileStateDescriptorEntry<TState extends SerializableRecord> = [
  keyof TState,
  ProfileStateDescriptor<TState>[keyof TState]
];

const getProfileStateDescriptorEntries = <TState extends SerializableRecord>(
  descriptor: ProfileStateDescriptor<TState>
): Array<ProfileStateDescriptorEntry<TState>> => {
  return Object.entries(descriptor) as Array<ProfileStateDescriptorEntry<TState>>;
};

type RegisteredTransform = ProfileSavedStateTransform<SavedTabType, ProfileStateDefinitions>;

/**
 * Registry of profile state definitions and saved state transforms supported by Discover.
 */
export class ProfileStateRegistry {
  private readonly stateDefinitions = new Map<string, ProfileStateDefinition<SerializableRecord>>();
  private readonly stateTransforms = new Map<DiscoverTabType, RegisteredTransform>();

  /**
   * Registers a profile state definition. Keys must be globally unique.
   */
  public registerDefinition<TState extends SerializableRecord>(
    definition: ProfileStateDefinition<TState>
  ) {
    if (this.stateDefinitions.has(definition.key)) {
      throw new Error(`State with key ${definition.key} is already registered.`);
    }

    this.stateDefinitions.set(definition.key, definition);
  }

  /**
   * Returns true when the requested definition matches the registered descriptor and default state.
   */
  public hasDefinition<TState extends SerializableRecord>(
    definition: ProfileStateDefinition<TState>
  ): boolean {
    const registeredDefinition = this.stateDefinitions.get(definition.key);

    if (!registeredDefinition) {
      return false;
    }

    return (
      isEqual(registeredDefinition.descriptor, definition.descriptor) &&
      isEqual(registeredDefinition.defaultState, definition.defaultState)
    );
  }

  /**
   * Registers a saved state transform for an ordered tuple of matching state definitions.
   */
  public registerTransform<
    TTabType extends SavedTabType,
    const TDefinitions extends ProfileStateDefinitions
  >(transform: ProfileSavedStateTransform<TTabType, TDefinitions>) {
    if (this.stateTransforms.has(transform.tabType)) {
      throw new Error(`Transform for tab type ${transform.tabType} is already registered.`);
    }

    const definitionKeys = new Set<string>();

    for (const definition of transform.stateDefinitions) {
      if (!this.hasDefinition(definition)) {
        throw new Error(
          `State with key ${definition.key} must be registered before this transform.`
        );
      }

      if (definitionKeys.has(definition.key)) {
        throw new Error(
          `State with key ${definition.key} is already included in the transform for tab type ${transform.tabType}.`
        );
      }

      definitionKeys.add(definition.key);
    }

    this.stateTransforms.set(transform.tabType, transform as unknown as RegisteredTransform);
  }

  /**
   * Builds saved state from each transform's effective runtime state.
   */
  public toSavedState(
    tabType: DiscoverTabType | undefined,
    profileStateMap: ProfileStateMap
  ): DiscoverSessionTabTypeState | undefined {
    if (!tabType) {
      return undefined;
    }

    const transform = this.stateTransforms.get(tabType);

    if (!transform) {
      return undefined;
    }

    const states = transform.stateDefinitions.map((definition) => ({
      ...definition.defaultState,
      ...profileStateMap[definition.key],
    }));
    const payload = transform.toSavedState(states);

    return { type: tabType, ...payload } as DiscoverSessionTabTypeState;
  }

  /**
   * Restores registered profile state and ignores unclaimed saved fields.
   */
  public fromSavedState(tabTypeState: DiscoverSessionTabTypeState | undefined): ProfileStateMap {
    const profileStateMap: ProfileStateMap = {};

    if (!tabTypeState) {
      return profileStateMap;
    }

    const { type, ...payload } = tabTypeState;
    const transform = this.stateTransforms.get(type);

    if (!transform) {
      return profileStateMap;
    }

    const states = transform.fromSavedState(payload);

    for (const [index, definition] of transform.stateDefinitions.entries()) {
      profileStateMap[definition.key] = states[index];
    }

    return profileStateMap;
  }

  /**
   * Filters a profile state map by field lifetime type. Unregistered state keys and entries with no
   * matching fields are omitted from the returned map.
   *
   * When `defaultsHandling` is `expand`, each returned entry is merged over the registered default
   * fields for the requested state types. When `defaultsHandling` is `strip`, default-valued fields
   * are omitted from returned entries.
   */
  public pickStateByType({
    profileStateMap,
    stateTypes,
    defaultsHandling = 'none',
  }: {
    profileStateMap: ProfileStateMap | undefined;
    stateTypes: ProfileStateType[];
    defaultsHandling?: ProfileStateDefaultsHandling;
  }): ProfileStateMap {
    const filteredStateMap: ProfileStateMap = {};

    if (!profileStateMap) {
      return filteredStateMap;
    }

    const stateTypeSet = new Set(stateTypes);

    for (const [stateKey, profileState] of Object.entries(profileStateMap)) {
      const filteredState = this.filterFieldsByType({
        profileState,
        stateKey,
        stateTypes: stateTypeSet,
        defaultsHandling,
      });

      if (filteredState) {
        filteredStateMap[stateKey] = filteredState;
      }
    }

    return filteredStateMap;
  }

  /**
   * Merges registered profile state maps in argument order. Later maps override earlier fields for
   * the same registered state key. Unregistered state keys and fields are omitted.
   */
  public mergeState(
    ...profileStateMaps: Array<ProfileStateMap | null | undefined>
  ): ProfileStateMap {
    const mergedStateMap: ProfileStateMap = {};

    for (const profileStateMap of profileStateMaps) {
      if (!profileStateMap) {
        continue;
      }

      for (const [stateKey, profileState] of Object.entries(profileStateMap)) {
        const definition = this.stateDefinitions.get(stateKey);

        if (!definition || !profileState) {
          continue;
        }

        const mergedProfileState = mergedStateMap[stateKey] ?? {};

        for (const [field, value] of Object.entries(profileState)) {
          if (definition.descriptor[field]?.type) {
            mergedProfileState[field] = value;
          }
        }

        if (Object.keys(mergedProfileState).length > 0) {
          mergedStateMap[stateKey] = mergedProfileState;
        }
      }
    }

    return mergedStateMap;
  }

  /**
   * Filters one profile state object by field lifetime type using the registered definition for
   * `stateKey`.
   *
   * Returns `undefined` when the state key is not registered, the state is missing, or no fields
   * match the requested type. When `defaultsHandling` is `expand`, the matching fields are merged
   * over the registered default fields for the requested state types. When `defaultsHandling` is
   * `strip`, fields equal to the registered defaults are omitted.
   */
  public filterFieldsByType<TState extends SerializableRecord>({
    profileState,
    stateKey,
    stateTypes,
    defaultsHandling = 'none',
  }: {
    profileState: Partial<TState> | undefined;
    stateKey: ProfileStateDefinition<TState>['key'];
    stateTypes: ProfileStateType[] | Set<ProfileStateType>;
    defaultsHandling?: ProfileStateDefaultsHandling;
  }): Partial<TState> | undefined {
    const definition = this.stateDefinitions.get(stateKey) as
      | ProfileStateDefinition<TState>
      | undefined;

    if (!definition || !profileState) {
      return undefined;
    }

    const stateTypeSet = stateTypes instanceof Set ? stateTypes : new Set(stateTypes);
    const filteredState: Partial<TState> = {};

    let shouldReturnFilteredState = false;

    for (const [field, descriptor] of getProfileStateDescriptorEntries(definition.descriptor)) {
      if (!stateTypeSet.has(descriptor.type)) {
        continue;
      }

      const profileStateHasField = Object.hasOwn(profileState, field);

      // Expand fills requested defaults but only returns when at least one requested field is
      // explicit; none preserves explicit fields; strip preserves explicit non-default fields.
      if (defaultsHandling === 'expand') {
        if (profileStateHasField) {
          shouldReturnFilteredState = true;
          filteredState[field] = profileState[field];
        } else {
          filteredState[field] = definition.defaultState[field];
        }
      } else if (
        profileStateHasField &&
        (defaultsHandling === 'none' ||
          !isEqual(profileState[field], definition.defaultState[field]))
      ) {
        shouldReturnFilteredState = true;
        filteredState[field] = profileState[field];
      }
    }

    return shouldReturnFilteredState ? filteredState : undefined;
  }
}
