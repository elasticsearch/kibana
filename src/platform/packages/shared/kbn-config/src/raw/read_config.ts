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
import { isPlainObject } from 'lodash';
import { ensureValidObjectPath } from '@kbn/std';
import { splitKey, getUnsplittableKey, replaceEnvVarRefs } from './utils';

const readYaml = (path: string) => parse(readFileSync(path, 'utf8'), { version: '1.1' });

interface YamlEntry {
  path: string[];
  value: any;
}

const listEntries = (root: Record<string, any>): YamlEntry[] => {
  const entries: YamlEntry[] = [];

  const recursiveListEntries = (currentLevel: any, currentPath: string[]) => {
    if (isPlainObject(currentLevel) && Object.keys(currentLevel).length > 0) {
      for (const [subKey, subVal] of Object.entries(currentLevel)) {
        const subKeySplits = splitKey(subKey);
        recursiveListEntries(subVal, [...currentPath, ...subKeySplits]);
      }
    } else if (currentPath.length) {
      entries.push({
        path: currentPath,
        value: processEntryValue(currentLevel),
      });
    }
  };

  recursiveListEntries(root, []);
  return entries;
};

const mergeEntries = (entries: YamlEntry[]): Record<string, any> => {
  const root = {};

  entries.forEach((entry) => {
    set(root, entry.path, entry.value);
  });

  return root;
};

function processEntryValue(value: any) {
  if (isPlainObject(value) || Array.isArray(value)) {
    for (const [subKey, subVal] of Object.entries(value)) {
      const unsplitKey = getUnsplittableKey(subKey);
      if (unsplitKey) {
        delete value[subKey];
        set(value, [unsplitKey], processEntryValue(subVal));
      } else {
        const subKeySplits = splitKey(subKey);
        if (subKeySplits.length > 1) delete value[subKey];
        set(value, subKeySplits, processEntryValue(subVal));
      }
    }
  } else if (typeof value === 'string') {
    return replaceEnvVarRefs(value);
  }
  return value;
}

export const getConfigFromFiles = (configFiles: readonly string[]) => {
  const yamlEntries: YamlEntry[] = [];

  for (const configFile of configFiles) {
    const yaml = readYaml(configFile);
    if (yaml) {
      yamlEntries.push(...listEntries(yaml));
    }
  }

  for (const entry of yamlEntries) {
    ensureValidObjectPath(entry.path);
  }

  return mergeEntries(yamlEntries);
};
