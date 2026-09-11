/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConfigProperties } from '@kbn/inference-common';
import { type ServiceProviderKeys } from '../../constants';
import type { FieldsConfiguration } from '../types';

export { FieldType, type ConfigProperties } from '@kbn/inference-common';
export interface SelectOption {
  label: string;
  value: string;
  icon?: string;
}

export interface Dependency {
  field: string;
  value: string | number | boolean | null;
}

export interface ConfigCategoryProperties {
  label: string;
  order: number;
  type: 'category';
}

export interface Validation {
  constraint: string | number;
  type: string;
}

interface ConfigEntry extends ConfigProperties {
  key: string;
}

export interface ConfigEntryView extends ConfigEntry {
  isValid: boolean;
  validationErrors: string[];
  value: string | number | boolean | null;
}

type ServiceProviderKeysType = keyof typeof ServiceProviderKeys;
export interface OverrideFieldsContentType {
  serverlessOnly?: boolean;
  hidden?: string[];
  additional?: FieldsConfiguration[];
  supplementalData?: Record<string, Partial<ConfigProperties>>[];
  /** Default values to apply to existing provider configuration fields (e.g., model_id default values) */
  defaultValues?: Record<string, string | number | boolean | null>;
}
export type InternalOverrideFieldsType = {
  [Key in ServiceProviderKeysType | string]?: OverrideFieldsContentType;
};
