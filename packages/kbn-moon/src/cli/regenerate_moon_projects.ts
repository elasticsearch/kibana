/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import path from 'path';
import fs from 'fs';

import { parse } from 'yaml';
import deepmerge from 'deepmerge';

import { REPO_ROOT } from '@kbn/repo-info';
import { run } from '@kbn/dev-cli-runner';
import type { Package } from '@kbn/repo-packages';
import type { PackageManifestBaseFields } from '@kbn/repo-packages/modern/types';
import { getPackages } from '@kbn/repo-packages';
import type { ToolingLog } from '@kbn/tooling-log';

import { createFailError } from '@kbn/dev-cli-errors';

import { KIBANA_JSONC_FILENAME, MOON_CONFIG_KEY_ORDER, MOON_CONST } from '../const';
import type { MoonProjectConfig } from './moon_project_type';
import {
  compactFilePathsToGlobs,
  filterPackages,
  readFile,
  readJsonWithComments,
  resolveFirstExisting,
  sortObjectByKeyPriority,
  writeYaml,
  yamlMatchesFile,
} from '../util';

const scriptName = path.relative(REPO_ROOT, process.argv[1]);
const cliOptions = {
  usage: `node ${scriptName}`,
  description: `
        Generates Moon project configuration for a package/plugin from available hints around the package/plugin.
      `,
  flags: {
    string: ['filter'],
    boolean: ['update', 'dependencies', 'dry-run', 'clear', 'check'],
    default: {
      dependencies: true,
    },
    alias: {},
    help: `
          --filter                    Filter packages by name or directory
          --update                    Update existing project configuration(s)
          --no-dependencies           Do not include dependsOn section in the project configuration
          --dry-run                   Do not write to disk
          --check                     Fail (exit 1) if any project configuration is out of date; never writes
          --clear                     Clear the project configuration
        `,
  },
};

let logger: ToolingLog;

export function regenerateMoonProjects() {
  return run(async ({ log, flags, flagsReader }) => {
    logger = log;

    const filter = flagsReader.arrayOfStrings('filter');
    const check = flags.check as boolean | undefined;
    const update = (flags.update as boolean | undefined) || check;
    const dryRun = (flags['dry-run'] as boolean | undefined) || check;
    const clear = flags.clear as boolean | undefined;
    const includeDependencies = !!flags.dependencies;

    const template = readFile(path.resolve(__dirname, MOON_CONST.TEMPLATE_FILE_NAME));

    const projectResults: Record<ProjectCreationResult, string[]> = {
      create: [],
      update: [],
      intact: [],
      delete: [],
      skip: [],
    };

    const allPackages = getPackages(REPO_ROOT);
    const packages: Package[] = filter?.length ? filterPackages(allPackages, filter) : allPackages;
    const allPackageIds = allPackages.map((pkg) => pkg.name);

    for (const pkg of packages) {
      log.verbose(`Generating project configuration for ${pkg.name}`);
      const pathInPackage = (fileName: string) =>
        path.resolve(pkg.normalizedRepoRelativeDir, fileName);
      const kibanaJsonc = readJsonWithComments(pathInPackage(KIBANA_JSONC_FILENAME));
      let projectConfig = buildBaseProjectConfig(template, pkg, kibanaJsonc);

      applyTsConfigSettings(projectConfig, {
        tsConfigPath: pathInPackage('tsconfig.json'),
        allPackageIds,
        includeDependencies,
      });

      applyPackageJsonSettings(projectConfig, pathInPackage('package.json'));

      applyJestTaskConfig(projectConfig);

      projectConfig = applyDevOverrides(
        projectConfig,
        pathInPackage(MOON_CONST.EXTENSION_FILE_NAME)
      );

      const result = writeProjectConfigFile(
        pathInPackage(MOON_CONST.MOON_CONFIG_FILE_NAME),
        projectConfig,
        {
          update,
          clear,
          dryRun,
        }
      );
      projectResults[result].push(pkg.name);
    }

    log.success(
      [
        `🎉 Moon project configuration successful:`,
        ` ${projectResults.create.length} created`,
        ` ${projectResults.delete.length} deleted`,
        ` ${projectResults.update.length} updated`,
        ` ${projectResults.intact.length} already up to date`,
        ` ${projectResults.skip.length} exists (use --update to update)`,
      ].join('\n')
    );

    if (check) {
      const outOfDate = [...projectResults.create, ...projectResults.update];
      if (outOfDate.length > 0) {
        throw createFailError(
          `${outOfDate.length} Moon project configuration(s) out of date: ${outOfDate.join(
            ', '
          )}\nRun 'node ${scriptName} --update' to regenerate.`
        );
      }
    }
  }, cliOptions);
}

