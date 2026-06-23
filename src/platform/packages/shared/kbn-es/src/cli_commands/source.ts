/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import dedent from 'dedent';
import getopts from 'getopts';
import { ToolingLog } from '@kbn/tooling-log';
import { Cluster } from '../cluster';
import { parseTimeoutToMs } from '../utils';
import { configureMockIdpSamlRealm } from '../utils/configure_mock_idp_saml_realm';
import type { Command } from './types';

export const source: Command = {
  description: 'Build and run from source',
  help: (defaults: Record<string, any> = {}) => {
    const { license = 'trial', password = 'changeme', 'base-path': basePath } = defaults;

    return dedent`
      Options:

        --license         Run with a 'basic' or 'trial' license [default: ${license}]
        --source-path     Path to ES source [default: ${defaults['source-path']}]
        --base-path       Path containing cache/installations [default: ${basePath}]
        --install-path    Installation path, defaults to 'source' within base-path
        --data-archive    Path to zip or tarball containing an ES data directory to seed the cluster with.
        --password        Sets password for elastic user [default: ${password}]
        --password.[user] Sets password for native realm user [default: ${password}]
        --ssl             Sets up SSL on Elasticsearch
        --plugins         Comma seperated list of Elasticsearch plugins to install
        --secure-files     Comma seperated list of secure_setting_name=/path pairs
        -E                Additional key=value settings to pass to Elasticsearch
        --skip-ready-check  Disable the ready check,
        --ready-timeout   Customize the ready check timeout, in seconds or "Xm" format, defaults to 1m
        --es-log-level    Log level for ES stdout output (all, info, warn, error, silent) [default: info]

      Example:

        es snapshot --source-path=../elasticsearch -E cluster.name=test -E path.data=/tmp/es-data
    `;
  },
  run: async (defaults = {}) => {
    const log = new ToolingLog({
      level: 'info',
      writeTo: process.stdout,
    });

    const argv = process.argv.slice(2);
    const options = getopts(argv, {
      alias: {
        basePath: 'base-path',
        installPath: 'install-path',
        sourcePath: 'source-path',
        dataArchive: 'data-archive',
        skipReadyCheck: 'skip-ready-check',
        readyTimeout: 'ready-timeout',
        esLogLevel: 'es-log-level',
        secureFiles: 'secure-files',
        esArgs: 'E',
      },

      string: ['ready-timeout', 'es-log-level'],
      boolean: ['skip-ready-check'],

      default: defaults,
    });

    // Collect user-provided esArgs
    const userEsArgs: string[] = Array.isArray(options.esArgs)
      ? options.esArgs
      : options.esArgs
      ? [options.esArgs]
      : [];

    const { esArgs: samlEsArgs, resources: samlResources } = await configureMockIdpSamlRealm({
      userEsArgs,
      license: options.license,
      log,
    });
    options.esArgs = samlEsArgs;

    const cluster = new Cluster({ ssl: options.ssl });
    const { installPath } = await cluster.installSource({
      sourcePath: options.sourcePath,
      license: options.license,
      password: options.password,
      basePath: options.basePath,
      installPath: options.installPath,
      esArgs: options.esArgs,
      resources: samlResources,
    });

    if (options.dataArchive) {
      await cluster.extractDataDirectory(installPath, options.dataArchive);
    }
    if (options.plugins) {
      await cluster.installPlugins(installPath, options.plugins, options.esJavaOpts);
    }
    if (typeof options.secureFiles === 'string' && options.secureFiles) {
      const pairs = options.secureFiles.split(',').map((kv) => kv.split('=').map((v) => v.trim()));
      await cluster.configureKeystoreWithSecureSettingsFiles(installPath, pairs);
    }

    await cluster.run(installPath, {
      ...options,
      esStdoutLogLevel: options.esLogLevel || 'info',
      readyTimeout: parseTimeoutToMs(options.readyTimeout),
    });
  },
};
