/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readFileSync } from 'fs';
import { parse } from 'yaml';

import { set } from '@kbn/safer-lodash-set';
import { ensureDeepObject } from '@kbn/std';
import { isPlainObject } from 'lodash';

const readYaml = (path: string) => {
  try {
    return parse(readFileSync(path, 'utf8'), { version: '1.1' });
  } catch (e) {
    /* tslint:disable:no-empty */
  }
};

function replaceEnvVarRefs(val: string) {
  return val.replace(/\$\{(\w+)\}/g, (match, envVarName) => {
    const envVarValue = process.env[envVarName];
    if (envVarValue !== undefined) {
      return envVarValue;
    }

    throw new Error(`Unknown environment variable referenced in config : ${envVarName}`);
  });
}

function merge(target: Record<string, any>, value: any, key?: string) {
  if ((isPlainObject(value) || Array.isArray(value)) && Object.keys(value).length > 0) {
    for (const [subKey, subVal] of Object.entries(value)) {
      merge(target, subVal, key ? `${key}.${subKey}` : subKey);
    }
  } else if (key !== undefined) {
    set(target, key, typeof value === 'string' ? replaceEnvVarRefs(value) : value);
  }

  return target;
}

/** @internal */
export const getConfigFromFiles = (configFiles: readonly string[]): Record<string, any> => {
  let mergedYaml: Record<string, any> = {};

  for (const configFile of configFiles) {
    const yaml = readYaml(configFile);
    if (yaml !== null) {
      mergedYaml = merge(mergedYaml, yaml);
    }
  }

  return ensureDeepObject(mergedYaml);
};