const getGeneratedPreambleForProject = (projectId: string) =>
  [
    '# This file is generated by the @kbn/moon package. Any manual edits will be erased!',
    `#  To extend this, write your extensions/overrides to '${MOON_CONST.EXTENSION_FILE_NAME}'`,
    `#  then regenerate this file with: 'node ${scriptName} --update --filter ${projectId}'`,
  ].join('\n');

function buildBaseProjectConfig(
  projectConfigTemplate: string,
  pkg: Package,
  kibanaJsonc: PackageManifestBaseFields
): MoonProjectConfig {
  const projectConfig: MoonProjectConfig = parse(projectConfigTemplate) as any;
  const mainOwner = Array.isArray(kibanaJsonc.owner) ? kibanaJsonc.owner[0] : kibanaJsonc.owner;
  projectConfig.id = pkg.name;
  projectConfig.layer = MOON_CONST.PROJECT_LAYER_UNKNOWN; // we currently don't make use of this
  projectConfig.owners = { defaultOwner: mainOwner };
  projectConfig.toolchains = { default: MOON_CONST.DEFAULT_TOOLCHAIN };

  projectConfig.project = {
    title: pkg.name,
    description: `Moon project for ${pkg.name}`,
    channel: '',
    owner: mainOwner,
    // Custom project metadata is now defined directly on `project` in moon v2.
    sourceRoot: pkg.normalizedRepoRelativeDir,
  };

  projectConfig.tags = [
    ...new Set(
      [
        kibanaJsonc.type,
        kibanaJsonc.type === 'plugin' ? MOON_CONST.TAG_PLUGIN : MOON_CONST.TAG_PACKAGE,
        kibanaJsonc.devOnly ? MOON_CONST.TAG_DEV : MOON_CONST.TAG_PROD,
        `${MOON_CONST.TAG_GROUP}-${kibanaJsonc.group}`,
        kibanaJsonc.visibility,
      ].filter(Boolean)
    ),
  ];

  return projectConfig;
}

interface ApplyTsConfigParams {
  tsConfigPath: string;
  includeDependencies: boolean;
  allPackageIds: string[];
}

const PACKAGE_JSON_DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

const hasSourceRoot = (obj: any): obj is { project: { sourceRoot: string } } =>
  !!obj?.project?.sourceRoot;

function applyPackageJsonSettings(projectConfig: MoonProjectConfig, packageJsonPath: string) {
  if (!fs.existsSync(packageJsonPath)) {
    return;
  }

  const packageJson = readJsonWithComments(packageJsonPath);
  const hasLocalDependencies = PACKAGE_JSON_DEPENDENCY_FIELDS.some((field) => {
    const dependencies = packageJson[field];
    return dependencies && typeof dependencies === 'object' && Object.keys(dependencies).length > 0;
  });

  if (!hasLocalDependencies) {
    return;
  }

  const toolchains =
    typeof projectConfig.toolchains === 'object' ? projectConfig.toolchains : undefined;

  projectConfig.toolchains = {
    ...toolchains,
    default: toolchains?.default ?? MOON_CONST.DEFAULT_TOOLCHAIN,
    javascript: {
      rootPackageDependenciesOnly: false,
    },
  };
}

