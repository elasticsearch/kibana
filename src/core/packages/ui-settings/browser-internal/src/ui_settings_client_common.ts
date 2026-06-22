/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { cloneDeep, defaultsDeep } from 'lodash';
import type { Observable } from 'rxjs';
import { Subject, concat, defer, of } from 'rxjs';
import { filter, map } from 'rxjs';

import type { UiSettingsRuntimeEntry, UserProvidedValues } from '@kbn/core-ui-settings-common';
import type { IUiSettingsClient, UiSettingsRuntimeState } from '@kbn/core-ui-settings-browser';

import type { UiSettingsApi } from './ui_settings_api';

export interface UiSettingsClientParams {
  api: UiSettingsApi;
  defaults: Record<string, UiSettingsRuntimeEntry>;
  initialSettings?: UiSettingsRuntimeState;
  done$: Observable<unknown>;
}

export abstract class UiSettingsClientCommon implements IUiSettingsClient {
  protected readonly update$ = new Subject<{ key: string; newValue: any; oldValue: any }>();
  protected readonly updateErrors$ = new Subject<Error>();

  protected readonly api: UiSettingsApi;
  protected readonly defaults: Record<string, UiSettingsRuntimeEntry>;
  protected cache: Record<string, UiSettingsRuntimeEntry & UserProvidedValues>;

  constructor(params: UiSettingsClientParams) {
    this.api = params.api;
    this.defaults = cloneDeep(params.defaults);
    this.cache = defaultsDeep(
      Object.create(null),
      this.defaults,
      cloneDeep(params.initialSettings)
    );

    params.done$.subscribe({
      complete: () => {
        this.update$.complete();
        this.updateErrors$.complete();
      },
    });
  }

  getAll() {
    return cloneDeep(this.cache);
  }

  get<T = any>(key: string, defaultOverride?: T) {
    const declared = this.isDeclared(key);
    if (!declared && defaultOverride !== undefined) {
      return defaultOverride;
    }

    if (!declared) {
      throw new Error(
        `Unexpected \`IUiSettingsClient.get("${key}")\` call on unrecognized configuration setting "${key}".
Setting an initial value via \`IUiSettingsClient.set("${key}", value)\` before attempting to retrieve
any custom setting value for "${key}" may fix this issue.
You can use \`IUiSettingsClient.get("${key}", defaultValue)\`, which will just return
\`defaultValue\` when the key is unrecognized.`
      );
    }

    const type = this.cache[key].type;
    const userValue = this.cache[key].userValue;
    const defaultValue = defaultOverride !== undefined ? defaultOverride : this.cache[key].value;
    const value = userValue == null ? defaultValue : userValue;
    if (type === 'json') {
      // Defensively handle corrupted settings that can't be parsed.
      // If parsing fails, fall back to the default value to allow safe retrieval and restoration.
      try {
        // Empty strings are invalid JSON and will throw, so check first
        if (typeof value === 'string' && value.trim() === '') {
          return defaultValue;
        }
        return JSON.parse(value);
      } catch (e) {
        // If parsing fails (corrupted setting), return the default value
        // This allows users to safely retrieve and fix corrupted settings
        return defaultValue;
      }
    }

    if (type === 'number') {
      return parseFloat(value);
    }

    return value;
  }

  get$<T = any>(key: string, defaultOverride?: T) {
    return concat(
      defer(() => of(this.get(key, defaultOverride))),
      this.update$.pipe(
        filter((update) => update.key === key),
        map(() => this.get(key, defaultOverride))
      )
    );
  }

  async set(key: string, value: any) {
    return await this.update(key, value);
  }

  async remove(key: string) {
    return await this.update(key, null);
  }

  isDeclared(key: string) {
    return (
      // @ts-expect-error
      (key !== '__proto__' || key !== 'constructor' || key !== 'prototype') && key in this.cache
    );
  }

  isDefault(key: string) {
    return (
      !this.isDeclared(key) ||
      !this.cache[key].userValue ||
      this.cache[key].userValue === this.cache[key].value
    );
  }

  isCustom(key: string) {
    return this.isDeclared(key) && !('value' in this.cache[key]);
  }

  isOverridden(key: string) {
    return this.isDeclared(key) && Boolean(this.cache[key].isOverridden);
  }

  isStrictReadonly(key: string) {
    return this.isDeclared(key) && Boolean(this.cache[key].readonlyMode === 'strict');
  }

  getUpdate$() {
    return this.update$.asObservable();
  }

  getUpdateErrors$() {
    return this.updateErrors$.asObservable();
  }

  async validateValue(key: string, value: unknown) {
    try {
      const resp = await this.api.validate(key, value);
      const isValid = resp.valid;
      return isValid
        ? { successfulValidation: true, valid: true }
        : { successfulValidation: true, valid: false, errorMessage: resp.errorMessage };
    } catch (error) {
      this.updateErrors$.next(error);
      return { successfulValidation: false };
    }
  }

  protected assertUpdateAllowed(key: string) {
    if (this.isOverridden(key)) {
      throw new Error(
        `Unable to update "${key}" because its value is overridden by the Kibana server`
      );
    }
    if (this.isStrictReadonly(key)) {
      throw new Error(`Unable to update "${key}" because this setting is not in the allowlist.`);
    }
  }

  protected abstract update(key: string, newVal: any): Promise<boolean>;

  protected setLocally(key: string, newValue: any) {
    this.assertUpdateAllowed(key);

    if (!this.isDeclared(key)) {
      this.cache[key] = {};
    }

    const oldValue = this.get(key);

    if (newValue === null) {
      delete this.cache[key].userValue;
    } else {
      const { type } = this.cache[key];
      if (type === 'json' && typeof newValue !== 'string') {
        this.cache[key].userValue = JSON.stringify(newValue);
      } else {
        this.cache[key].userValue = newValue;
      }
    }

    this.update$.next({ key, newValue, oldValue });
  }
}
