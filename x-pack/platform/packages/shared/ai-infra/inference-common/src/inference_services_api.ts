/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const SERVICE_SETTINGS = 'service_settings';
export const TASK_SETTINGS = 'task_settings';

export enum FieldType {
  STRING = 'str',
  INTEGER = 'int',
  BOOLEAN = 'bool',
  MAP = 'map',
}

export interface ConfigProperties {
  default_value: string | number | boolean | null;
  description: string | null;
  label: string;
  required: boolean;
  sensitive: boolean;
  updatable: boolean;
  type: FieldType;
  supported_task_types: string[];
  location?: typeof SERVICE_SETTINGS | typeof TASK_SETTINGS;
}

export type FieldsConfiguration = Record<string, ConfigProperties>;

export interface InferenceProvider {
  service: string;
  name: string;
  task_types: string[];
  logo?: string;
  configurations: FieldsConfiguration;
}
