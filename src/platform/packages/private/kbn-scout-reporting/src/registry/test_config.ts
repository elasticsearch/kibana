/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { globSync } from 'fast-glob';
import { REPO_ROOT } from '@kbn/repo-info';
import path from 'node:path';
import { ToolingLog } from '@kbn/tooling-log';
import { SCOUT_CONFIG_PATH_GLOB, SCOUT_UNIFIED_CONFIG_PATH_REGEX } from '@kbn/scout-info';
import { existsSync, readFileSync } from 'node:fs';
import { readKibanaModuleManifest } from '../helpers/read_manifest';
import type { ScoutTestableModule } from './testable_module';
import type { ScoutConfigManifest } from './manifest';

export interface ScoutTestConfig {
  path: string;
  category: string;
  type: string;
  namespace: string | undefined;
  module: ScoutTestableModule;
  manifest: ScoutConfigManifest;
  server: {
    configSet: string;
  };
}

const loadScoutManifestFile = (
  manifestPath: string
): { exists: boolean } & Pick<ScoutConfigManifest, 'sha1' | 'tests'> => {
  const absoluteManifestPath = path.join(REPO_ROOT, manifestPath);
  const manifestExists = existsSync(absoluteManifestPath);
  if (manifestExists) {
    try {
      return {
        exists: true,
        ...JSON.parse(readFileSync(absoluteManifestPath, 'utf8')),
      };
    } catch (e) {
      e.message = `Failed while trying to load manifest file at '${manifestPath}': ${e.message}`;
      throw e;
    }
  }
  return {
    exists: false,
    sha1: '000000000000000-000000000000000',
    tests: [],
  };
};

const resolveModuleMetadata = (
  configPath: string,
  moduleRoot: string
): {
  module: ScoutTestableModule;
  serverConfigSet: string | undefined;
  namespace: string | undefined;
  testCategory: string;
  testConfigType: string;
} => {
  const match = configPath.match(SCOUT_UNIFIED_CONFIG_PATH_REGEX);
  if (!match?.groups) {
    throw new Error(
      `Failed to create Scout config from path '${configPath}': ` +
        'path did not match the expected regex pattern'
    );
  }

  const g = match.groups;
  const module: ScoutTestableModule = g.coreRoot
    ? {
        name: 'core',
        group: 'platform',
        type: 'package' as ScoutTestableModule['type'],
        visibility: 'shared' as ScoutTestableModule['visibility'],
        root: moduleRoot,
      }
    : g.examplesRoot
    ? (() => {
        const manifest = readKibanaModuleManifest(path.join(REPO_ROOT, moduleRoot, 'kibana.jsonc'));
        return {
          name: manifest.id,
          group: manifest.group,
          type: manifest.type as ScoutTestableModule['type'],
          visibility: manifest.visibility as ScoutTestableModule['visibility'],
          root: moduleRoot,
        };
      })()
    : {
        name: g.moduleName,
        group: g.platformOrCore ?? g.solution,
        type: g.moduleKind.slice(0, -1) as ScoutTestableModule['type'],
        visibility: (g.moduleVisibility || 'private') as ScoutTestableModule['visibility'],
        root: moduleRoot,
      };

  return {
    module,
    serverConfigSet: g.serverConfigSet,
    namespace: g.namespace,
    testCategory: g.testCategory,
    testConfigType: g.testConfigType,
  };
};

