/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

require('@kbn/swc-register').install();
const { getCommand } = require('./manage_secrets');
const minimist = require('minimist');

/**
 * Gets a command for working with Security Gen AI secrets either as a vault write command or environment variable.
 * By default, the command is formatted as a 'vault-write' command, but it can be overridden with the --format parameter
 * to use 'env-var' format.
 *
 * @returns {Promise<void>}
 */
async function run() {
  const argv = minimist(process.argv.slice(2));
  const format = argv.format || 'vault-write';
  const vault = argv.vault || 'ci-prod';

  if (format !== 'vault-write' && format !== 'env-var') {
    console.error('Error: format parameter must be either "vault-write" or "env-var"');
    process.exit(1);
  }

  if (format === 'vault-write' && vault !== 'siem-team' && vault !== 'ci-prod') {
    console.error('Error: vault parameter must be either "siem-team" or "ci-prod"');
    process.exit(1);
  }

  console.log(await getCommand(format, vault));
}

run();
