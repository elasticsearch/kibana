/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { run } from '../../lib/spawn.mjs';
import { moonRun } from '../../lib/moon.mjs';
import External from '../../lib/external_packages.js';

import {
  areNodeModulesPresent,
  checkYarnIntegrity,
  removeYarnIntegrityFileIfExists,
  yarnInstallDeps,
  runInstallScripts,
} from './yarn.mjs';
import { sortPackageJson } from './sort_package_json.mjs';
import { regeneratePackageMap } from './regenerate_package_map.mjs';
import { regenerateTsconfigPaths } from './regenerate_tsconfig_paths.mjs';
import { regenerateBaseTsconfig } from './regenerate_base_tsconfig.mjs';
import { discovery } from './discovery.mjs';
import { updatePackageJson } from './update_package_json.mjs';
import { bootstrapBuildkite } from './buildkite.mjs';

const IS_CI = process.env.CI?.match(/(1|true)/i);

/** @type {import('../../lib/command').Command} */
export const command = {
  name: 'bootstrap',
  intro: 'Bootstrap the Kibana repository, installs all dependencies and builds all packages',
  description: `
    This command should be run every time you checkout a new revision, or can be used to build all packages
    once after making a change locally. Package builds are cached remotely so when you don't have local
    changes build artifacts will be downloaded from the remote cache.
  `,
  flagsHelp: `
    --force-install      Use this flag to force bootstrap to install yarn dependencies. By default the
                          command will attempt to only run yarn installs when necessary, but if you manually
                          delete the node modules directory or have an issue in your node_modules directory
                          you might need to force the install manually.
    --offline            Run the installation process without consulting online resources. This is useful and
                          sometimes necessary for using bootstrap on an airplane for instance. The local caches
                          will be used exclusively, including a yarn-registry local mirror which is created and
                          maintained by successful online bootstrap executions.
    --no-validate        By default bootstrap validates the yarn.lock file to check for a handfull of
                          conditions. If you run into issues with this process locally you can disable it by
                          passing this flag.
    --no-vscode          By default bootstrap updates the .vscode directory to include commonly useful vscode
                          settings for local development. Disable this process either pass this flag or set
                          the KBN_BOOTSTRAP_NO_VSCODE=true environment variable.
    --no-prebuilt        Skip building shared webpack bundles (ui-shared-deps, monaco). Use when a
                          subsequent distribution build will rebuild them in production mode anyway.
                          Also settable via KBN_BOOTSTRAP_NO_PREBUILT=true.
    --allow-root         Required supplementary flag if you're running bootstrap as root.
    --quiet              Prevent logging more than basic success/error messages
  `,
  reportTimings: {
    group: 'scripts/kbn bootstrap',
    id: 'total',
  },
  async run({ args, log, time }) {
    const offline = args.getBooleanValue('offline') ?? false;
    if (offline) {
      process.env.CI_STATS_DISABLED = 'true';
    }
    const validate = args.getBooleanValue('validate') ?? true;
    const quiet = args.getBooleanValue('quiet') ?? false;
    const vscodeConfig =
      !IS_CI && (args.getBooleanValue('vscode') ?? !process.env.KBN_BOOTSTRAP_NO_VSCODE);
    const forceInstall = args.getBooleanValue('force-install');
    const skipPrebuilt =
      args.getBooleanValue('prebuilt') === false || !!process.env.KBN_BOOTSTRAP_NO_PREBUILT;
    const shouldInstall =
      forceInstall || !(await areNodeModulesPresent()) || !(await checkYarnIntegrity(log));

    const { packageManifestPaths, tsConfigRepoRels } = await time('discovery', discovery);

    // generate the package map and update package.json file, if necessary
    const [packages] = await Promise.all([
      time('regenerate package map', async () => {
        return await regeneratePackageMap(log, packageManifestPaths);
      }),
      time('regenerate tsconfig map', async () => {
        await regenerateTsconfigPaths(tsConfigRepoRels, log);
      }),
    ]);

    await Promise.all([
      time('update package json', async () => {
        await updatePackageJson(packages, log);
      }),
      time('regenerate tsconfig.base.json', async () => {
        await regenerateBaseTsconfig(packages, log);
      }),
      time('bootstrap .buildkite folder', async () => {
        await bootstrapBuildkite();
      }),
    ]);

    /**
     * shouldInstall = node_modules missing || forceInstall || yarn integrity check failed
     * Final install scenarios:
     * node_modules missing: full reinstall irrespective of flags.
     * node_modules present, with --force-install: the yarn integrity file will be removed, that triggers a reinstall, but it's faster than a full reinstall with some modules present
     * node_modules present, with an out-of-date yarn integrity file: yarn will do a quick install, only fixing whatever is broken, probably
     * node_modules present, with an up-to-date yarn integrity file: only an integrity check is done, and module installs are skipped
     */
    await time('install dependencies', async () => {
      if (shouldInstall) {
        if (forceInstall) {
          await removeYarnIntegrityFileIfExists();
        }
        await yarnInstallDeps(log, { offline, quiet });
      }
    });

    if (skipPrebuilt) {
      log.info('skipping pre-built webpack bundles (--no-prebuilt)');
    }

    await Promise.all([
      skipPrebuilt
        ? undefined
        : time('prepare webpack bundles for packages', async () => {
            log.info('pre-build webpack bundles');
            await moonRun([':build-webpack'], {
              pipe: !quiet,
              quiet,
              noCache: forceInstall,
            });
            log.success(
              'relevant versions extracted for packages and shared webpack bundles built'
            );
          }),
      shouldInstall
        ? time('run install scripts', async () => {
            await runInstallScripts(log, { quiet });
          })
        : undefined,
    ]);

    await time('sort package json', async () => {
      await sortPackageJson(log);
    });

    await Promise.all([
      validate
        ? time('validate dependencies', async () => {
            // now that deps are installed we can import `@kbn/yarn-lock-validator`
            const { readYarnLock, validateDependencies } = External['@kbn/yarn-lock-validator']();
            await validateDependencies(log, await readYarnLock());
          })
        : undefined,
      vscodeConfig
        ? time('update vscode config', async () => {
            // Update vscode settings
            await run('node', ['scripts/update_vscode_config']);
            log.success('vscode config updated');
          })
        : undefined,
    ]);
  },
};
