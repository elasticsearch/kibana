/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import type {
  UiSettingsParams,
  UiSettingsRuntimeEntry,
  UserProvidedValues,
} from '@kbn/core-ui-settings-common';

export type PublicUiSettingsParams = Omit<UiSettingsParams, 'schema'>;

/** @public */
export type UiSettingsRuntimeState = Record<string, UiSettingsRuntimeEntry & UserProvidedValues>;

/**
 * @deprecated Use {@link UiSettingsRuntimeState} instead.
 * @removeBy 9.0
 */
export type UiSettingsState = Record<string, PublicUiSettingsParams & UserProvidedValues>;

export interface ValueValidation {
  successfulValidation: boolean;
  valid?: boolean;
  errorMessage?: string;
}

/**
 * Client-side client that provides access to the advanced settings stored in elasticsearch.
 * The settings provide control over the behavior of the Kibana application.
 * For example, a user can specify how to display numeric or date fields.
 * Users can adjust the settings via Management UI.
 * {@link IUiSettingsClient}
 *
 * @public
 */
export interface IUiSettingsClient {
  /**
   * Gets the value for a specific uiSetting. If this setting has no user-defined value
   * then the `defaultOverride` parameter is returned (and parsed if setting is of type
   * "json" or "number). If the parameter is not defined and the key is not registered
   * by any plugin then an error is thrown, otherwise reads the default value defined by a plugin.
   */
  get: <T = any>(key: string, defaultOverride?: T) => T;

  /**
   * Gets an observable of the current value for a config key, and all updates to that config
   * key in the future. Providing a `defaultOverride` argument behaves the same as it does in #get()
   */
  get$: <T = any>(key: string, defaultOverride?: T) => Observable<T>;

  /**
   * Gets all uiSettings entries, including the type, default value, and user value
   * for each key. Does not include display metadata (name, description, category).
   */
  getAll: () => Readonly<UiSettingsRuntimeState>;

  /**
   * Sets the value for a uiSetting. If the setting is not registered by any plugin
   * it will be stored as a custom setting. The new value will be synchronously available via
   * the `get()` method and sent to the server in the background. If the request to the
   * server fails then a updateErrors$ will be notified and the setting will be
   * reverted to its value before `set()` was called.
   */
  set: (key: string, value: any) => Promise<boolean>;

  /**
   * Removes the user-defined value for a setting, causing it to revert to the default. This
   * method behaves the same as calling `set(key, null)`, including the synchronization, custom
   * setting, and error behavior of that method.
   */
  remove: (key: string) => Promise<boolean>;

  /**
   * Returns true if the key is a "known" uiSetting, meaning it is either registered
   * by any plugin or was previously added as a custom setting via the `set()` method.
   */
  isDeclared: (key: string) => boolean;

  /**
   * Returns true if the setting has no user-defined value or is unknown
   */
  isDefault: (key: string) => boolean;

  /**
   * Returns true if the setting wasn't registered by any plugin, but was either
   * added directly via `set()`, or is an unknown setting found in the uiSettings saved
   * object
   */
  isCustom: (key: string) => boolean;

  /**
   * Shows whether the uiSettings value set by the user.
   */
  isOverridden: (key: string) => boolean;

  /**
   * Returns an Observable that notifies subscribers of each update to the uiSettings,
   * including the key, newValue, and oldValue of the setting that changed.
   */
  getUpdate$: <T = any>() => Observable<{
    key: string;
    newValue: T;
    oldValue: T;
  }>;

  /**
   * Returns an Observable that notifies subscribers of each error while trying to update
   * the settings, containing the actual Error class.
   */
  getUpdateErrors$: () => Observable<Error>;

  /**
   * Validates a uiSettings value and returns a ValueValidation object.
   */
  validateValue: (key: string, value: any) => Promise<ValueValidation>;
}

/**
 * Full settings metadata including display information (name, description, category, etc.)
 * merged with user-provided values. Used by the Advanced Settings management UI.
 * @public
 */
export type UiSettingsMetadataState = Record<string, PublicUiSettingsParams & UserProvidedValues>;

/**
 * Client for fetching full settings metadata on demand.
 * Unlike IUiSettingsClient which only holds slim runtime data,
 * this client fetches the complete setting definitions from the server.
 * @public
 */
export interface IUiSettingsMetadataClient {
  getAll: (scope: 'namespace' | 'global') => Promise<UiSettingsMetadataState>;
}

/** @public */
export interface SettingsStart {
  client: IUiSettingsClient;
  globalClient: IUiSettingsClient;
  metadata: IUiSettingsMetadataClient;
}

/** @public */
export type SettingsSetup = SettingsStart;