export const testConfig = {
  fromPath(configPath: string): ScoutTestConfig {
    // Make sure we're working with a path relative to the repo root
    if (path.isAbsolute(configPath)) {
      configPath = path.relative(REPO_ROOT, configPath);
    }

    if (configPath.startsWith('..')) {
      throw new Error(
        `Failed to create Scout config from path '${configPath}': ` +
          `path ${path.resolve(configPath)} is not part of the Kibana repository at ${REPO_ROOT}`
      );
    }

    const moduleRoot = configPath.split('/test/scout')[0];
    const { module, serverConfigSet, namespace, testCategory, testConfigType } =
      resolveModuleMetadata(configPath, moduleRoot);

    const scoutDirName = `scout${serverConfigSet ? `_${serverConfigSet}` : ''}`;
    const manifestPath = namespace
      ? path.join(
          moduleRoot,
          'test',
          scoutDirName,
          namespace,
          '.meta',
          testCategory,
          `${testConfigType || 'standard'}.json`
        )
      : path.join(
          moduleRoot,
          'test',
          scoutDirName,
          '.meta',
          testCategory,
          `${testConfigType || 'standard'}.json`
        );
    const manifestFileData = loadScoutManifestFile(manifestPath);

    return {
      path: configPath,
      category: testCategory,
      type: testConfigType || 'standard',
      namespace,
      module,
      manifest: {
        path: manifestPath,
        exists: manifestFileData.exists,
        sha1: manifestFileData.sha1,
        tests: manifestFileData.tests,
      },
      server: {
        configSet: serverConfigSet || 'default',
      },
    };
  },
};

export const testConfigs = {
  _configs: null as ScoutTestConfig[] | null,
  log: new ToolingLog(),

  findPaths(): string[] {
    const pattern = path.join(REPO_ROOT, SCOUT_CONFIG_PATH_GLOB);
    const configPaths = globSync(pattern, { onlyFiles: true });
    return configPaths.map((configPath) => path.relative(REPO_ROOT, configPath));
  },

  _load() {
    const action = this._configs === null ? 'Load' : 'Reload';
    this.log.info(`${action}ing Scout test configs`);

    const startTime = performance.now();
    this._configs = this.findPaths().map(testConfig.fromPath);
    const duration = (performance.now() - startTime) / 1000;

    this.log.info(`Loaded ${this._configs.length} Scout test configs in ${duration.toFixed(2)}s`);

    // A scout root must be either root-level or namespace-based, never both.
    // scout_* roots are independent from scout/, so group by (module.root + serverConfigSet).
    const byRoot = new Map<string, ScoutTestConfig[]>();
    for (const config of this._configs) {
      const key = `${config.module.root}/test/${
        config.server.configSet === 'default' ? 'scout' : `scout_${config.server.configSet}`
      }`;
      if (!byRoot.has(key)) byRoot.set(key, []);
      byRoot.get(key)!.push(config);
    }
    const mixedRoots: string[] = [];
    for (const [scoutRoot, rootConfigs] of byRoot) {
      const hasRootLevel = rootConfigs.some((c) => !c.namespace);
      const hasNamespace = rootConfigs.some((c) => Boolean(c.namespace));
      if (hasRootLevel && hasNamespace) {
        const namespaceNames = [
          ...new Set(rootConfigs.filter((c) => c.namespace).map((c) => c.namespace as string)),
        ];
        mixedRoots.push(
          `  • ${scoutRoot}: root-level {ui,api}/ coexists with namespace dirs [${namespaceNames.join(
            ', '
          )}]`
        );
      }
    }
    if (mixedRoots.length > 0) {
      throw new Error(
        `[Scout] Mixed test structure detected — a scout root must use either ` +
          `root-level (test/scout/{ui,api}/) or namespace-based (test/scout/<namespace>/{ui,api}/) ` +
          `structure, never both:\n\n` +
          mixedRoots.join('\n') +
          `\n\nMigrate root-level tests into namespace sub-directories or remove the namespace configs.`
      );
    }
  },

  reload() {
    this._load();
  },

  get all(): ScoutTestConfig[] {
    if (this._configs === null) this._load();
    return this._configs!;
  },

  forModule(name: string, type?: ScoutTestableModule['type']): ScoutTestConfig[] {
    const configs = this.all.filter((config) => config.module.name === name);
    return type ? configs.filter((config) => config.module.type === type) : configs;
  },

  forPlugin(pluginName: string): ScoutTestConfig[] {
    return this.forModule(pluginName, 'plugin');
  },

  forPackage(packageName: string): ScoutTestConfig[] {
    return this.forModule(packageName, 'package');
  },
};
