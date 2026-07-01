/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';

export interface TerraformApi {
  path: string;
  methods: string[];
  resource: string;
  owners: string[];
}

export interface TerraformApisConfig {
  terraform_provider_apis: TerraformApi[];
}

const DEFAULT_PATH = resolve(__dirname, '../../terraform_provider_apis.yaml');

export const loadTerraformApis = (configPath?: string): TerraformApi[] => {
  const path = configPath ?? DEFAULT_PATH;

  if (!existsSync(path)) {
    return [];
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const config = parse(content) as TerraformApisConfig;
    return config?.terraform_provider_apis ?? [];
  } catch {
    return [];
  }
};

export const normalizePath = (path: string): string =>
  path.replace(/\{[^{}]+\}/g, '{param}').toLowerCase();

export const buildTerraformApiIndex = (
  apis: TerraformApi[]
): Map<string, Map<string, TerraformApi>> => {
  const index = new Map<string, Map<string, TerraformApi>>();

  for (const api of apis) {
    const normalizedPath = normalizePath(api.path);
    if (!index.has(normalizedPath)) {
      index.set(normalizedPath, new Map());
    }
    for (const method of api.methods) {
      index.get(normalizedPath)!.set(method.toUpperCase(), api);
    }
  }

  return index;
};
