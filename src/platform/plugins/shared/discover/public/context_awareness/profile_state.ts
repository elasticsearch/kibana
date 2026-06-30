/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isEqual } from 'lodash';
import type { Observable } from 'rxjs';

/**
 * Host-backed profile state API exposed to profile extension point implementations.
 */
export interface ProfileStateAdapter<TState extends object> {
  /**
   * Returns the current state, falling back to the definition's default state before any value is
   * written by the host.
   */
  getState: () => TState;
  /**
   * Emits the current state and subsequent state changes.
   */
  getState$: () => Observable<TState>;
  /**
   * Replaces the full state value.
   */
  setState: (state: TState) => void;
  /**
   * Applies a shallow immutable update to the current state.
   */
  updateState: (stateUpdate: Partial<TState>) => void;
}

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
 * Describes the intended lifetime for each field in a profile state definition.
 */
export type ProfileStateDescriptor<TState extends object> = {
  [key in keyof TState]: {
    type: ProfileStateType;
  };
};

/**
 * Typed state definition registered by profile providers and consumed via
 * `ContextAwarenessToolkit.getStateAdapter`.
 */
export interface ProfileStateDefinition<TState extends object> {
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
 * Registry of profile state definitions supported by Discover.
 */
export class ProfileStateRegistry {
  private readonly stateDefinitions = new Map<
    string,
    ProfileStateDefinition<Record<string, unknown>>
  >();

  /**
   * Registers a profile state definition. Keys must be globally unique.
   */
  public registerDefinition<TState extends object>(definition: ProfileStateDefinition<TState>) {
    if (this.stateDefinitions.has(definition.key)) {
      throw new Error(`State with key ${definition.key} is already registered.`);
    }

    this.stateDefinitions.set(
      definition.key,
      definition as ProfileStateDefinition<Record<string, unknown>>
    );
  }

  /**
   * Returns true when the requested definition matches the registered descriptor and default state.
   */
  public hasDefinition<TState extends object>(definition: ProfileStateDefinition<TState>): boolean {
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
   * Returns the subset of registered profile state fields matching the requested lifetime type.
   */
  public pickStateByType({
    profileState,
    stateType,
  }: {
    profileState: Record<string, object | undefined>;
    stateType: ProfileStateType;
  }): Record<string, object | undefined> {
    const filteredProfileState: Record<string, object | undefined> = {};

    for (const [rawKey, state] of Object.entries(profileState)) {
      if (!state) {
        continue;
      }

      const definition = this.stateDefinitions.get(rawKey);

      if (!definition) {
        continue;
      }

      const filteredState: Record<string, unknown> = {};

      for (const [field, value] of Object.entries(state)) {
        if (definition.descriptor[field]?.type === stateType) {
          filteredState[field] = value;
        }
      }

      if (Object.keys(filteredState).length > 0) {
        filteredProfileState[rawKey] = filteredState;
      }
    }

    return filteredProfileState;
  }
}

/**
 * Creates a definition-validated, cached adapter factory for host-specific state adapters.
 */
export const createProfileStateAdapterFactory = ({
  createAdapter,
  profileStateRegistry,
}: {
  createAdapter: <TState extends object>(
    definition: ProfileStateDefinition<TState>
  ) => ProfileStateAdapter<TState>;
  profileStateRegistry: ProfileStateRegistry;
}) => {
  const stateAdapters = new Map<string, ProfileStateAdapter<Record<string, unknown>>>();

  return <TState extends object>(definition: ProfileStateDefinition<TState>) => {
    if (!profileStateRegistry.hasDefinition(definition)) {
      throw new Error(`State with key ${definition.key} is not registered.`);
    }

    const existingAdapter = stateAdapters.get(definition.key);

    if (existingAdapter) {
      return existingAdapter as ProfileStateAdapter<TState>;
    }

    const adapter = createAdapter(definition);
    stateAdapters.set(definition.key, adapter as ProfileStateAdapter<Record<string, unknown>>);

    return adapter;
  };
};
