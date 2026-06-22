/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { of } from 'rxjs';
import type { IUiSettingsClient } from '@kbn/core/public';

const settings: Record<string, any> = {
  'theme:darkMode': false,
};

const get = (key: string) => settings[key];

const uiSettings: IUiSettingsClient = {
  get$: (key: string) => of(get(key)),
  get,
  getAll: () => settings,
  isCustom: () => false,
  isOverridden: () => false,
  isDeclared: () => true,
  isDefault: () => true,
  remove: async () => true,
  set: async () => true,
  getUpdate$: () => of({ key: 'setting', newValue: get('setting'), oldValue: get('setting') }),
  getUpdateErrors$: () => of(new Error()),
  validateValue: async () => {
    return { successfulValidation: true, valid: true };
  },
};

export const getUiSettings = () => uiSettings;
export const getSettings = () => {
  return {
    client: uiSettings,
    globalClient: uiSettings,
    metadata: { getAll: async () => ({}) },
  };
};
