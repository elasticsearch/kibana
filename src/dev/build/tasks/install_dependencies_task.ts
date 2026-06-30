/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { relative } from 'path';

import type { Task } from '../lib';
import { exec } from '../lib';

const YARN_EXEC = process.env.npm_execpath || 'yarn';
const NODE_EXEC = process.execPath || 'node';

export const InstallDependencies: Task = {
  description: 'Installing node_modules, including production builds of packages',

  async run(config, log, build) {
    await exec(
      log,
      YARN_EXEC,
      [
        'install',
        '--non-interactive',
        '--production',
        '--ignore-optional',
        '--pure-lockfile',
        '--prefer-offline',

        // We're using --no-bin-links to support systems that don't have symlinks.
        // This is commonly seen in shared folders on virtual machines
        '--no-bin-links',
      ],
      {
        cwd: build.resolvePath(),
      }
    );

    await exec(
      log,
      NODE_EXEC,
      [
        config.resolveFromRepo('node_modules/.bin/patch-package'),
        '--error-on-fail',
        '--patch-dir',
        relative(build.resolvePath(), config.resolveFromRepo('patches')),
      ],
      {
        cwd: build.resolvePath(),
      }
    );
  },
};
