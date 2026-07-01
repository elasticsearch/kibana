/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface ScoutTestableModule {
  name: string;
  group: string;
  type: 'plugin' | 'package';
  visibility: 'shared' | 'private';
  root: string;
}

export interface ScoutTestableModuleWithConfigs extends ScoutTestableModule {
  configs: Omit<ScoutTestConfig, 'module'>[];
}

import { type ScoutTestConfig, testConfigs } from './test_config';

export const testableModules = {
  get all(): ScoutTestableModule[] {
    const seenModules: string[] = [];
    return testConfigs.all.reduce<ScoutTestableModule[]>((modules, config) => {
      if (!seenModules.includes(config.module.root)) {
        modules.push(config.module);
        seenModules.push(config.module.root);
      }
      return modules;
    }, []);
  },

  get allIncludingConfigs(): ScoutTestableModuleWithConfigs[] {
    return this.all.map((module) => ({
      ...module,
      configs: [
        ...testConfigs.forModule(module.name, module.type).map((config) => ({
          path: config.path,
          category: config.category,
          type: config.type,
          namespace: config.namespace,
          manifest: config.manifest,
          server: config.server,
        })),
      ],
    }));
  },

  ofType(moduleType: ScoutTestableModule['type']): ScoutTestableModule[] {
    return testableModules.all.filter((module) => module.type === moduleType);
  },

  get plugins(): ScoutTestableModule[] {
    return testableModules.ofType('plugin');
  },

  get packages(): ScoutTestableModule[] {
    return testableModules.ofType('package');
  },
};