function applyTsConfigSettings(
  projectConfig: MoonProjectConfig,
  { tsConfigPath, allPackageIds, includeDependencies }: ApplyTsConfigParams
) {
  if (!fs.existsSync(tsConfigPath)) {
    projectConfig.language = 'javascript';
    projectConfig.fileGroups = {
      src: compactFilePathsToGlobs(
        fs.globSync('**/{*.js,*.ts,*.jsx,*.tsx}', {
          exclude: (f) => f.includes('__fixtures__'),
          cwd: projectConfig.project?.sourceRoot,
        })
      ),
    };
    logger.warning(`Skipping ${projectConfig.id} - no tsconfig.json found.`);
    return;
  }

  if (!hasSourceRoot(projectConfig)) {
    logger.warning('Skipping tsconfig settings - no sourceRoot found in project config');
    return;
  }

  logger.verbose(`Reading tsconfig from ${tsConfigPath}`);
  const tsConfig = readJsonWithComments(tsConfigPath);

  const rootRelativeTypings = path.join(
    path.relative(projectConfig.project.sourceRoot, REPO_ROOT),
    'typings'
  );

  const tsInclude = (tsConfig.include || []).map((e: string) => `${e}`);
  const tsExclude = (tsConfig.exclude || []).map((e: string) => `!${e}`);
  const src: string[] = tsInclude
    .concat(tsExclude)
    .map((e: string) => e.replace(/.*typings/, rootRelativeTypings))
    .filter((e: string) => !e.startsWith('..')); // in Moon, parent-relative file deps are not allowed
  projectConfig.fileGroups = { [MOON_CONST.FILE_GROUP_SRC]: src };

  const dependencies = tsConfig.kbn_references;
  if (includeDependencies && dependencies) {
    projectConfig.dependsOn = dependencies.filter((e: string) => allPackageIds.includes(e));
  }
}

function applyJestTaskConfig(projectConfig: MoonProjectConfig) {
  if (!hasSourceRoot(projectConfig)) {
    logger.warning('Skipping jest task config - no sourceRoot found in project config');
    return;
  }

  const jestConfigName = resolveFirstExisting(
    projectConfig.project.sourceRoot,
    MOON_CONST.JEST_CONFIG_FILES
  );

  if (!jestConfigName) {
    logger.warning(
      `Could not find jest config for ${projectConfig.id} @ ${projectConfig.project.sourceRoot}`
    );
  } else {
    projectConfig.tags = (projectConfig.tags || []).concat([MOON_CONST.TAG_JEST_UNIT]);

    projectConfig.fileGroups = { ...projectConfig.fileGroups, 'jest-config': [jestConfigName] };
  }
}

type ProjectCreationResult = 'create' | 'update' | 'intact' | 'delete' | 'skip';

function writeProjectConfigFile(
  targetPath: string,
  projectConfig: MoonProjectConfig,
  {
    clear,
    update,
    dryRun,
  }: {
    clear?: boolean;
    update?: boolean;
    dryRun?: boolean;
  }
): ProjectCreationResult {
  sortObjectByKeyPriority(projectConfig, MOON_CONFIG_KEY_ORDER);

  const name = projectConfig.id;
  const preamble = getGeneratedPreambleForProject(projectConfig.id);
  const projectExists = fs.existsSync(targetPath);
  if (projectExists) {
    if (update) {
      if (dryRun) {
        if (yamlMatchesFile(targetPath, projectConfig, preamble)) {
          return 'intact';
        }
        logger.info(`Would update ${name} project configuration.`);
      } else {
        const didUpdate = writeYaml(targetPath, projectConfig, preamble);
        logger.info(`Updated ${name} project configuration.`);
        if (!didUpdate) {
          return 'intact';
        }
      }
      return 'update';
    } else if (clear) {
      if (dryRun) {
        logger.info(`Would clear ${name} project configuration.`);
      } else {
        logger.info(`Deleting ${name} project configuration @ ${targetPath}`);
        fs.unlinkSync(targetPath);
      }
      return 'delete';
    } else {
      logger.info(
        `'${MOON_CONST.MOON_CONFIG_FILE_NAME}' already exists at ${targetPath} - skipping creation.`
      );
      return 'skip';
    }
  } else {
    if (dryRun) {
      logger.info(`Would create ${name} project configuration.`);
    } else {
      logger.info(`Creating ${name} project configuration @ ${targetPath}`);
      writeYaml(targetPath, projectConfig, preamble);
    }
    return 'create';
  }
}

function applyDevOverrides(projectConfig: MoonProjectConfig, devOverridesPath: string) {
  if (!fs.existsSync(devOverridesPath)) {
    return projectConfig;
  }

  logger.info(`Applying development overrides from ${path.relative(REPO_ROOT, devOverridesPath)}`);
  try {
    const devOverrides = parse(readFile(devOverridesPath));
    return deepmerge(projectConfig, devOverrides, {
      arrayMerge: (target, source) => target.concat(source),
    });
  } catch (e) {
    logger.error(
      `Failed to apply development overrides from ${path.relative(REPO_ROOT, devOverridesPath)}: ${
        e.message
      }`
    );
    throw e;
  }
}

if (module.parent === null) {
  regenerateMoonProjects();
}
